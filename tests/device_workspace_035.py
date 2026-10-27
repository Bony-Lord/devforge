"""Physical device regression for file windows and the full native keyboard.

Only runs in an explicitly named disposable project. CDP drives WebView window
gestures; ADB taps native keys, and the guarded debug bridge tests multitouch.
"""
import json,os,pathlib,subprocess,sys,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from device_cdp import Device,ADB

def run():
 d=Device();checks=[]
 def js(s):return d.evaluate(s)
 def adb(*args):return subprocess.run([ADB,*map(str,args)],check=True,capture_output=True,timeout=30)
 def check(name,evidence,ok=True):
  checks.append({'test':name,'passed':bool(ok),'evidence':evidence});print(('PASS 'if ok else'FAIL ')+name,flush=True);assert ok,str(evidence)[:1500]
 def wait(s):
  end=time.monotonic()+12
  while True:
   r=js(s)
   if r and r!={'type':'undefined'}:return r
   if time.monotonic()>end:raise AssertionError('Timeout '+s[:180])
   time.sleep(.08)
 def mouse(kind,x,y,buttons=0):d.call('Input.dispatchMouseEvent',{'type':kind,'x':x,'y':y,'button':'none'if kind=='mouseMoved'else'left','buttons':buttons,'clickCount':1})
 def drag(a,b,touch=False,dwell=0):
  if touch:d.call('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[a]})
  else:mouse('mousePressed',a['x'],a['y'],1)
  time.sleep(.35)
  for i in range(1,13):
   p={k:a[k]+(b[k]-a[k])*i/12 for k in ['x','y']}
   if touch:d.call('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[p]})
   else:mouse('mouseMoved',p['x'],p['y'],1)
   time.sleep(.025)
  if dwell:time.sleep(dwell)
  if touch:d.call('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  else:mouse('mouseReleased',b['x'],b['y'])
  time.sleep(.35)
 def float_box():return js("forge.windows.panel('editor').group.element.closest('.dv-resize-container').getBoundingClientRect().toJSON()")
 def state():return js("native('editorTestFloatingKeyboard')")
 def key(action,index=0):return [k for k in state()['keys']if k['action']==action][index]
 def pt(k,id=0):return {'id':id,'x':k['x']+k['width']/2,'y':k['y']+k['height']/2}
 def tap(action,index=0):
  p=pt(key(action,index));adb('shell','input','tap',round(p['x']),round(p['y']))
 def text():return js('(async()=>{await NativeEditing.sync();return forge.active.model.getValue();})()')
 def reset(value=''):
  js('(async()=>{const m=forge.active.model;m.setValue('+json.dumps(value)+');await NativeEditing.sync();forge.editor.setPosition(m.getPositionAt(m.getValueLength()));await forge.editor.focus();})()');time.sleep(.1)
 def native_touch(action,points,index=0):return js('native("editorTestKeyboardTouch",'+json.dumps({'action':action,'points':points,'index':index})+')')
 try:
  assert js("forge.state.project==='input-check-workspace-035-20261027'")
  js("(async()=>{for(const doc of [...forge.tabs])if(!['main.cpp','CMakeLists.txt'].includes(basename(doc.path)))await forge.closeTab(doc);})()")
  js("(async()=>{await forge.changeSettings({keyboardPrimary:'system',dockTargets:true,smartFormatOnClose:false,uiScale:100});forge.windows.reset();await forge.openFile(forge.state.root+'/main.cpp');await forge.openFile(forge.state.root+'/CMakeLists.txt');await NativeEditing.sync();})()");time.sleep(.3)
  ids=js("forge.windows.api.panels.filter(p=>forge.windows.isCode(p.id)).map(p=>({id:p.id,path:p.api.getParameters().path,visible:p.api.isVisible}))")
  check('File names replace generic Editor heading; global duplicate tabs hidden',js("({tabs:[...document.querySelectorAll('.studio-tool-tab')].map(e=>e.textContent.trim()),oldTabs:getComputedStyle(document.querySelector('#tabs')).display})"),len(ids)==2 and js("![...document.querySelectorAll('.studio-tool-tab')].some(e=>e.textContent.trim()==='Редактор')&&getComputedStyle(document.querySelector('#tabs')).display==='none'"))
  for mode in ['project','search','outline','git']:
   js('forge.showSide('+json.dumps(mode)+');true');time.sleep(.06)
   value=js("({ids:forge.windows.api.panels.filter(p=>p.id==='navigator').map(p=>p.id),mode:forge.windows.sideMode,visible:['project','search','outline','git'].filter(id=>document.querySelector('#'+({project:'sidebar',search:'sideSearch',outline:'outline',git:'gitSide'}[id])).closest('#studioWindowStash')===null)})")
   check('One shared navigation window: '+mode,value,value['ids']==['navigator']and value['mode']==mode and value['visible']==[mode])
  js("forge.windows.place('project','float');true");time.sleep(.35)
  navBefore=js("forge.windows.panel('project').group.api.boundingBox")
  js("forge.windows.hide('navigator');true");time.sleep(.35)
  time.sleep(.35);js("forge.showSide('search');true");time.sleep(.35)
  navAfter=js("forge.windows.panel('search').group.api.boundingBox")
  check('Navigation window reopens at its saved floating location',{'before':navBefore,'after':navAfter},js("forge.windows.panel('search').api.location.type==='floating'")and abs(navBefore['left']-navAfter['left'])<3)
  js("forge.windows.place('project','left');true")
  check('New files share one tabbed window by default',js("forge.windows.api.groups.filter(g=>g.panels.some(p=>forge.windows.isCode(p.id))).map(g=>g.panels.map(p=>p.id))"),js("forge.windows.api.groups.filter(g=>g.panels.some(p=>forge.windows.isCode(p.id))).length===1"))
  code=js("forge.windows.panel('editor').id")
  js("forge.windows.place('editor','right','window')");time.sleep(.35)
  values=js("Promise.all([...forge.windows.codeWindows.values()].filter(r=>forge.windows.api.getPanel(r.id)).map(async r=>({id:r.id,path:r.path,state:await native('editorVisualState',{id:r.paneId})})))")
  check('Two different files render together in independent native viewports',[{'id':v['id'],'path':v['path'],'visible':v['state']['visible'],'w':v['state']['width']}for v in values],len(values)==2 and all(v['state']['visible']and v['state']['width']>100 for v in values))
  js("forge.windows.place('editor','float')");time.sleep(.35)
  value=js("(async()=>{await NativeEditing.layout();return await native('editorVisualState',{id:[...NativeEditing.panes.values()].find(p=>p.editor===forge.editor).id});})()")
  check('Floating file paints its own code instead of masking itself',{'visible':value['visible'],'masks':len(value['occlusions'])},value['visible']and value['paneVisible']and not any(r.get('paint',True)for r in value['occlusions']))
  js("forge.menu([{label:'FLOAT_MENU_LAYER_PROBE',run:()=>{}}],400,230)");time.sleep(.1)
  value=js("(async()=>{await NativeEditing.layout();const b=document.querySelector('#menu').getBoundingClientRect();return{top:document.elementFromPoint(b.x+20,b.y+20).closest('#menu')!==null,state:await native('editorVisualState',{id:[...NativeEditing.panes.values()].find(p=>p.editor===forge.editor).id})};})()")
  check('Popup is above floating window and masks native code',{'top':value['top'],'popupMasks':sum(r.get('popup',False)for r in value['state']['occlusions'])},value['top']and any(r.get('popup',False)for r in value['state']['occlusions']))
  js("document.querySelector('#menu').classList.add('hidden')")
  js("forge.windows.setFloatingBounds(forge.windows.panel('editor').group,{left:340,top:130,width:500,height:300});true");time.sleep(.2)
  for touch in [False,True]:
   before=float_box();a={'x':before['x']+before['width']/2,'y':before['y']+8};drag(a,{'x':a['x']+65,'y':a['y']+35},touch)
   after=float_box();check(('Finger'if touch else'Mouse')+' moves floating titlebar freely without docking',{'before':[before['x'],before['y']],'after':[after['x'],after['y']]},js("forge.windows.panel('editor').api.location.type==='floating'")and abs(after['x']-before['x'])>35)
  # Pull a docked tab into an ordinary empty location, away from explicit targets.
  js("forge.windows.place('editor','right','screen')");time.sleep(.2)
  b=js("forge.windows.panel('editor').group.element.querySelector('.studio-tool-tab').getBoundingClientRect().toJSON()")
  drag({'x':b['x']+40,'y':b['y']+14},{'x':650,'y':230})
  check('Dragging docked file into free space creates a floating window',js("forge.windows.panel('editor').api.location"),js("forge.windows.panel('editor').api.location.type==='floating'"))
  # Explicit screen target still docks, with no invisible edge snap.
  b=js("forge.windows.panel('editor').group.element.querySelector('.studio-tool-tab').getBoundingClientRect().toJSON()");w=js("forge.windows.host.getBoundingClientRect().toJSON()")
  drag({'x':b['x']+40,'y':b['y']+14},{'x':w['right']-8,'y':w['y']+w['height']/2},dwell=.42)
  check('Holding at highlighted screen edge docks the file',js("forge.windows.panel('editor').api.location"),js("forge.windows.panel('editor').api.location.type==='grid'"))
  for mode in ['console','build','terminal','debug','problems']:
   js('forge.showPanel('+json.dumps(mode)+');true');time.sleep(.05)
   value=js("({count:forge.windows.api.panels.filter(p=>p.id==='output').length,mode:forge.windows.outputMode,visible:['console','build','terminal','debug','problems'].filter(id=>document.querySelector('#'+id).closest('#studioWindowStash')===null)})")
   check('One shared output window: '+mode,value,value['count']==1 and value['mode']==mode and value['visible']==[mode])
  js("(async()=>{await forge.openFile(forge.state.root+'/main.cpp');forge.splitEditor('side');await NativeEditing.sync();})()");time.sleep(.2)
  value=js("[...NativeEditing.panes.values()].filter(p=>p.editor.getModel()===forge.active.model).map(p=>p.id)")
  check('Same file can be viewed in two separate windows',value,len(value)==2)
  js("(async()=>{await forge.changeSettings({keyboardPrimary:'floating',keyboardLayout:'pc',keyboardModifiers:'sticky',keyboardPcWidth:95,keyboardPcHeight:48});await native('keyboard');})()")
  wait("native('editorTestFloatingKeyboard').then(k=>k.shown&&k.imeHeight===0)")
  s=state();names={k['action']for k in s['keys']}
  check('Full PC keyboard has function row, navigation, modifiers and number pad',{'keys':len(s['keys']),'layout':s['layout']},s['layout']=='pc'and all(x in names for x in ['f1','f12','esc','delete','insert','home','end','pageup','pagedown','meta','ctrl','alt','shift','numlock']))
  if s['russian']:tap('language')
  reset();tap('7',-1);check('PC number pad types digits',text(),text()=='7')
  reset('abcd');tap('numlock');tap('7',-1);tap('delete');check('Num Lock switches the pad to navigation',text(),text()=='bcd');tap('numlock')
  reset()
  for x in ['s','t','d','space']:tap(x)
  check('PC keyboard types code without autocorrection',text(),text()=='std ')
  tap('shift');tap('a');tap('b');check('Sticky Shift affects only next key',text(),text()=='std Ab')
  tap('ctrl');tap('a');tap('delete');check('Ctrl A plus Delete edits actual native buffer',text(),text()=='')
  reset('abcd');tap('home');tap('shift');tap('right');tap('delete');check('Shift navigation selects text and Delete removes selection',text(),text()=='bcd')
  tap('ctrl');tap('space');check('Ctrl Space switches floating layout without opening completion',state()['russian'],state()['russian']);tap('language')
  reset();tap('language')
  for x in ['п','р','и','в','е','т','ё']:tap(x)
  check('Full Cyrillic including yo works',text(),text()=='приветё');tap('language')
  reset('x'*60);p=pt(key('backspace'));adb('shell','input','swipe',round(p['x']),round(p['y']),round(p['x']),round(p['y']),850)
  check('Holding Backspace repeats without duplicating text',len(text()),10<len(text())<58)
  reset('int main(){return 0;}\n');js("window.keyboardActions=[];window.oldKeyboardAction=forge.action;forge.action=function(id){keyboardActions.push(id);return oldKeyboardAction.call(this,id);}")
  tap('ctrl');tap('alt');tap('space');wait("keyboardActions.includes('editor.action.triggerSuggest')");js('forge.action=oldKeyboardAction')
  check('Ctrl Alt Space routes completion; one-shot modifiers release',{'ctrl':state()['ctrl'],'alt':state()['alt']},not state()['ctrl']and not state()['alt'])
  js("(async()=>{await forge.changeSettings({keyboardModifiers:'hold'});await native('keyboard');})()");reset()
  shift=pt(key('shift'),0);a=pt(key('a'),1);native_touch(0,[shift]);native_touch(5,[shift,a],1);native_touch(6,[shift,a],1);native_touch(1,[shift]);tap('b')
  check('Real simultaneous native touch holds Shift while another finger types',{'text':text(),'held':state()['held']},text()=='Ab'and not state()['held'])
  # Cancellation releases every held modifier.
  p=pt(key('ctrl'));native_touch(0,[p]);native_touch(3,[p]);check('Canceled modifier gesture does not leave Ctrl stuck',state()['ctrl'],not state()['ctrl'])
  js("(async()=>{await forge.changeSettings({keyboardLayout:'android',keyboardAndroidWidth:65,keyboardAndroidHeight:42});await native('keyboard');})()");s=state()
  check('Android layout has its own size and fewer keys',{'layout':s['layout'],'keys':len(s['keys']),'width':s['width']},s['layout']=='android'and len(s['keys'])<70)
  reset();tap('a');check('Compact keyboard also edits native code',text(),text()=='a')
  js("(async()=>{await forge.changeSettings({keyboardPrimary:'system'});})()");wait("native('editorTestFloatingKeyboard').then(k=>!k.enabled)")
  check('Primary keyboard setting returns to Android IME',state()['enabled'],not state()['enabled'])
  # Preserve several windows across a real app process restart.
  js("(async()=>{await forge.saveAll();forge.windows.persist();clearTimeout(forge.workspaceSaveTimer);await native('settings',forge.settings);await forge.persistSession();})()")
  before=js("forge.windows.api.panels.filter(p=>forge.windows.isCode(p.id)).map(p=>({id:p.id,path:p.api.getParameters().path})).sort((a,b)=>a.id.localeCompare(b.id))")
  d.close();adb('shell','am','force-stop','com.forgex');adb('shell','am','start','-W','-n','com.forgex/dev.forge.ide.MainActivity');d=Device();time.sleep(.2)
  after=js("forge.windows.api.panels.filter(p=>forge.windows.isCode(p.id)).map(p=>({id:p.id,path:p.api.getParameters().path})).sort((a,b)=>a.id.localeCompare(b.id))")
  check('Process restart restores per-file windows, including duplicate views',{'before':before,'after':after},before==after and js("[...forge.windows.codeWindows.values()].filter(r=>r.path&&forge.windows.api.getPanel(r.id)).every(r=>r.editor.getModel()?.uri.fsPath===r.path)"))
 except Exception as e:
  checks.append({'test':'Remaining regression','passed':False,'error':str(e)});raise
 finally:
  try:js("document.querySelectorAll('dialog[open]').forEach(d=>d.close());forge.windows.reset();forge.windows.joinDocuments();forge.showSide('project');forge.showPanel('console');forge.saveAll();true")
  except Exception:pass
  d.close();report={'device':'Xiaomi Pad 6 / Android 14','checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)}
  (ROOT/'verification-workspace-035.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':report['passed'],'total':report['total']}),flush=True)

if __name__=='__main__':run()
