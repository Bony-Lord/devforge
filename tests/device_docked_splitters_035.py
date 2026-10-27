"""Actual Android finger drags of grid sashes, including saved sizes and nested splits."""
import json,pathlib,sys,time,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'));from device_cdp import Device,ADB
d=Device();checks=[]
def js(s):return d.evaluate(s)
def adb(*args):return subprocess.run([ADB,*map(str,args)],check=True,capture_output=True,timeout=30)
def check(name,value,ok):
 checks.append({'test':name,'passed':bool(ok),'evidence':value});print(('PASS 'if ok else'FAIL ')+name,flush=True);assert ok,str(value)[:2200]
def boxes():return js("Object.fromEntries(forge.windows.api.panels.map(p=>[p.id,p.group.element.getBoundingClientRect().toJSON()]))")
def sashes(horizontal):return js("[...document.querySelectorAll('#dockWorkspace .dv-sash.dv-enabled')].map(e=>e.getBoundingClientRect().toJSON()).filter(r=>r.width>0&&r.height>0&&"+('r.width>r.height'if horizontal else'r.height>r.width')+")")
def mouse(kind,x,y,buttons=0):d.call('Input.dispatchMouseEvent',{'type':kind,'x':x,'y':y,'button':'none'if kind=='mouseMoved'else'left','buttons':buttons,'clickCount':1})
def finger(box,delta,horizontal):
 origin=js("(async()=>{const p=await native('editorVisualState',{id:'primary'});return{scale:devicePixelRatio,x:p.screenX-p.left,y:p.screenY-p.top};})()")
 a=[box['x']+box['width']/2,box['y']+box['height']/2];b=[a[0]+(0 if horizontal else delta),a[1]+(delta if horizontal else 0)]
 def physical(point):return[round(point[0]*origin['scale']+origin['x']),round(point[1]*origin['scale']+origin['y'])]
 adb('shell','input','swipe',*physical(a),*physical(b),500);time.sleep(.25)
try:
 assert js("forge.state.project==='input-check-docked-035-20261027'")
 js("(async()=>{await forge.changeSettings({keyboardPrimary:'system',uiScale:100,codeScale:100});forge.windows.reset();await forge.openFile(forge.state.root+'/main.cpp');})()");time.sleep(.3)
 for horizontal,id,dimension,deltas in [(False,'navigator','width',[85,-45]),(True,'output','height',[-75,40])]:
  for delta in deltas:
   before=boxes()[id][dimension];finger(sashes(horizontal)[0],delta,horizontal);after=boxes()[id][dimension];expected=-delta if horizontal else delta
   check('Real finger '+('console'if horizontal else'project')+' splitter '+str(delta),{'before':before,'after':after},(after-before)*(1 if expected>0 else-1)>25)
 before=boxes();time.sleep(.9);after=boxes();check('Grid sizes remain stable after delayed forced layout',{'before':before,'after':after},all(abs(before[id][key]-after[id][key])<2 for id in ['navigator','output']for key in ['width','height']))
 # Read the intermediate mouse-drag size; release must preserve that same value.
 b=sashes(False)[0];x=b['x']+b['width']/2;y=b['y']+b['height']/2;old=boxes()['navigator']['width'];mouse('mousePressed',x,y,1);mouse('mouseMoved',x+60,y,1);during=boxes()['navigator']['width'];mouse('mouseReleased',x+60,y);time.sleep(.3);after=boxes()['navigator']['width'];check('Mouse release preserves the size reached during the drag',{'before':old,'during':during,'after':after},during-old>45 and abs(after-during)<2)
 before=boxes();js("forge.windows.hide('project');forge.windows.hide('console');true");time.sleep(.3);js("forge.windows.show('project');forge.windows.show('console');true");time.sleep(.3);after=boxes();check('User-dragged grid sizes survive hide and reopen',{'before':before,'after':after},abs(before['navigator']['width']-after['navigator']['width'])<3 and abs(before['output']['height']-after['output']['height'])<3)
 js("forge.windows.splitDocument('side');true");time.sleep(.3);b=sorted(sashes(False),key=lambda r:r['x'])[-1];before=boxes();finger(b,65,False);after=boxes();code=[id for id in before if id not in ['navigator','output']];check('Nested side-by-side code splitter works by real finger',{'before':before,'after':after},any(abs(after[id]['width']-before[id]['width'])>40 for id in code)and abs(after['navigator']['width']-before['navigator']['width'])<2)
 js("forge.windows.splitDocument('stacked');true");time.sleep(.3);b=sorted(sashes(True),key=lambda r:r['y'])[0];before=boxes();finger(b,50,True);after=boxes();code=[id for id in before if id not in ['navigator','output']];check('Nested stacked code splitter works by real finger',{'before':before,'after':after},any(abs(after[id]['height']-before[id]['height'])>30 for id in code)and abs(after['output']['height']-before['output']['height'])<2)
 # Pointer IDs cannot be replaced by a second finger on the same grid gesture.
 b=sashes(False)[0];first={'id':7,'x':b['x']+b['width']/2,'y':b['y']+b['height']/2};d.call('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[first]});moving={**first,'x':first['x']+30};d.call('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[moving]});before=boxes()['navigator']['width'];second={'id':39,'x':b['x']+120,'y':b['y']+60};d.call('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[moving,second]});d.call('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[moving,{**second,'x':second['x']+70}]});after=boxes()['navigator']['width'];d.call('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});time.sleep(.3);check('Second finger cannot move or finish another grid splitter gesture',{'before':before,'after':after},abs(after-before)<2)
 value=js("Promise.all([...NativeEditing.panes.values()].filter(p=>forge.windows.editorPanel(p.id)?.api.isVisible).map(async p=>{const b=forge.windows.editorPanel(p.id).group.element.querySelector('.dv-content-container').getBoundingClientRect(),v=await native('editorVisualState',{id:p.id});return{id:p.id,delta:Math.max(Math.abs(v.left/devicePixelRatio-b.x),Math.abs(v.top/devicePixelRatio-b.y),Math.abs(v.width/devicePixelRatio-b.width),Math.abs(v.height/devicePixelRatio-b.height))};}))");check('All native code viewports align after real grid resizing',value,all(v['delta']<3 for v in value))
 before=boxes();snapshot=js('forge.windows.api.toJSON()');js('(async()=>{await forge.windows.persist(true);await forge.persistSession();})()');saved=js("native('state').then(s=>s.settings.dockWindows.layout)");d.close();adb('shell','am','force-stop','com.forgex');adb('shell','am','start','-W','-n','com.forgex/dev.forge.ide.MainActivity');d=Device();after=boxes();check('Cold start retains resized grid and nested code sizes after immediate save',{'before':before,'after':after,'snapshot':snapshot['grid'],'saved':saved['grid']},all(id in after and abs(before[id]['width']-after[id]['width'])<3 and abs(before[id]['height']-after[id]['height'])<3 for id in before))
finally:
 try:js("(async()=>{forge.windows.reset();forge.windows.joinDocuments();await forge.saveAll();})()")
 except Exception:pass
 d.close();report={'checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)};(ROOT/'verification-docked-splitters-035.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':report['passed'],'total':report['total']}),flush=True)
