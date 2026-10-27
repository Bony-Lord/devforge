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
  assert js("forge.state.project==='input-check-compact-20261027'")
  js("(async()=>{forge.toggleMainMenu(false);await forge.changeSettings({smartFormatOnClose:true,semanticHighlighting:true,inlayHints:true,codeScale:100,uiScale:100});forge.showSide('project');forge.showPanel('console');})()")
  time.sleep(.2)
  value=js("(()=>{const h=document.querySelector('.topbar').getBoundingClientRect(),t=document.querySelector('.toolbar').getBoundingClientRect(),p=document.querySelector('#panel').getBoundingClientRect(),s=document.querySelector('#sidebar').getBoundingClientRect();return{header:h.height,toolbarInside:t.top>=h.top&&t.bottom<=h.bottom,panelWidth:p.width,viewport:innerWidth,sidebarBottom:s.bottom,panelTop:p.top,icons:['buildButton','runButton','debugButton'].every(id=>{const b=document.getElementById(id);return b.querySelector('svg')&&b.getAttribute('aria-label')&&getComputedStyle(b.querySelector('label')).display==='none';})};})()")
  check('One 42px header, icon actions and full-width console above which project tree ends',value,value['header']==42 and value['toolbarInside']and abs(value['panelWidth']-value['viewport'])<1 and value['sidebarBottom']<value['panelTop']and value['icons'])
  before=js("document.querySelector('#editorArea').getBoundingClientRect().toJSON()")
  click('#mainMenuToggle');value=js("({menu:!document.querySelector('#mainMenus').classList.contains('hidden'),toolbar:document.querySelector('#mainToolbar').classList.contains('hidden'),editor:document.querySelector('#editorArea').getBoundingClientRect().toJSON()})")
  check('Menu replaces toolbar without moving code',value,value['menu']and value['toolbar']and value['editor']==before)
  click('#refreshButton');check('Touch outside main menu restores tools',js("document.querySelector('#mainMenus').classList.contains('hidden')"))
  click('#mainMenuToggle');click('[data-menu=file]');click('#menu button');check('Choosing New project closes main menu and retains newly opened anchored form',js("!!StudioPopover.current&&document.querySelector('#mainMenus').classList.contains('hidden')"));js('StudioPopover.close()')
  click('#settingsButton');box=js("document.querySelector('#settingsDialog').getBoundingClientRect().toJSON()");tap(box['x']+box['width']/2,box['y']+8);check('Touch inside modal padding does not dismiss it',js("document.querySelector('#settingsDialog').open"))
  p=outside('#settingsDialog');pointer(box['x']+20,box['y']+20);pointer(p['x'],p['y'],'mouseMoved',1);pointer(p['x'],p['y'],'mouseReleased',0);check('Dragging out of dialog does not dismiss it',js("document.querySelector('#settingsDialog').open"))
  tap(p['x'],p['y']);check('Backdrop touch cancels settings without applying',js("!document.querySelector('#settingsDialog').open"))
  js("NativeEditing.showInfo('Документация','Temporary fixture')");p=outside('#nativeInfoDialog');tap(p['x'],p['y']);check('Dynamically created documentation dialog also closes outside',js("!document.querySelector('#nativeInfoDialog').open"))
  click('#settingsButton');js("StudioChoices.open(document.querySelector('[name=completionShortcut]'))");click('.studio-choice-list [role=option]');check('A top-layer choice remains usable inside a modal',js("document.querySelector('#settingsDialog').open&&!StudioChoices.active"));p=outside('#settingsDialog');tap(p['x'],p['y'])
  click('#compilerSelect + .studio-select');js("(async()=>{await native('editorTestTouch',{action:0,points:[{x:900,y:100}]});await native('editorTestTouch',{action:1,points:[{x:900,y:100}]});})()");check('A real native editor touch dismisses anchored compiler choices',wait('!StudioChoices.active'))
  old=js("(async()=>{await NativeEditing.sync();return{state:await native('editorVisualState'),selection:forge.editor.getSelection()};})()")
  click('#maximizePanel');wait("(async()=>!((await native('editorVisualState')).visible))()");value=js("({height:document.querySelector('#panel').getBoundingClientRect().height,available:document.querySelector('.work-area').getBoundingClientRect().height})");check('Maximized bottom dock hides native editor and fills workspace',value,abs(value['height']-value['available'])<1)
  click('#maximizePanel');wait("(async()=>(await native('editorVisualState')).visible)()");new=js("(async()=>({state:await native('editorVisualState'),selection:forge.editor.getSelection()}))()");check('Restoring panel retains code viewport and caret',{'old':old,'new':new},old['selection']==new['selection']and abs(old['state']['offsetX']-new['state']['offsetX'])<2 and abs(old['state']['offsetY']-new['state']['offsetY'])<2)
  before=js("({sidebar:document.body.classList.contains('sidebar-hidden'),panel:document.body.classList.contains('panel-hidden')})");js('forge.toggleFocusMode()');value=js("({sidebar:document.body.classList.contains('sidebar-hidden'),panel:document.body.classList.contains('panel-hidden')})");js('forge.toggleFocusMode()');after=js("({sidebar:document.body.classList.contains('sidebar-hidden'),panel:document.body.classList.contains('panel-hidden')})");check('Focus mode restores previously visible panels',{'before':before,'focus':value,'after':after},all(value.values())and before==after)
  js("native('editorFocus',{id:'primary'})")
  for expected in [True,False]:
   subprocess.run([ADB,'shell','input','keycombination','113','59','142'],check=True,capture_output=True,timeout=10)
   check('Android Ctrl Shift F12 '+('enters'if expected else'leaves')+' focus mode',wait('document.body.classList.contains("panel-hidden")==='+str(expected).lower()))
  p=js("(()=>{const b=document.querySelector('.tab.active').getBoundingClientRect();return{x:b.x+25,y:b.y+b.height/2};})()")
  for count in [1,2]:pointer(p['x'],p['y'],count=count);pointer(p['x'],p['y'],'mouseReleased',0,count)
  check('Double-clicking active file tab toggles focus mode',wait('!!forge.focusLayout'));js('forge.toggleFocusMode()')
  time.sleep(.25);p=js("(()=>{const b=document.querySelector('#buildButton').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};})()");pointer(p['x'],p['y'],'mouseMoved',0);tip=wait("document.querySelector('.studio-hover-tip')?.textContent");check('Mouse hover on icon exposes action and shortcut',tip,'Собрать'in tip and 'F9'in tip);js('StudioHover.hide()')

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
  for scale in [65,100,150]:
   js(f'forge.setUIScale({scale})');time.sleep(.15);value=js("(()=>{const p=document.querySelector('#panel').getBoundingClientRect(),h=document.querySelector('.topbar').getBoundingClientRect();return{panelWidth:p.width,width:innerWidth,header:h.height,expected:42*forge.settings.uiScale/100,overflow:document.documentElement.scrollWidth>innerWidth+1};})()");check(f'Full-width dock and single header at UI scale {scale}%',value,abs(value['panelWidth']-value['width'])<1 and abs(value['header']-value['expected'])<1 and not value['overflow'])
  js('forge.setUIScale(100)')
 except Exception as error:
  if all(c['passed']for c in checks):checks.append({'test':'Remaining regression completed','passed':False,'error':str(error)})
  raise
 finally:
  try:js("(async()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());forge.toggleMainMenu(false);StudioChoices.close();StudioPopover.close();forge.maximizePanel(false);forge.setUIScale(100);await forge.saveAll();})()")
  except Exception:pass
  d.close();report={'device':'Xiaomi Pad 6 / Android 14','scope':'On-device WebView touch/mouse, native Android touch, actual Sora spans and clangd diagnostics','checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)}
  (ROOT/'verification-compact-ui-033.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':report['passed'],'total':report['total']}),flush=True)

if __name__=='__main__':run()
