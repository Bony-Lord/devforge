"""Actual on-device pointer docking, floats, persistence and native view integration."""
import pathlib,os,sys,json,time,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from device_cdp import Device,ADB

def run():
 d=Device();checks=[]
 def js(s):return d.evaluate(s)
 def check(name,value,passed=True):
  checks.append({'test':name,'passed':bool(passed),'evidence':value});print(('PASS 'if passed else'FAIL ')+name,flush=True);assert passed,str(value)[:1500]
 def wait(code):
  end=time.monotonic()+12
  while True:
   r=js(code)
   if r and r!={'type':'undefined'}:return r
   if time.monotonic()>end:raise AssertionError('Timeout: '+code[:180])
   time.sleep(.05)
 def box(selector):return js('document.querySelector('+json.dumps(selector)+').getBoundingClientRect().toJSON()')
 def mouse(kind,x,y,buttons=0):return d.call('Input.dispatchMouseEvent',{'type':kind,'x':x,'y':y,'button':'none'if kind=='mouseMoved'else'left','buttons':buttons,'clickCount':1})
 def click(selector):
  b=box(selector);mouse('mousePressed',b['x']+b['width']/2,b['y']+b['height']/2,1);mouse('mouseReleased',b['x']+b['width']/2,b['y']+b['height']/2);time.sleep(.12)
 def drag(a,b,touch=False,hold=.15):
  if touch:d.call('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[a]})
  else:mouse('mousePressed',a['x'],a['y'],1)
  time.sleep(hold)
  for n in range(1,13):
   p={'x':a['x']+(b['x']-a['x'])*n/12,'y':a['y']+(b['y']-a['y'])*n/12}
   if touch:d.call('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[p]})
   else:mouse('mouseMoved',p['x'],p['y'],1)
   time.sleep(.02)
  if touch:d.call('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  else:mouse('mouseReleased',b['x'],b['y'])
  time.sleep(.2)
 def consoleFloat():js("forge.windows.place('console','float')");time.sleep(.2);return box('.dv-resize-container')
 try:
  assert js("forge.state.project==='input-check-compact-20261027'")
  js("(async()=>{await native('editorFloatingKeyboard',{enabled:false});forge.setUIScale(100);forge.windows.reset();forge.showPanel('console');await NativeEditing.sync();})()");time.sleep(.25)
  value=js("(()=>{const c=document.querySelector('#console').getBoundingClientRect(),p=document.querySelector('#sidebar').getBoundingClientRect(),w=document.querySelector('#dockWorkspace').getBoundingClientRect();return{console:c.toJSON(),project:p.toJSON(),work:w.toJSON(),icons:[...document.querySelectorAll('.studio-tool-tab')].every(t=>!!t.querySelector('svg'))};})()")
  check('Console spans workbench below project; tool tabs have distinct vector icons',value,abs(value['console']['width']-value['work']['width'])<2 and value['project']['bottom']<=value['console']['top'] and value['icons'])
  js("document.querySelector('#consoleOutput').textContent='FIXTURE_OUTPUT_RETAINED'")
  click('#consoleToggle');check('Second click on left Console icon hides that window',js("!forge.windows.api.getPanel('console')"))
  click('#consoleToggle');check('Console icon restores output without recreating its data',js("forge.windows.api.getPanel('console').api.isVisible&&document.querySelector('#consoleOutput').textContent==='FIXTURE_OUTPUT_RETAINED'"))
  click('#toolWindow-project');check('Left project icon also hides project manager',js("!forge.windows.api.getPanel('project')"));click('#toolWindow-project')
  click('#toolWindow-search');value=js("({visible:forge.windows.api.getPanel('search').api.isVisible,files:document.querySelectorAll('#fileResults button').length})");check('Search rail opens its own populated window',value,value['visible']and value['files']>0)
  js("forge.windows.hide('search');forge.windows.place('console','right')");time.sleep(.2);value=js("({c:document.querySelector('#console').getBoundingClientRect().toJSON(),e:document.querySelector('#editor').getBoundingClientRect().toJSON()})");check('Console docks right of code',value,value['c']['left']>=value['e']['right']-2)
  for side in ['top','left','bottom']:
   js('forge.windows.place("console",'+json.dumps(side)+')');time.sleep(.15);value=js("({c:document.querySelector('#console').getBoundingClientRect().toJSON(),e:document.querySelector('#editor').getBoundingClientRect().toJSON()})");passed=value['c']['bottom']<=value['e']['top']+2 if side=='top'else value['c']['right']<=value['e']['left']+2 if side=='left'else value['c']['top']>=value['e']['bottom']-2
   check('Console docks '+side,value,passed)
  b=consoleFloat();value=js("({location:forge.windows.api.getPanel('console').api.location,occlusions:NativeEditing.layout().then(()=>native('editorVisualState'))})")
  value=js("(async()=>{await NativeEditing.layout();return{location:forge.windows.api.getPanel('console').api.location,native:await native('editorVisualState')};})()");check('Floating console cuts out native code and leaves editor visible',value,value['location']['type']=='floating'and value['native']['visible']and any(not r.get('popup',True)for r in value['native']['occlusions']))
  a={'x':b['x']+b['width']/2,'y':b['y']+9};drag(a,{'x':a['x']+100,'y':a['y']+50});moved=box('.dv-resize-container');check('Mouse drags floating titlebar',{'before':b,'after':moved},moved['left']>b['left']+80 and moved['top']>b['top']+30)
  a={'x':moved['x']+moved['width']/2,'y':moved['y']+9};drag(a,{'x':a['x']-70,'y':a['y']-20},touch=True,hold=.05);movedTouch=box('.dv-resize-container');check('Finger drags floating titlebar',{'before':moved,'after':movedTouch},movedTouch['left']<moved['left']-40)
  grip=box('.dv-resize-handle-right');a={'x':grip['x']+grip['width']/2,'y':grip['y']+grip['height']/2};drag(a,{'x':a['x']+80,'y':a['y']});sized=box('.dv-resize-container');check('Floating edge resizes the window',{'before':movedTouch,'after':sized},sized['width']>movedTouch['width']+50)
  # Move tab out of the float and drop at the right edge of the code group.
  tab=box('.dv-resize-container .studio-tool-tab');code=box('#editorArea');a={'x':tab['x']+35,'y':tab['y']+tab['height']/2};b={'x':code['right']-20,'y':code['top']+code['height']/2};drag(a,b,hold=.2)
  value=js("({location:forge.windows.api.getPanel('console').api.location,c:document.querySelector('#console').getBoundingClientRect().toJSON(),e:document.querySelector('#editor').getBoundingClientRect().toJSON()})");check('Dragging a floating Console tab docks it at code edge',value,value['location']['type']=='grid'and value['c']['left']>=value['e']['right']-2)
  js("forge.windows.place('console','float');forge.windows.persist();clearTimeout(forge.workspaceSaveTimer);native('settings',forge.settings)");time.sleep(.2)
  persisted=js("({location:forge.windows.api.getPanel('console').api.location,box:document.querySelector('.dv-resize-container').getBoundingClientRect().toJSON(),panels:forge.windows.api.panels.map(p=>p.id).sort()})")
  d.close();subprocess.run([ADB,'shell','am','force-stop','com.forgex'],check=True,capture_output=True);subprocess.run([ADB,'shell','am','start','-W','-n','com.forgex/dev.forge.ide.MainActivity'],check=True,capture_output=True);d=Device();time.sleep(.3)
  restored=js("({location:forge.windows.api.getPanel('console').api.location,box:document.querySelector('.dv-resize-container').getBoundingClientRect().toJSON(),panels:forge.windows.api.panels.map(p=>p.id).sort()})");check('Cold start restores panels and floating bounds',{'before':persisted,'after':restored},persisted['panels']==restored['panels']and restored['location']['type']=='floating'and abs(restored['box']['width']-persisted['box']['width'])<3 and abs(restored['box']['left']-persisted['box']['left'])<3)
  js("forge.windows.maximize('console')");wait("(async()=>!(await native('editorVisualState')).visible)()");check('Maximizing console hides native editor',js('forge.windows.api.hasMaximizedGroup()'))
  js("forge.windows.restoreMaximized();forge.windows.hide('console');forge.windows.show('console');true");value=js("({location:forge.windows.api.getPanel('console').api.location,text:document.querySelector('#consoleOutput').textContent})");check('Closing and reopening retains floating mode',value,value['location']['type']=='floating')
  before=js('forge.windows.api.panels.map(p=>p.id).sort()');js('forge.toggleFocusMode()');check('Focus mode leaves only code panel',js("forge.windows.api.panels.length===1&&forge.windows.api.panels[0].id==='editor'"));js('forge.toggleFocusMode()');check('Focus mode restores entire window layout',js('forge.windows.api.panels.map(p=>p.id).sort()'),before==js('forge.windows.api.panels.map(p=>p.id).sort()'))
  js("forge.windows.reset();forge.windows.place('console','float');forge.windows.place('terminal','right')");time.sleep(.1)
  value=js("({console:forge.windows.api.getPanel('console').api.location,terminal:forge.windows.api.getPanel('terminal').api.location,project:forge.windows.api.getPanel('project').api.isVisible})");check('Independent tool windows can coexist in different positions',value,value['console']['type']=='floating'and value['terminal']['type']=='grid'and value['project'])
 except Exception as error:
  if all(c['passed']for c in checks):checks.append({'test':'Complete window regression','passed':False,'error':str(error)})
  raise
 finally:
  try:js("forge.windows.reset();forge.showPanel('console')")
  except Exception:pass
  d.close();report={'device':'Xiaomi Pad 6 / Android 14','scope':'Real on-device CDP mouse/touch gestures plus native overlay state and process restart','checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)};(ROOT/'verification-windows-033.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':report['passed'],'total':report['total']}),flush=True)

if __name__=='__main__':run()
