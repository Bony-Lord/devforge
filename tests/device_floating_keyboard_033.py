"""Physical Android touches on in-app keyboard, no synthetic DOM text input."""
import json,pathlib,sys,subprocess,time
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from device_cdp import Device,ADB

def run():
 d=Device();checks=[]
 def js(code):return d.evaluate(code)
 def state():return js("native('editorTestFloatingKeyboard')")
 def wait(code):
  end=time.monotonic()+12
  while True:
   r=js(code)
   if r and r!={'type':'undefined'}:return r
   if time.monotonic()>end:raise AssertionError('Timeout: '+code[:180])
   time.sleep(.04)
 def check(name,value,passed=True):checks.append({'test':name,'passed':bool(passed),'evidence':value});print(('PASS 'if passed else'FAIL ')+name,flush=True);assert passed,str(value)[:1400]
 def adb(*args):subprocess.run([ADB,*map(str,args)],check=True,capture_output=True,timeout=25)
 def find(action,section='keys'):
  return next(k for k in state()[section]if k['action']==action)
 def point(key):return round(key['x']+key['width']/2),round(key['y']+key['height']/2)
 def tap(action,section='keys'):
  if section=='strip':
   for _ in range(3):
    s=state();b=s['stripBounds'];k=next(k for k in s[section]if k['action']==action)
    if k['x']>=b['x'] and k['x']+k['width']<=b['x']+b['width']:break
    left=round(b['x']+20);right=round(b['x']+b['width']-20);y=round(b['y']+b['height']/2)
    adb('shell','input','swipe',*(left,y,right,y,300)if k['x']<b['x']else(right,y,left,y,300))
    time.sleep(.4)
  x,y=point(find(action,section));adb('shell','input','tap',x,y)
 def text():return js('(async()=>{await NativeEditing.sync();return forge.active.model.getValue();})()')
 def reset(value=''):
  js('(async()=>{const m=forge.active.model;m.setValue('+json.dumps(value)+');await NativeEditing.sync();const p=m.getPositionAt(m.getValueLength());await native("editorSelection",{id:"primary",line:p.lineNumber,column:p.column});await native("editorFocus",{id:"primary"});})()')
 def swipe(a,b,ms=500):adb('shell','input','swipe',*a,*b,ms)
 try:
  assert js("forge.state.project==='input-check-compact-20261027'")
  js("(async()=>{forge.windows.reset();await forge.openFile(forge.state.root+'/main.cpp');await forge.changeSettings({smartFormatOnClose:false,indentMode:'spaces',indentWidth:4});await native('editorFloatingKeyboard',{enabled:false,system:true});})()")
  wait("(async()=>{const k=await native('editorTestFloatingKeyboard');return k.imeHeight>0&&(await native('editorVisualState')).accessory.visible;})()")
  toggle=find('floatingKeyboard','strip');adb('shell','input','tap',*point(toggle));wait("native('editorTestFloatingKeyboard').then(k=>k.enabled&&k.shown&&k.imeHeight===0)")
  check('Button on accessory strip replaces real Android IME with floating keyboard',{'toggleDescription':toggle['description'],'state':{k:v for k,v in state().items()if k not in ['keys','controls','strip']}})
  if state()['russian']:tap('language')
  reset()
  for action in ['s','t','d','space']:tap(action)
  value=text();check('Native keyboard types std without autocorrection or capitalization',value,value=='std ')
  tap('shift');tap('A');tap('b');value=text();check('Shift affects one letter and then releases',value,value=='std Ab')
  tap('language');tap('п');tap('р');tap('и');tap('в');tap('е');tap('т');tap('ё');value=text();check('Russian layout includes full Cyrillic input including yo',value,value.endswith('приветё'));tap('language')
  reset();tap('symbols');tap('{');tap('enter');value=text();check('Brace pair plus Enter uses native smart indentation',value,value=='{\n    \n}');tap('symbols')
  reset('abc');tap('tab','strip');value=text();check('Tab on retained accessory strip advances to next four-column stop',value,value=='abc ')
  reset('0123456789'*6);p=point(find('backspace'));swipe(p,p,850);value=text();check('Holding Backspace repeatedly erases text',{'lengthAfter':len(value)},len(value)<55 and len(value)>30)
  reset('copy_me');tap('ctrl');tap('a');tap('copy','strip');tap('right','strip');caret=js("native('editorTestCompletionState')");tap('paste','strip');value=text();check('Select all, copy and paste stay integrated with native buffer',{'text':value,'caretBeforePaste':caret},value=='copy_mecopy_me')
  reset('int main(){return 0;}\n');js("window.floatingKeyActions=[];window.floatingOldAction=forge.action;forge.action=function(id){floatingKeyActions.push(id);return floatingOldAction.call(this,id);}");tap('ctrl');tap('alt');tap('space');wait("floatingKeyActions.includes('editor.action.triggerSuggest')");js('forge.action=floatingOldAction')
  value=state();check('Floating Ctrl Alt Space routes completion and clears modifiers',{'ctrl':value['ctrl'],'alt':value['alt']},not value['ctrl']and not value['alt'])
  b=state();a=point(find('move','controls'));swipe(a,(a[0]-160,a[1]-100),450);m=state();check('Dragging keyboard handle moves it',{'before':[b['x'],b['y']],'after':[m['x'],m['y']]},m['x']<b['x']-100 and m['y']<b['y']-60)
  a=point(find('resize','controls'));swipe(a,(a[0]-150,a[1]-65),450);m2=state();check('Keyboard resize grip changes width and height',{'before':[m['width'],m['height']],'after':[m2['width'],m2['height']]},m2['width']<m['width']-90 and m2['height']<m['height']-30)
  tap('close','controls');check('Close hides keyboard without changing preferred mode',state(),not state()['shown']and state()['enabled']);js("native('keyboard')");wait("native('editorTestFloatingKeyboard').then(k=>k.shown)");check('Editor keyboard button reopens floating mode',True)
  js('forge.openSettings()');wait("native('editorTestFloatingKeyboard').then(k=>!k.shown)");check('Modal settings hide floating keys until dialog closes',True);js("document.querySelector('#settingsDialog').close()");wait("native('editorTestFloatingKeyboard').then(k=>k.shown)")
  before={k:state()[k]for k in ['width','height','x','y']};d.close();adb('shell','am','force-stop','com.forgex');adb('shell','am','start','-W','-n','com.forgex/dev.forge.ide.MainActivity');d=Device();js("native('keyboard')");wait("native('editorTestFloatingKeyboard').then(k=>k.shown)");after=state();check('Cold launch remembers floating mode and keyboard dimensions',{'before':before,'after':{k:after[k]for k in before}},after['enabled']and after['width']==before['width']and after['height']==before['height'])
  tap('system','controls');wait("native('editorTestFloatingKeyboard').then(k=>!k.enabled&&!k.shown&&k.imeHeight>0)");check('Return button restores system keyboard',True)
 except Exception as error:
  if all(c['passed']for c in checks):checks.append({'test':'Complete keyboard regression','passed':False,'error':str(error)})
  raise
 finally:
  try:js("(async()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());await native('editorFloatingKeyboard',{enabled:false});await forge.saveAll();})()");adb('shell','input','keyevent','4')
  except Exception:pass
  d.close();report={'device':'Xiaomi Pad 6 / Android 14','scope':'Actual ADB taps and holds on native keyboard, Android IME replacement, native code editing and process restart','checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)};(ROOT/'verification-floating-keyboard-033.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':report['passed'],'total':report['total']}),flush=True)

if __name__=='__main__':run()
