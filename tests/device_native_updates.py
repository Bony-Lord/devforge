"""Real native formatting/settings and encoding I/O on a disposable input-check-* project."""
import json, pathlib, subprocess, sys, time
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from device_cdp import Device, ADB

COMMON=r'''
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const model=forge.active.model,uri=model.uri.toString(),id='primary';
async function reset(marked){await NativeEditing.sync();const at=marked.indexOf('|'),text=marked.replace('|','');model.setValue(text);await NativeEditing.sync();const p=model.getPositionAt(at<0?text.length:at);forge.editor.setPosition(p);await native('editorSelection',{id,line:p.lineNumber,column:p.column});}
async function visible(){return(await native('editorSnapshot',{uri}))[0].text;}
async function formatted(){for(let n=0;n<160;n++){if(NativeEditing.lastOnTypeResult?.uri===uri&&!NativeEditing.formatJobs.has(uri))return NativeEditing.lastOnTypeResult;await sleep(25);}throw Error('On-type formatter timed out');}
'''

def run():
    d=Device();checks=[]
    def check(name,passed,evidence):
        checks.append({'test':name,'passed':bool(passed),'evidence':evidence});print(('PASS ' if passed else 'FAIL ')+name,flush=True)
    def evaluate(code):return d.evaluate('(async()=>{'+COMMON+code+'})()')
    try:
        assert d.evaluate("forge.state.project.startsWith('input-check-')"),'Use an isolated input-check-* project'
        d.evaluate("(async()=>{if(forge.secondaryEditor)forge.unsplitEditor();forge.editor=forge.primaryEditor;await forge.openFile(forge.state.root+'/main.cpp');await NativeEditing.sync();await forge.changeSettings({indentMode:'formatter',smartFormatOnClose:true});})()")
        result=evaluate(r'''
await reset('int main(){\n    int value=  1;\n    if(value){\n      value ++;\n          |}\n}\n');
NativeEditing.lastOnTypeResult=null;await native('editorAction',{id,action:'}'});const immediate=await visible();const result=await formatted();const text=model.getValue();
return{result,text,immediate,nativeMatches:await visible()===text,cursor:forge.editor.getPosition()};
''')
        check('Completing a brace dedents and runs the actual block formatter',result['result']['status']=='applied' and 'if (value) {\n        value++;\n    }' in result['text'] and result['nativeMatches'],result)
        result=evaluate(r'''
await reset('void f(){\n int x= 1;\n    |}\n');NativeEditing.lastOnTypeResult=null;
const original=window.native;let release,requests=[];
window.native=(op,data={})=>{if(op==='formatterOnType'){requests.push(data.text);return original(op,data).then(value=>requests.length===1?new Promise(resolve=>{release=()=>resolve(value);}):value);}return original(op,data);};
try{await native('editorAction',{id,action:'}'});for(let n=0;n<160&&!release;n++)await sleep(20);if(!release)throw Error('No real formatter reply to delay');
await native('editorAction',{id,action:' // fresh_input'});await NativeEditing.sync();release();await formatted();const text=model.getValue();return{requests:requests.length,text,nativeMatches:await visible()===text};
}finally{window.native=original;}
''')
        check('A late real formatter result preserves newly typed text',result['nativeMatches'] and result['requests']>=2 and result['text'].count('fresh_input')==1,result)
        result=evaluate(r'''
await reset('void f(){int x= 1;}|');const text=await visible(),revision=NativeEditing.revisions.get(uri),expected=text.length;
const result=await native('formatterOnType',{path:model.uri.fsPath,text,firstLine:1,lastLine:1,cursor:expected});await native('editorSelection',{id,line:1,column:1});
const accepted=await native('editorFormatEdits',{id,uri,revision,expectedStart:expected,expectedEnd:expected,edits:[{start:0,end:text.length,text:result.text}],cursor:result.cursor});return{accepted,unchanged:await visible()===text};
''')
        check('Native caret guard rejects formatting after a cursor move',not result['accepted'] and result['unchanged'],result)
        result=evaluate(r'''
await forge.changeSettings({indentMode:'tabs',indentWidth:4,tabWidth:4});await reset('|');await native('editorAction',{id,action:'tab'});return{text:await visible(),options:await native('formatterTypingConfig',{path:model.uri.fsPath})};
''')
        check('Tab accessory uses the selected real tab mode',result['text']=='\t' and result['options']['tabs'],result)
        result=evaluate(r'''
await forge.changeSettings({indentMode:'spaces',indentWidth:2,tabWidth:8});await reset('|');await native('editorAction',{id,action:'tab'});const text=await visible();
const preview=await native('formatDocument',{path:model.uri.fsPath,text:'void f(){\nint x=1;\n}\n'});return{text,formatted:preview.text};
''')
        check('Space mode and clang-format share the selected indentation',result['text']=='  ' and '\n  int x = 1;' in result['formatted'] and '\t' not in result['formatted'],result)
        result=d.evaluate(r'''(async()=>{
const path=forge.state.root+'/encoding-'+Date.now()+'.cpp',text='// Привет, мир!\r\nint value = 1;\r\n';
await native('newFile',{path,text});await forge.refreshTree();await forge.openFile(path);await NativeEditing.sync();
const task=forge.fileEncoding();for(let n=0;n<80&&!document.querySelector('#encodingDialog').open;n++)await new Promise(r=>setTimeout(r,10));
document.querySelector('#encodingChoice').value='windows-1251';document.querySelector('#encodingConvert').click();await task;return{path,text,encoding:forge.active.encoding,status:document.querySelector('#encodingStatus').textContent};})()''')
        path=result['path'];expected=result['text']
        raw=subprocess.check_output([ADB,'exec-out','run-as','com.forgex','cat',path])
        check('Encoding dialog writes actual Windows-1251 bytes',raw==expected.encode('cp1251') and result['encoding']=='windows-1251' and result['status']=='windows-1251',{'encoding':result['encoding'],'bytes':len(raw)})
        result=d.evaluate(r'''(async()=>{const doc=forge.active,uri=doc.model.uri.toString();let rejected=false;try{await native('convertEncoding',{path:doc.path,text:'// Привет 🙂',encoding:'windows-1251',revision:NativeEditing.revisions.get(uri)});}catch(error){rejected=String(error).includes('Cannot encode');}return{rejected,encoding:(await native('read',{path:doc.path})).encoding};})()''')
        raw_after=subprocess.check_output([ADB,'exec-out','run-as','com.forgex','cat',path])
        check('Unrepresentable characters do not overwrite file bytes or encoding',result['rejected'] and raw==raw_after and result['encoding']=='windows-1251',result)
        result=d.evaluate(r'''(async()=>{const doc=forge.active,path=doc.path,to=path.replace('.cpp','-renamed.cpp'),text=doc.model.getValue();await forge.closeTab(doc);await native('renameFile',{path,to});await forge.refreshTree();await forge.openFile(to);await NativeEditing.sync();return{path:to,text:forge.active.model.getValue(),encoding:forge.active.encoding,expected:text};})()''')
        check('File rename preserves decoding preference and source text',result['encoding']=='windows-1251' and result['text']==result['expected'],{'encoding':result['encoding'],'text':result['text']})
        path=result['path']
        for encoding,python_encoding,bom in [('UTF-8-BOM','utf-8',b'\xef\xbb\xbf'),('UTF-16LE','utf-16-le',b'\xff\xfe'),('UTF-16BE','utf-16-be',b'\xfe\xff')]:
            result=d.evaluate("(async()=>{const doc=forge.active,uri=doc.model.uri.toString(),text=doc.model.getValue();await NativeEditing.sync();const ok=await native('convertEncoding',{path:doc.path,text,revision:NativeEditing.revisions.get(uri),encoding:"+json.dumps(encoding)+"});const read=await native('read',{path:doc.path});doc.encoding=read.encoding;return{ok,text,read:read.text,encoding:read.encoding};})()")
            raw=subprocess.check_output([ADB,'exec-out','run-as','com.forgex','cat',path])
            check('Real '+encoding+' BOM and text round trip',result['ok'] and result['text']==result['read'] and raw==bom+result['text'].encode(python_encoding),{'encoding':result['encoding'],'bytes':len(raw)})
        result=d.evaluate(r"""(async()=>{const model=forge.active.model,uri=model.uri.toString();await native('editorSelection',{id:'primary',line:1,column:1});await native('editorAction',{id:'primary',action:'// pasted\n// second\r\n'});await NativeEditing.sync();const text=(await native('editorSnapshot',{uri}))[0].text;return{nativeMatches:text===model.getValue(),onlyCRLF:!text.replaceAll('\r\n','').includes('\n'),prefix:text.slice(0,28),eol:model.getEOL()};})()""")
        check('Mixed-line-ending native input stays synchronized with the CRLF model',result['nativeMatches'] and result['onlyCRLF'] and result['eol']=='\r\n',result)
        d.evaluate("(async()=>{await forge.openFile(forge.state.root+'/main.cpp');await NativeEditing.sync();})()")
        result=evaluate(r"""
for(let n=0;n<24;n++){model.setValue(('// rapid snapshot\n').repeat(n%2?250:2));await NativeEditing.sync();}
model.setValue('static int unused_rapid_function() { return 1; }\nint main() { int unused_rapid_variable = 5; return 0; }\n');await NativeEditing.sync();
for(let n=0;n<160;n++){if(forge.diagnosticMap.get(uri)?.diagnostics.filter(d=>d.tags?.includes(1)).length>=2)break;await sleep(25);}
const main=model.uri.fsPath;for(let n=0;n<5;n++){await forge.openFile(forge.state.root+'/CMakeLists.txt');await NativeEditing.sync();await forge.openFile(main);await NativeEditing.sync();}
return{nativeMatches:await visible()===model.getValue(),lines:model.getLineCount(),unused:forge.diagnosticMap.get(uri)?.diagnostics.filter(d=>d.tags?.includes(1)).length||0};
""")
        check('Rapid line-count changes and repeated tab switches retain the live buffer',result['nativeMatches'] and result['unused']>=2,result)
    finally:
        try:d.evaluate("(async()=>{await forge.changeSettings({indentMode:'formatter'});})()")
        except Exception:pass
        d.close();report={'device':subprocess.check_output([ADB,'shell','getprop','ro.product.model'],text=True).strip()+' / Android '+subprocess.check_output([ADB,'shell','getprop','ro.build.version.release'],text=True).strip(),'scope':'Actual native editor operations, on-device clang-format, settings UI handlers and bytes read back with ADB','checks':checks,'passed':sum(c['passed'] for c in checks),'total':len(checks)}
        (ROOT/(sys.argv[1] if len(sys.argv)>1 else 'verification-native-updates.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if not all(c['passed'] for c in checks):raise AssertionError('Some native update checks failed')

if __name__=='__main__':run()
