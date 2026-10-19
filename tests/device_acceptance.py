"""Real-device acceptance. Requires the debug APK and authorized ADB.

Creates a separate disposable verification project; never edits user projects.
Reports actual native compiler/LSP results, not mocks.
"""
import json, pathlib, sys, time, traceback
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'tools'))
from device_cdp import Device

ROOT=pathlib.Path(__file__).resolve().parents[1]
d=Device();results=[]
def js(code):
    # Python fixtures contain readable newline escapes inside JS string literals.
    # Encode those literal newlines before passing source to Runtime.evaluate.
    quote=None;escaped=False;out=[]
    for char in code:
        if quote and char=='\n' and quote!='`':out.append('\\n');continue
        out.append(char)
        if escaped:escaped=False;continue
        if char=='\\':escaped=True;continue
        if quote:
            if char==quote:quote=None
        elif char in ['\'', '"', '`']:quote=char
    return d.evaluate(''.join(out))
def test(name,code,check=lambda r:bool(r)):
    start=time.monotonic()
    try:
        value=js(code)
        assert check(value),str(value)[:2500]
        results.append({'test':name,'passed':True,'seconds':round(time.monotonic()-start,2),'evidence':value})
        print('PASS',name,flush=True)
        return value
    except Exception as e:
        results.append({'test':name,'passed':False,'seconds':round(time.monotonic()-start,2),'error':str(e)})
        print('FAIL',name,str(e)[:800],flush=True)
        return None

