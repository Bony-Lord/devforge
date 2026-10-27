"""On-device WebView pointers + native Sora/clangd regression, isolated fixture only."""
import json,pathlib,sys,time,os,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from device_cdp import Device,ADB

def run():
 d=Device();checks=[]
 def js(code):return d.evaluate(code)
 def check(name,value,passed=True):
  checks.append({'test':name,'passed':bool(passed),'evidence':value});print(('PASS 'if passed else'FAIL ')+name,flush=True)
  assert passed,str(value)[:1200]
 def wait(code,seconds=12):
  end=time.monotonic()+seconds
  while True:
   value=js(code)
   if value and value!={'type':'undefined'}:return value
   if time.monotonic()>end:raise AssertionError('Timeout: '+code[:150])
   time.sleep(.05)
 def pointer(x,y,kind='mousePressed',buttons=1,count=1):
  return d.call('Input.dispatchMouseEvent',{'type':kind,'x':x,'y':y,'button':'left'if kind!='mouseMoved'else'none','buttons':buttons,'clickCount':count})
 def tap(x,y):
  d.call('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]});d.call('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});time.sleep(.35)
 def click(selector):
  p=js('(()=>{const b=document.querySelector('+json.dumps(selector)+').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};})()');tap(p['x'],p['y'])
 def outside(dialog):return js('(()=>{const b=document.querySelector('+json.dumps(dialog)+').getBoundingClientRect();return{x:b.left>12?5:innerWidth-5,y:b.top>12?5:innerHeight-5};})()')
 def analysis():return js('native("editorTestAnalysisState")')
 def diagnostics(minimum=1,unused=0):
  return wait('(async()=>{const m=forge.active.model,s=await native("editorTestAnalysisState");return forge.diagnosticMap.get(m.uri.toString())?.version===m.getVersionId()&&s.stylesCurrent&&s.analysisRevision===s.revision&&s.diagnostics>='+str(minimum)+'&&s.paintedUnused>='+str(unused)+'?s:false;})()')
 try:
  assert js("forge.state.project==='input-check-workspace-034-20261027'")
  js("(async()=>{forge.windows.reset();forge.windows.joinDocuments();await forge.changeSettings({smartFormatOnClose:true,semanticHighlighting:true,inlayHints:true,codeScale:100,uiScale:100,keyboardPrimary:'system'});await forge.openFile(forge.state.root+'/main.cpp');})()")
  js("(async()=>{const m=await forge.ensureModel(forge.state.root+'/CMakeLists.txt');m.setValue('cmake_minimum_required(VERSION 3.16)\\nproject(workspace_probe LANGUAGES CXX)\\nadd_executable(app main.cpp)\\n');await forge.saveDoc(forge.docs.get(m.uri.toString()));await forge.refreshCMakeStatus();})()")
  fixture='static int unused_function(){return 1;}\nint main(){int unused_variable=2;return 0;}\n'
  js("(async()=>{await forge.openFile(forge.state.root+'/main.cpp');forge.active.model.setValue("+json.dumps(fixture)+");await NativeEditing.sync();})()")
  value=diagnostics(2,2);check('Actual native diagnostics and grey unused spans before formatting',value)
  js("(async()=>{const m=forge.active.model;const p=m.getPositionAt(m.getValue().indexOf('return 0'));await native('editorSelection',{id:'primary',line:p.lineNumber,column:p.column});await NativeEditing.sync();window.caretBeforeFormat=forge.editor.getPosition();await forge.formatCurrentDocument();})()")
  value=diagnostics(2,2);check('Whole-document formatting retains actual native underlines and grey spans',value)
  value=js("({position:forge.editor.getPosition(),line:forge.active.model.getLineContent(forge.editor.getPosition().lineNumber),end:forge.active.model.getLineCount()})");check('Formatting cursor stays near original code instead of document end',value,'return 0'in value['line'])
  js("(async()=>{await native('editorAction',{id:'primary',action:'undo'});await NativeEditing.sync();})()");check('Native undo restores current diagnostic spans',diagnostics(2,2))
  js("(async()=>{await native('editorAction',{id:'primary',action:'redo'});await NativeEditing.sync();})()");check('Native redo refreshes current diagnostic spans',diagnostics(2,2))
  js("(async()=>{for(let n=0;n<8;n++){await forge.openFile(forge.state.root+'/CMakeLists.txt');await forge.openFile(forge.state.root+'/main.cpp');}await NativeEditing.sync();})()");check('Repeated CMake/C++ tab changes retain diagnostics and actual grey paint',diagnostics(2,2))
  js("(async()=>{const m=forge.active.model,p=m.getPositionAt(m.getValue().indexOf('return 0')+7);m.pushEditOperations([],[{range:monaco.Range.fromPositions(p,{lineNumber:p.lineNumber,column:p.column+1}),text:'missing_compact_probe()'}],()=>null);await NativeEditing.sync();await forge.formatCurrentDocument();})()");value=diagnostics();check('A new unknown function is diagnosed after formatting and previous tab changes',{'native':value,'errors':js("forge.diagnosticMap.get(forge.active.model.uri.toString()).diagnostics.map(d=>d.message)")},js("forge.diagnosticMap.get(forge.active.model.uri.toString()).diagnostics.some(d=>d.message.includes('missing_compact_probe'))"))
  js("(async()=>{const m=forge.active.model;m.setValue(m.getValue().replace('missing_compact_probe()','0'));await NativeEditing.sync();await forge.formatCurrentDocument();})()");value=diagnostics(2,2);check('Fixing an error after formatting clears obsolete native diagnostics',value,js("!forge.diagnosticMap.get(forge.active.model.uri.toString()).diagnostics.some(d=>d.severity===1)")and value['diagnostics']==2)
  value=js("(async()=>{const m=forge.active.model,v=m.getVersionId();await forge.formatCurrentDocument();return{before:v,after:m.getVersionId()};})()");check('Formatting an already formatted document avoids a no-op revision',value,value['before']==value['after'])
  value=js(r'''(async()=>{const original=window.native;let release,entered=false;window.native=(op,data)=>{const p=original(op,data);return op==='formatDocument'?p.then(result=>new Promise(resolve=>{release=()=>resolve(result);entered=true;})):p;};try{const m=forge.active.model;m.setValue('static int unused_function(){return 1;}\nint main(){int unused_variable=2;return 0;}\n');await NativeEditing.sync();const task=forge.formatCurrentDocument();while(!entered)await new Promise(r=>setTimeout(r,10));await forge.openFile(forge.state.root+'/CMakeLists.txt');release();await task;const retained=forge.active.path.endsWith('/CMakeLists.txt')&&forge.editor.getModel()===forge.active.model;await forge.openFile(forge.state.root+'/main.cpp');return{retained,text:m.getValue(),native:(await native('editorSnapshot',{uri:m.uri.toString()}))[0].text};}finally{window.native=original;}})()''');check('Late formatting of previous tab preserves current CMake focus and formatted buffer',value,value['retained']and value['text']==value['native']and'    return 0;'in value['text']);check('Returning to a background-formatted file restores grey spans',diagnostics(2,2))
 finally:
  try:js("forge.saveAll();true")
  except Exception:pass
  d.close();report={'checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)}
  (ROOT/'verification-analysis-034.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':report['passed'],'total':report['total']}),flush=True)

if __name__=='__main__':run()
