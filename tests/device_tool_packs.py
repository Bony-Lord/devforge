import pathlib,sys,json,time
root=pathlib.Path.cwd();sys.path.insert(0,str(root/'tools'));from device_cdp import Device
d=Device();d.ws.settimeout(360);checks=[]
def check(name,code,predicate=bool):
 value=d.evaluate(code);passed=predicate(value);checks.append({'test':name,'passed':passed,'evidence':value});print('PASS' if passed else 'FAIL',name,flush=True);assert passed,str(value)[:500]
try:
 assert d.evaluate("forge.state.project.startsWith('input-check-')")
 check('Fresh minimal runtime starts with all four optional packs absent',"native('toolPacks').then(s=>s.packs.map(p=>({id:p.id,installed:p.installed})))",lambda v:len(v)==4 and all(not p['installed']for p in v))
 check('GCC compiles and runs libc++ vector with only the base installed',r'''(async()=>{const m=forge.active.model;m.setValue('#include <iostream>\n#include <vector>\nint main(){std::vector<int> values{1,2,3};for(auto& x : values)std::cout<<x<<" ";}\n');await forge.saveAll();const build=await native('build',{path:forge.active.path,mode:'file',options:{...forge.settings,compiler:'gcc'},id:'minimal-gcc'});let output='',exit=null;const stopOut=onNative('output',p=>{if(p.id==='minimal-run')output+=p.text;}),stopExit=onNative('exit',p=>{if(p.id==='minimal-run')exit=p.code;});try{await native('run',{executable:build.executable,id:'minimal-run',args:[]});for(let n=0;n<200&&exit===null;n++)await new Promise(r=>setTimeout(r,20));return {build:build.code,output,exit};}finally{stopOut();stopExit();}})()''',lambda v:v['build']==0 and v['exit']==0 and '1 2 3'in v['output'])
 check('Actual CMake/Ninja configure and build work in the base without LLVM',r'''(async()=>{const r=await native('build',{path:forge.active.path,mode:'cmake',options:{...forge.settings,compiler:'gcc'},id:'minimal-cmake'});return{code:r.code,exists:r.exists};})()''',lambda v:v['code']==0 and v['exists'])
 for ident,probe in [('analysis','clangd'),('clang','clang++'),('debugger','gdb'),('git','git')]:
  start=time.monotonic();print('Downloading and installing',ident,flush=True)
  check('Real HTTPS download, SHA-256 verification and installation: '+ident,"(async()=>{await native('toolPackInstall',{id:"+json.dumps(ident)+"});const state=await native('toolPacks');return{installed:state.packs.find(p=>p.id==="+json.dumps(ident)+").installed,probe:(await native('probe'))["+json.dumps(probe)+"]};})()",lambda v:v['installed']and'ОШИБКА'not in v['probe'])
  checks[-1]['seconds']=round(time.monotonic()-start,1)
 check('Dependency protection rejects removing analysis while Clang requires it',r'''(async()=>{let rejected=false;try{await native('toolPackRemove',{id:'analysis'});}catch(e){rejected=String(e).includes('required');}return rejected;})()''')
 check('Clang can be removed while preserving GCC, then downloaded again',r'''(async()=>{await native('toolPackRemove',{id:'clang'});const absent=!(await native('toolPacks')).packs.find(p=>p.id==='clang').installed;const gcc=(await native('probe'))['g++-15'];await native('toolPackInstall',{id:'clang'});return{absent,gcc,restored:(await native('toolPacks')).packs.find(p=>p.id==='clang').installed};})()''',lambda v:v['absent']and v['restored']and'GCC'in v['gcc'])
 check('Downloaded analysis and libc++ pretty-printer runtime start normally',r'''(async()=>{forge.toolPackState=await native('toolPacks');await forge.lsp.start();for(let n=0;n<200&&!forge.lsp.ready;n++)await new Promise(r=>setTimeout(r,30));return forge.lsp.ready;})()''')
finally:
 d.close();(root/'verification-tool-packs.json').write_text(json.dumps({'device':'Xiaomi Pad 6 / Android 14 / clean runtime directory','checks':checks,'passed':sum(v['passed']for v in checks),'total':len(checks)},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