try:
    test('native tools identify themselves',"native('probe')",lambda r:'GCC' in r['g++-15'] and 'clangd version' in r['clangd'])
    name='verify-'+str(int(time.time()))
    setup="""(async()=>{
      window.acceptance={originalProject:forge.state.project,events:[],exits:[],name:NAME};
      onNative('output',e=>acceptance.events.push(e));onNative('exit',e=>acceptance.exits.push(e));
      await native('newProject',{name:NAME,language:'cpp'});await forge.switchProject(NAME);
      window.setCode=async(name,text)=>{const path=forge.state.root+'/'+name;try{await native('newFile',{path,text});}catch(e){if(!e.message.includes('уже существует'))throw e;const model=await forge.ensureModel(path);model.setValue(text);await forge.saveAll();}await forge.refreshTree();return forge.openFile(path);};
      window.nativeBuild=async(compiler='gcc',cppStandard='c++20',cStandard='c17',mode='file')=>native('build',{path:forge.active.path,options:{...forge.settings,compiler,cppStandard,cStandard},mode,id:'test-build-'+Date.now()});
      window.waitFor=async(fn,ms=15000)=>{const start=Date.now();while(Date.now()-start<ms){const r=fn();if(r)return r;await new Promise(r=>setTimeout(r,120));}throw new Error('Condition timeout');};
      await waitFor(()=>forge.lsp.ready);return {name:forge.state.project,root:forge.state.root};
    })()""".replace('NAME',json.dumps(name))
    test('isolated project with live clangd',setup,lambda r:r['name']==name)
    test('GCC C++20 compilation',"(async()=>{acceptance.cpp=await nativeBuild();return acceptance.cpp;})()",lambda r:r['code']==0)
    test('native C++ execution',"(async()=>{const id='accept-cpp';await native('run',{executable:acceptance.cpp.executable,id});await waitFor(()=>acceptance.exits.find(e=>e.id===id));return{output:acceptance.events.filter(e=>e.id===id).map(e=>e.text).join(''),exit:acceptance.exits.find(e=>e.id===id)};})()",lambda r:'Sum = 15' in r['output'] and r['exit']['code']==0)
    test('Clang C++20 compilation',"nativeBuild('clang')",lambda r:r['code']==0)
    c_source='#include <stdio.h>\nint main(int argc, char **argv) { int x=0; printf("ready\\n"); fflush(stdout); if (scanf("%d", &x) != 1) return 3; printf("%d %s\\n",x*6,argc>1?argv[1]:"none"); fprintf(stderr,"stderr\\n"); return 7; }\n'
    test('C17 compilation with GCC',"(async()=>{await setCode('input.c',"+json.dumps(c_source)+");acceptance.c=await nativeBuild('gcc');return acceptance.c;})()",lambda r:r['code']==0)
    test('stdin, arguments, stderr and exit code',"(async()=>{const id='accept-stdin';await native('run',{executable:acceptance.c.executable,args:['argument'],id});await waitFor(()=>acceptance.events.some(e=>e.id===id&&e.text.includes('ready')));await native('stdin',{text:'7\n'});await waitFor(()=>acceptance.exits.find(e=>e.id===id));return{output:acceptance.events.filter(e=>e.id===id),exit:acceptance.exits.find(e=>e.id===id)};})()",lambda r:'42 argument' in ''.join(e['text'] for e in r['output']) and any(e['stream']=='stderr' for e in r['output']) and r['exit']['code']==7)
    test('C17 compilation with Clang',"nativeBuild('clang')",lambda r:r['code']==0)
    test('C++20 standard accepted',"(async()=>{await setCode('standard.cpp','template<class T> concept Number = requires(T x) { x + 1; };\nint main() { static_assert(Number<int>); return 0; }\n');return nativeBuild('gcc','c++20');})()",lambda r:r['code']==0)
    test('same source rejected under C++17',"nativeBuild('gcc','c++17')",lambda r:r['code']!=0)
    test('live unknown method diagnostic',"(async()=>{await setCode('diagnostics.cpp','#include <vector>\nint main() {\n int unused_local = 42;\n std::vector<int> values;\n values.unknown_method();\n return 0;\n}\n');const uri=forge.active.model.uri.toString();await waitFor(()=>{const p=forge.diagnosticMap.get(uri);return p?.version===forge.active.model.getVersionId()&&p.diagnostics.some(d=>d.message.includes(\"unknown_method\"));});return forge.diagnosticMap.get(uri);})()",lambda r:any('unknown_method' in e['message'] and e['severity']==1 for e in r['diagnostics']))
    test('diagnostics rendered as editor markers',"monaco.editor.getModelMarkers({owner:'clangd',resource:forge.active.model.uri}).map(m=>({message:m.message,severity:m.severity,tags:m.tags}))",lambda r:any(m['severity']==8 for m in r))
    test('completion discovers real vector methods',"(async()=>{const model=forge.active.model;const p={lineNumber:5,column:9};const r=await forge.lsp.request('textDocument/completion',forge.lsp.at(model,p));return(Array.isArray(r)?r:r.items).map(x=>x.filterText||x.label);})()",lambda r:any('push_back' in x for x in r) and any('size' in x for x in r))
    test('unused local warning and unnecessary tag',"(async()=>{const model=forge.active.model;model.setValue('int main() { int unused_local = 42; return 0; }\n');forge.lsp.sync(model);const uri=model.uri.toString();await waitFor(()=>{const p=forge.diagnosticMap.get(uri);return p?.version===model.getVersionId()&&p.diagnostics.some(d=>d.message.includes('unused_local'));});return forge.diagnosticMap.get(uri);})()",lambda r:any('unused_local' in e['message'] and e['severity']==2 for e in r['diagnostics']))
    test('fixed source clears live diagnostics',"(async()=>{const model=forge.active.model;model.setValue('#include <vector>\nint main() {\n std::vector<int> values;\n values.push_back(42);\n return values.front() == 42 ? 0 : 1;\n}\n');forge.lsp.sync(model);const uri=model.uri.toString();await waitFor(()=>{const p=forge.diagnosticMap.get(uri);return p?.version===model.getVersionId()&&p.diagnostics.length===0;});return forge.diagnosticMap.get(uri);})()",lambda r:r['diagnostics']==[])
    test('hover and semantic tokens',"(async()=>{const model=forge.active.model;const hover=await forge.lsp.request('textDocument/hover',forge.lsp.at(model,{lineNumber:4,column:4}));const tokens=await forge.lsp.request('textDocument/semanticTokens/full',{textDocument:forge.lsp.doc(model)});return{hover,tokens:tokens.data.length};})()",lambda r:r['hover'] and r['tokens']>0)
    test('rename, definition and references',"(async()=>{await setCode('rename.cpp','int twice(int value) { return value * 2; }\nint main() { return twice(4) == 8 ? 0 : 1; }\n');await new Promise(r=>setTimeout(r,700));const model=forge.active.model,at=forge.lsp.at(model,{lineNumber:2,column:23});const definition=await forge.lsp.request('textDocument/definition',at);const refs=await forge.lsp.request('textDocument/references',{...at,context:{includeDeclaration:true}});const edit=await forge.lsp.request('textDocument/rename',{...at,newName:'double_value'});await forge.applyEdit(edit);return{definition,references:refs.length,text:model.getValue()};})()",lambda r:r['definition'] and r['references']>=2 and r['text'].count('double_value')==2)
    test('formatting from clang-format engine',"(async()=>{const model=forge.active.model;model.setValue('int main(){int n=1;return n;}\n');const edits=await forge.lsp.request('textDocument/formatting',{textDocument:forge.lsp.doc(model),options:{tabSize:4,insertSpaces:true}});model.pushEditOperations([],forge.lsp.textEdits(edits),()=>null);return model.getValue();})()",lambda r:'int main() {' in r and '\n' in r.strip())
    test('atomic save and local history',"(async()=>{await forge.saveAll();const first=forge.active.model.getValue();forge.active.model.setValue(first+'// history checkpoint\n');await forge.saveAll();const history=await native('history',{path:forge.active.path});return{saved:(await native('read',{path:forge.active.path})).text,history:history.map(v=>v.text)};})()",lambda r:'history checkpoint' in r['saved'] and len(r['history'])>0)
    test('private files cannot escape project boundary',"(async()=>{try{await native('write',{path:forge.state.usr+'/bin/protected',text:'bad'});return false;}catch(e){return e.message;}})()",lambda r:isinstance(r,str) and 'Путь' in r)
    test('CMake multiple translation units',"(async()=>{await setCode('math.hpp','int answer();\n');await setCode('math.cpp','#include \"math.hpp\"\nint answer() { return 42; }\n');await setCode('CMakeLists.txt','cmake_minimum_required(VERSION 3.16)\nproject(acceptance LANGUAGES CXX)\nadd_executable(app cmake_main.cpp math.cpp)\n');await setCode('cmake_main.cpp','#include <iostream>\n#include \"math.hpp\"\nint main() { std::cout << answer() << std::endl; return 0; }\n');acceptance.cmake=await nativeBuild('gcc','c++20','c17','cmake');return{...acceptance.cmake,output:acceptance.events.filter(e=>e.stream==='build').slice(-15).map(e=>e.text).join('')};})()",lambda r:r['code']==0 and r['exists'])
    if results[-1]['passed']:
        test('CMake executable runs',"(async()=>{const id='accept-cmake';await native('run',{executable:acceptance.cmake.executable,id});await waitFor(()=>acceptance.exits.find(e=>e.id===id));return{output:acceptance.events.filter(e=>e.id===id).map(e=>e.text).join(''),exit:acceptance.exits.find(e=>e.id===id)};})()",lambda r:'42' in r['output'] and r['exit']['code']==0)
    test('stop kills a running program',"(async()=>{await setCode('loop.c','int main(void) { for (;;) {} }\n');const b=await nativeBuild();if(b.code!==0)return b;const id='accept-stop';await native('run',{executable:b.executable,id});await native('stop');await waitFor(()=>acceptance.exits.find(e=>e.id===id));return acceptance.exits.find(e=>e.id===id);})()",lambda r:r.get('code',0)!=0)
    test('terminal uses real local GCC',"(async()=>{const id='accept-shell';await native('shell',{command:'g++-15 --version',id});await waitFor(()=>acceptance.exits.find(e=>e.id===id));return acceptance.events.filter(e=>e.id===id).map(e=>e.text).join('');})()",lambda r:'GCC' in r and '15.2.0' in r)
    js("forge.switchProject(acceptance.originalProject)")
finally:
    report={'device':'realme RMX3951','android':'16','abi':'arm64-v8a','testProject':locals().get('name'),'results':results,'passed':sum(t['passed'] for t in results),'total':len(results),'limitations':['Physical tablet and external keyboard not available; responsive layout and keyboard event checks are separate.','Ordinary shell has no full-screen PTY; debugger PTY is covered by device_tools_acceptance.py.']}
    (ROOT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'passed':report['passed'],'total':report['total']},ensure_ascii=False),flush=True)
    d.close()
