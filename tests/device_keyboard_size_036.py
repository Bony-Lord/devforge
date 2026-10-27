"""Real edge resizing of the native keyboard and bounded scroll past EOF."""
import json,pathlib,sys,time,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'));from device_cdp import Device,ADB
d=Device();checks=[]
def js(s):return d.evaluate(s)
def adb(*args):return subprocess.run([ADB,*map(str,args)],check=True,capture_output=True,timeout=30)
def check(name,value,ok):
 checks.append({'test':name,'passed':bool(ok),'evidence':value});print(('PASS 'if ok else'FAIL ')+name,flush=True);assert ok,str(value)[:1800]
def state():return js("native('editorTestFloatingKeyboard')")
def point(tag,id,section='controls'):
 k=next(k for k in state()[section]if k['action']==tag);return {'id':id,'x':k['x']+k['width']/2,'y':k['y']+k['height']/2}
def touch(action,points,index=0):return js('native("editorTestKeyboardTouch",'+json.dumps({'action':action,'points':points,'index':index})+')')
def swipe(tag,dx,dy):
 k=next(k for k in state()['controls']if k['action']==tag);x=round(k['x']+k['width']/2);y=round(k['y']+k['height']/2);adb('shell','input','swipe',x,y,x+dx,y+dy,420);time.sleep(.2)
def visual():return js("native('editorVisualState',{id:[...NativeEditing.panes.values()].find(p=>p.editor===forge.editor).id})")
try:
 assert js("forge.state.project==='input-check-keyboard-036-20261027'")
 js("(async()=>{await forge.changeSettings({keyboardPrimary:'floating',keyboardLayout:'pc',keyboardPcWidth:65,keyboardPcHeight:38,keyboardModifiers:'sticky'});forge.windows.reset();await forge.openFile(forge.state.root+'/main.cpp');await native('keyboard');})()");time.sleep(.7)
 check('Own keyboard dismisses the system IME',state()['imeHeight'],state()['shown']and state()['imeHeight']==0)
 swipe('move',0,-120)
 for tag,dx,dy,dimension,sign in [('resize-right',-110,0,'width',-1),('resize-left',95,0,'width',-1),('resize-top',0,-70,'height',1),('resize-bottom',0,-60,'height',-1)]:
  before=state();swipe(tag,dx,dy);after=state();fixed=abs((before['x']+before['width'])-(after['x']+after['width']))<3 if tag=='resize-left'else abs((before['y']+before['height'])-(after['y']+after['height']))<3 if tag=='resize-top'else True
  check('Finger drag '+tag+' resizes and keeps opposite edge fixed',{'before':{k:before[k]for k in ['x','y','width','height']},'after':{k:after[k]for k in ['x','y','width','height']}},(after[dimension]-before[dimension])*sign>35 and fixed)
 for tag,dx,dy in [('resize',60,45),('resize-bottomleft',-45,35)]:
  before=state();swipe(tag,dx,dy);after=state();check('Finger drag '+tag+' changes both dimensions',{'before':[before['width'],before['height']],'after':[after['width'],after['height']]},after['width']>before['width']+25 and after['height']>before['height']+20)
 before=state();p=point('resize-left',7);touch(0,[p]);touch(2,[{**p,'x':p['x']+70}]);touch(3,[{**p,'x':p['x']+70}]);after=state();check('Canceled edge gesture restores keyboard bounds',{'before':[before[k]for k in ['x','y','width','height']],'after':[after[k]for k in ['x','y','width','height']]},all(before[k]==after[k]for k in ['x','y','width','height']))
 value=js('forge.active.model.getValue()');p=point('resize-left',17);other=point('a',63,'keys');touch(0,[p]);touch(5,[p,other],1);p={**p,'x':p['x']+45};touch(2,[p,other]);touch(6,[other,p],1);before=state();touch(2,[{**other,'x':other['x']+100}]);touch(1,[{**other,'x':other['x']+100}]);after=state();check('Second finger neither types nor takes over edge resize',{'before':[before['x'],before['width']],'after':[after['x'],after['width']]},before['x']==after['x']and before['width']==after['width']and js('forge.active.model.getValue()')==value)
 check('No resize button is added to the keyboard header',[k['action']for k in state()['controls']],all(k['action']in ['move','modifiers','system','close']for k in state()['controls'][:4]))
 js("(async()=>{forge.active.model.setValue('');await NativeEditing.sync();await forge.editor.focus();})()");time.sleep(.2);k=next(k for k in state()['keys']if k['action']=='a');adb('shell','input','tap',round(k['x']+k['width']/2),round(k['y']+k['height']/2));value=js('(async()=>{await NativeEditing.sync();return forge.active.model.getValue();})()');check('Key input still works after edge resizing',value,value=='a')
 pc=js('({width:forge.settings.keyboardPcWidth,height:forge.settings.keyboardPcHeight})');js("(async()=>{await forge.changeSettings({keyboardLayout:'android',keyboardAndroidWidth:55,keyboardAndroidHeight:35});await native('keyboard');})()");time.sleep(.4);before=state();swipe('resize-left',70,0);after=state();check('Android keyboard resizes independently of PC layout',{'before':before['width'],'after':after['width'],'pc':pc},after['width']<before['width']-40 and js('forge.settings.keyboardPcWidth')==pc['width']and js('forge.settings.keyboardPcHeight')==pc['height'])
 js("(async()=>{await forge.changeSettings({keyboardPrimary:'system',codeScale:100,wordWrap:false});forge.windows.hide('console');})()");time.sleep(.3)
 for count,scale in [(12,100),(60,100),(12,175)]:
  text='\n'.join('// row '+str(i+1)for i in range(count));js('(async()=>{forge.active.model.setValue('+json.dumps(text)+');await NativeEditing.sync();forge.setCodeScale('+str(scale)+');await forge.editor.focus();})()');time.sleep(.25)
  for _ in range(3):
   v=visual();x=round(v['screenX']+v['width']*.7);y=round(v['screenY']+v['height']*.8);end=round(v['screenY']+v['height']*.15);adb('shell','input','swipe',x,y,x,end,350);time.sleep(.2)
  v=visual();remaining=v['layoutHeight']-v['offsetY'];check('Scroll past EOF keeps final row partly visible: '+str(count)+' lines / '+str(scale)+'%',{'offset':v['offsetY'],'max':v['maxY'],'remaining':remaining,'rowHeight':v['rowHeight'],'viewport':v['height']},v['offsetY']>v['rowHeight']*3 and abs(v['maxY']-v['offsetY'])<4 and 0<remaining<=v['rowHeight']*.6)
 js("(async()=>{await forge.changeSettings({keyboardPrimary:'floating',keyboardLayout:'pc'});await native('keyboard');await forge.saveAll();await forge.windows.persist(true);await forge.persistSession();})()");time.sleep(.35);before=state();d.close();adb('shell','am','force-stop','com.forgex');adb('shell','am','start','-W','-n','com.forgex/dev.forge.ide.MainActivity');d=Device();js("native('keyboard')");time.sleep(.4);after=state();check('Resized keyboard dimensions survive restart',{'before':[before['width'],before['height']],'after':[after['width'],after['height']]},abs(after['width']-before['width'])<25 and abs(after['height']-before['height'])<20)
finally:
 try:js("(async()=>{await forge.saveAll();})()")
 except Exception:pass
 d.close();report={'checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)};(ROOT/'verification-keyboard-size-036.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':report['passed'],'total':report['total']}),flush=True)
