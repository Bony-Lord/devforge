"""Native multi-pointer keyboard and settled/live Dockview geometry regression."""
import json,pathlib,sys,subprocess,time
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from device_cdp import Device,ADB

def run():
 d=Device();checks=[]
 def js(s):return d.evaluate(s)
 def check(name,value,passed=True):
  checks.append({'test':name,'passed':bool(passed),'evidence':value});print(('PASS 'if passed else'FAIL ')+name,flush=True);assert passed,str(value)[:1800]
 def wait(code):
  end=time.monotonic()+10
  while True:
   r=js(code)
   if r and r!={'type':'undefined'}:return r
   if time.monotonic()>end:raise AssertionError(code[:180])
   time.sleep(.04)
 def adb(*args):subprocess.run([ADB,*map(str,args)],check=True,capture_output=True,timeout=30)
 def state():return js("native('editorTestFloatingKeyboard')")
 def key(action,index=0,section='keys'):return [k for k in state()[section]if k['action']==action][index]
 def point(action,id,index=0):
  k=key(action,index);return {'id':id,'x':k['x']+k['width']/2,'y':k['y']+k['height']/2}
 def tap(action,section='keys'):
  k=key(action,section=section);adb('shell','input','tap',round(k['x']+k['width']/2),round(k['y']+k['height']/2))
 def touch(action,points,index=0):return js('native("editorTestKeyboardTouch",'+json.dumps({'action':action,'points':points,'index':index})+')')
 def text():return js('(async()=>{await NativeEditing.sync();return forge.active.model.getValue();})()')
 def reset(value=''):
  js('(async()=>{const m=forge.active.model;m.setValue('+json.dumps(value)+');await NativeEditing.sync();forge.editor.setPosition(m.getPositionAt(m.getValueLength()));await forge.editor.focus();})()')
 def mouse(kind,x,y,buttons=0):d.call('Input.dispatchMouseEvent',{'type':kind,'x':x,'y':y,'button':'none'if kind=='mouseMoved'else'left','buttons':buttons,'clickCount':1})
 def start(id):
  b=js('forge.windows.api.getPanel('+json.dumps(id)+').group.element.querySelector(\'.studio-tool-tab[data-tool="'+id+'"]\').getBoundingClientRect().toJSON()');p={'x':b['x']+25,'y':b['y']+14};mouse('mousePressed',p['x'],p['y'],1);return p
 def move(a,b):
  for i in range(1,9):mouse('mouseMoved',a['x']+(b['x']-a['x'])*i/8,a['y']+(b['y']-a['y'])*i/8,1);time.sleep(.012)
 def geometry():return js("Promise.all([...NativeEditing.panes.values()].filter(p=>forge.windows.editorPanel(p.id)?.api.isVisible).map(async p=>{const panel=forge.windows.editorPanel(p.id),g=panel.group.element,b=g.querySelector('.dv-content-container').getBoundingClientRect(),v=await native('editorVisualState',{id:p.id});return{id:p.id,content:b.toJSON(),native:v,overlay:p.container.getBoundingClientRect().toJSON(),scale:devicePixelRatio};}))")
 def aligned(value):
  return all(v['native']['visible']and abs(v['native']['top']/v['scale']-v['content']['top'])<2 and abs(v['native']['left']/v['scale']-v['content']['left'])<2 and abs(v['native']['width']/v['scale']-v['content']['width'])<3 and abs(v['native']['height']/v['scale']-v['content']['height'])<3 for v in value)
 try:
  assert js("forge.state.project==='input-check-workspace-035-20261027'")
  js("(async()=>{await forge.changeSettings({keyboardPrimary:'floating',keyboardLayout:'pc',keyboardModifiers:'sticky',codeScale:100,uiScale:100,smartFormatOnClose:false});forge.windows.reset();await forge.openFile(forge.state.root+'/main.cpp');await native('keyboard');})()")
  wait("native('editorTestFloatingKeyboard').then(k=>k.shown&&k.imeHeight===0)")
  # Wait for Android's first measure/layout after the saved keyboard size changes.
  time.sleep(.65)
  if state()['russian']:tap('language')
  s=state();legends={k['action']:k['legend']for k in s['keys']if k['legend']}
  check('PC keys expose small secondary Shift legends',legends,all(legends.get(a)==b for a,b in [('1','!'),('2','@'),('[','{'),(';',':'),('/','?')]))
  reset();tap('shift');tap('1');check('Shift legend matches actual typed symbol',text(),text()=='!')
  reset();shift=point('shift',13);a=point('a',47);touch(0,[shift]);touch(5,[shift,a],1);touch(6,[a,shift],1);touch(1,[a])
  check('Tap chord keeps Shift even when modifier finger lifts first and indices reorder',{'text':text(),'state':{k:state()[k]for k in ['held','latched','activePointers']}},text()=='A'and state()['activePointers']==0 and not state()['held']and not state()['latched'])
  reset();left=point('shift',7,0);right=point('shift',31,1);b=point('b',55);touch(0,[left]);touch(5,[left,right],1);touch(6,[right,left],1);touch(5,[right,b],1);touch(6,[b,right],0);touch(1,[right])
  check('Releasing one of two Shift fingers preserves the other',text(),text()=='B'and not state()['held'])
  reset();q=point('q',19);w=point('w',81);touch(0,[q]);touch(5,[q,w],1);touch(6,[w,q],1);touch(1,[w]);check('Two ordinary touch keys type once each with changing pointer indices',text(),text()=='qw')
  reset();c=point('ctrl',2);alt=point('alt',8);space=point('space',99);js("window.chordActions=[];window.chordOld=forge.action;forge.action=function(id){chordActions.push(id);return chordOld.call(this,id);}")
  touch(0,[c]);touch(5,[c,alt],1);touch(5,[space,c,alt],0);touch(6,[space,alt,c],1);touch(6,[c,space],0);touch(1,[space]);wait("chordActions.includes('editor.action.triggerSuggest')");js('forge.action=chordOld;true')
  check('Three-finger Ctrl Alt Space works when both modifiers release first',{'actions':js('chordActions'),'pointers':state()['activePointers']},state()['activePointers']==0)
  tap('modifiers','controls');wait("forge.settings.keyboardModifiers==='hold'");check('Header mode button switches to Hold and persists preference',state()['modifierMode'],state()['modifierMode']=='hold')
  reset();c=point('ctrl',6);alt=point('alt',14);space=point('space',63);js("window.holdActions=[];window.holdOldAction=forge.action;forge.action=function(id){holdActions.push(id);return holdOldAction.call(this,id);}");touch(0,[c]);touch(5,[c,alt],1);touch(5,[c,alt,space],2);time.sleep(.52);touch(6,[space,alt,c],2);touch(6,[space,alt],1);touch(1,[space]);value=js("holdActions.filter(v=>v==='editor.action.triggerSuggest').length");js('forge.action=holdOldAction;true');check('Holding a shortcut does not flood completion requests',value,value==1)
  reset();a=point('a',5);touch(0,[a]);check('Hold mode starts typing on pointer down',text(),text()=='a');time.sleep(.5);touch(1,[a]);count=len(text());check('Held printable key repeats and stops on release',count,2<count<8);time.sleep(.15);check('No extra key after releasing repeated hold',len(text()),len(text())==count)
  reset();shift=point('shift',12);a=point('a',64);touch(0,[shift]);touch(5,[a,shift],0);touch(6,[shift,a],0);touch(1,[a]);check('Hold chord uses independent pointer IDs',text(),text()=='A')
  reset();shift=point('shift',16);a=point('a',72);touch(0,[shift]);touch(5,[shift,a],1);touch(6,[a,shift],1);time.sleep(.47);touch(1,[a]);value=text();check('Held key repeat follows modifiers still physically down',value,len(value)>1 and value[0]=='A'and value[1:]==value[1:].lower())
  reset();c=point('ctrl',4);a=point('a',9);touch(0,[c]);touch(5,[c,a],1);touch(3,[a,c]);check('Cancel clears every held pointer and modifier',state()['activePointers'],state()['activePointers']==0 and not state()['held']);tap('b');check('Input after canceled chord has no stuck Ctrl',text(),text()=='b')
  tap('modifiers','controls');wait("forge.settings.keyboardModifiers==='sticky'");check('Header button also returns to Tap mode',state()['modifierMode'],state()['modifierMode']=='sticky')
  js("(async()=>{await forge.changeSettings({keyboardPcWidth:75,keyboardPcHeight:40});await native('keyboard');})()");time.sleep(.1)
  h=key('move',section='controls');first={'id':11,'x':h['x']+h['width']/3,'y':h['y']+h['height']/2};touch(0,[first]);firstMove={**first,'y':first['y']-65};touch(2,[firstMove]);h=key('move',section='controls');second={'id':39,'x':h['x']+h['width']*.7,'y':h['y']+h['height']/2};touch(5,[firstMove,second],1);touch(6,[second,firstMove],1);before=state();touch(2,[{**second,'y':second['y']+90}]);touch(1,[{**second,'y':second['y']+90}]);after=state()
  check('Keyboard drag does not jump to the remaining finger',{'before':[before['x'],before['y']],'after':[after['x'],after['y']]},before['x']==after['x']and before['y']==after['y'])
  js("(async()=>{await forge.changeSettings({keyboardPrimary:'system'});await forge.openFile(forge.state.root+'/CMakeLists.txt');await forge.openFile(forge.state.root+'/main.cpp');forge.windows.place('editor','float');})()");time.sleep(.4)
  value=geometry();check('Floating file is aligned after animation without manual resize',value,aligned(value)and all(abs(v['overlay']['top']-v['content']['top'])<2 for v in value))
  fb=js("forge.windows.panel('editor').group.element.closest('.dv-resize-container').getBoundingClientRect().toJSON()");first={'id':7,'x':fb['x']+fb['width']/2,'y':fb['y']+8};d.call('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[first]});moving={**first,'x':first['x']+35,'y':first['y']+25};d.call('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[moving]});before=js("forge.windows.panel('editor').group.api.boundingBox");second={'id':39,'x':fb['x']+fb['width']-30,'y':fb['y']+fb['height']-30};d.call('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[moving,second]});d.call('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[moving,{**second,'x':second['x']-75,'y':second['y']-40}]});after=js("forge.windows.panel('editor').group.api.boundingBox");d.call('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});time.sleep(.35);check('Second touch cannot hijack an active window drag',{'before':before,'after':after},abs(before['left']-after['left'])<2 and abs(before['top']-after['top'])<2)
  source=js("forge.windows.panel('editor').id");a=start(source);r=js('forge.windows.host.getBoundingClientRect().toJSON()');edge={'x':r['right']-7,'y':r['y']+r['height']*.47};move(a,edge);time.sleep(.44)
  value=geometry();check('Held docking preview keeps native code aligned',value,aligned(value))
  # Current target rectangles must follow the newly split layout, not drag-start boxes.
  value=js("(()=>{const c=forge.windows.targets.ctx;return forge.windows.api.groups.filter(g=>g.panels.some(p=>!c.ids.includes(p.id))).map(g=>{const a=c.boxes.get(g.id),b=g.element.getBoundingClientRect();return{group:g.id,dx:Math.abs(a.x-b.x),dy:Math.abs(a.y-b.y),dw:Math.abs(a.width-b.width),dh:Math.abs(a.height-b.height)};});})()")
  check('Drop target rectangles track the new live layout',value,all(max(v[k]for k in ['dx','dy','dw','dh'])<2 for v in value))
  mouse('mouseReleased',edge['x'],edge['y']);time.sleep(.4);value=geometry();check('Released docked file needs no resize to repaint correctly',value,aligned(value))
  # The newly occupied window is a valid target for the next drag.
  other=js("forge.windows.api.panels.find(p=>forge.windows.isCode(p.id)&&p.id!=="+json.dumps(source)+").id");a=start(other);target=js('forge.windows.api.getPanel('+json.dumps(source)+').group.element.getBoundingClientRect().toJSON()');pointOnNew={'x':target['x']+70,'y':target['y']+14};move(a,pointOnNew);time.sleep(.42);mouse('mouseReleased',pointOnNew['x'],pointOnNew['y']);time.sleep(.4)
  check('Next drag can join the newly relocated window at its current header',js('forge.windows.api.getPanel('+json.dumps(source)+').group.panels.map(p=>p.id)'),js('forge.windows.api.getPanel('+json.dumps(source)+').group===forge.windows.api.getPanel('+json.dumps(other)+').group'))
  value=geometry();check('Joining tabs settles all native viewports and overlays',value,aligned(value))
 except Exception as e:
  checks.append({'test':'Remaining 0.3.5 checks','passed':False,'error':str(e)});raise
 finally:
  try:js("(async()=>{await forge.changeSettings({keyboardPrimary:'system'});forge.windows.reset();forge.windows.joinDocuments();await forge.saveAll();})()")
  except Exception:pass
  d.close();report={'device':'Xiaomi Pad 6 / Android 14','checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)};(ROOT/'verification-input-layout-035.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':report['passed'],'total':report['total']}),flush=True)

if __name__=='__main__':run()
