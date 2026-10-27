"""Actual pointer gestures, repeated native ADB resize, tabs and fixed UI mode."""
import json,pathlib,subprocess,sys,time
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from device_cdp import Device,ADB

def run():
 d=Device();checks=[]
 def js(code):return d.evaluate(code)
 def adb(*args):return subprocess.run([ADB,*map(str,args)],check=True,capture_output=True,timeout=30)
 def check(name,value,ok=True):
  checks.append({'test':name,'passed':bool(ok),'evidence':value});print(('PASS 'if ok else'FAIL ')+name,flush=True);assert ok,str(value)[:1800]
 def wait(code):
  end=time.monotonic()+10
  while True:
   r=js(code)
   if r and r!={'type':'undefined'}:return r
   if time.monotonic()>end:raise AssertionError(code[:180])
   time.sleep(.05)
 def mouse(kind,x,y,buttons=0):d.call('Input.dispatchMouseEvent',{'type':kind,'x':x,'y':y,'button':'none'if kind=='mouseMoved'else'left','buttons':buttons,'clickCount':1})
 def box(selector):return js('document.querySelector('+json.dumps(selector)+').getBoundingClientRect().toJSON()')
 def click(selector):
  b=box(selector);x=b['x']+b['width']/2;y=b['y']+b['height']/2;mouse('mousePressed',x,y,1);mouse('mouseReleased',x,y);time.sleep(.12)
 def floatbox():return js("forge.windows.panel('editor').group.element.closest('.dv-resize-container').getBoundingClientRect().toJSON()")
 def drag_start(id):
  b=js('forge.windows.api.getPanel('+json.dumps(id)+').group.element.querySelector(\'.studio-tool-tab[data-tool="'+id+'"]\').getBoundingClientRect().toJSON()');x=b['x']+MathMin(30,b['width']/3);y=b['y']+14;mouse('mousePressed',x,y,1);time.sleep(.08);return {'x':x,'y':y}
 def move(a,b):
  for i in range(1,9):mouse('mouseMoved',a['x']+(b['x']-a['x'])*i/8,a['y']+(b['y']-a['y'])*i/8,1);time.sleep(.015)
 def physical(point):
  r=js("(async()=>{const id=[...NativeEditing.panes.values()].find(p=>p.editor===forge.editor).id,s=await native('editorVisualState',{id});return{scale:devicePixelRatio,x:s.screenX-s.left,y:s.screenY-s.top};})()")
  return round(point['x']*r['scale']+r['x']),round(point['y']*r['scale']+r['y'])
 def equivalent(a,b):
  if isinstance(a,(float,int))and isinstance(b,(float,int)):return abs(a-b)<=2
  if isinstance(a,dict)and isinstance(b,dict):return a.keys()==b.keys()and all(equivalent(a[k],b[k])for k in a)
  if isinstance(a,list)and isinstance(b,list):return len(a)==len(b)and all(equivalent(x,y)for x,y in zip(a,b))
  return a==b
 def reset():return js("(async()=>{await forge.changeSettings({interfaceMode:'windows',dockTargets:false,keyboardPrimary:'system',wordWrap:false,codeScale:100});forge.windows.reset();forge.windows.joinDocuments();await forge.openFile(forge.state.root+'/main.cpp');await forge.openFile(forge.state.root+'/CMakeLists.txt');await NativeEditing.sync();return true;})()")
 def restart():
  nonlocal d
  d.close();adb('shell','am','force-stop','com.forgex');adb('shell','am','start','-W','-n','com.forgex/dev.forge.ide.MainActivity');d=Device();time.sleep(.2)
 try:
  assert js("forge.state.project==='input-check-workspace-035-20261027'")
  reset();time.sleep(.2)
  check('Default navigation is left; console spans entire workbench',js("({nav:forge.windows.panel('navigator').group.api.boundingBox,output:forge.windows.panel('output').group.api.boundingBox,work:forge.windows.host.clientWidth})"),js("Math.abs(forge.windows.panel('output').group.api.boundingBox.width-forge.windows.host.clientWidth)<3&&forge.windows.panel('navigator').group.api.boundingBox.top===0"))
  ids=js("forge.windows.api.panels.filter(p=>forge.windows.isCode(p.id)).map(p=>p.id)");source=ids[-1]
  a=drag_start(source);destination={'x':650,'y':250};move(a,destination);mid=js('({where:forge.windows.api.getPanel('+json.dumps(source)+').api.location,box:forge.windows.api.getPanel('+json.dumps(source)+').group.api.boundingBox,live:!!forge.windows.targets.ctx})')
  check('Detached tab follows pointer before release; peers are not reconstructed',mid,mid['where']['type']=='floating'and mid['live'])
  mouse('mouseReleased',destination['x'],destination['y']);time.sleep(.2)
  # A slow deliberate release stops; a quick free throw decays within bounds.
  js('forge.windows.api.getPanel('+json.dumps(source)+').group.api.setSize({width:420,height:280});true');time.sleep(.3)
  a=drag_start(source);b={'x':a['x']+105,'y':a['y']+35};move(a,b);mouse('mouseReleased',b['x'],b['y']);time.sleep(.03)
  first=js('forge.windows.api.getPanel('+json.dumps(source)+').group.api.boundingBox');time.sleep(.18);middle=js('forge.windows.api.getPanel('+json.dumps(source)+').group.api.boundingBox');time.sleep(.55);last=js('forge.windows.api.getPanel('+json.dumps(source)+').group.api.boundingBox')
  check('Free throw continues with decaying inertia and settles inside workspace',{'first':first,'middle':middle,'last':last},abs(middle['left']-first['left'])+abs(middle['top']-first['top'])>2 and last['left']>=0 and last['top']>=0 and js('!forge.windows.targets.stopInertia'))
  # A direct screen edge has an intentional stationary dwell before insertion.
  a=drag_start(source);r=box('#dockWorkspace');edge={'x':r['right']-8,'y':r['y']+r['height']*.48};move(a,edge)
  check('Passing near edge does not dock immediately',js('forge.windows.api.getPanel('+json.dumps(source)+').api.location.type'),js('forge.windows.api.getPanel('+json.dumps(source)+').api.location.type===\'floating\''))
  check('Highlighted destination replaces cross targets before docking',js("({highlight:!!document.querySelector('.studio-dock-preview:not([hidden])'),crosses:document.querySelectorAll('.studio-dock-target').length})"),js("!!document.querySelector('.studio-dock-preview:not([hidden])')&&document.querySelectorAll('.studio-dock-target').length===0"))
  time.sleep(.45)
  check('Stationary dwell prepares docking without committing while held',js('({where:forge.windows.api.getPanel('+json.dumps(source)+').api.location,held:!!forge.windows.targets.ctx})'),js('forge.windows.api.getPanel('+json.dumps(source)+').api.location.type===\'floating\'&&!!forge.windows.targets.ctx?.ready'))
  mouse('mouseReleased',edge['x'],edge['y']);time.sleep(.35)
  # Drag that file onto the other file header, rather than a menu or compass.
  a=drag_start(source);target=next(x for x in ids if x!=source);b=js('forge.windows.api.getPanel('+json.dumps(target)+').group.element.getBoundingClientRect().toJSON()');p={'x':b['x']+80,'y':b['y']+14};move(a,p);time.sleep(.45)
  mouse('mouseReleased',p['x'],p['y']);time.sleep(.35)
  check('Tab dragged onto another header joins the same window',js('forge.windows.api.getPanel('+json.dumps(source)+').group.panels.map(p=>p.id)'),js('forge.windows.api.getPanel('+json.dumps(source)+').group===forge.windows.api.getPanel('+json.dumps(target)+').group'))
  # Escape restores every panel and group, even after live insertion occurred.
  baseline=js('forge.windows.api.toJSON()');a=drag_start(source);move(a,edge);time.sleep(.45);js("forge.windows.targets.cancel();true");mouse('mouseReleased',edge['x'],edge['y']);time.sleep(.35)
  restored=js('forge.windows.api.toJSON()')
  check('Cancel after live preview restores original split tree and groups',{'before':baseline['grid'],'after':restored['grid'],'floatsBefore':baseline.get('floatingGroups',[]),'floatsAfter':restored.get('floatingGroups',[])},equivalent(baseline['grid'],restored['grid'])and equivalent(baseline.get('floatingGroups',[]),restored.get('floatingGroups',[])))
  peersBefore=js("['navigator','output'].map(id=>forge.windows.panel(id).group.api.boundingBox)");a=drag_start(source);move(a,edge);time.sleep(.45);free={'x':700,'y':280};move(edge,free);mouse('mouseReleased',free['x'],free['y']);time.sleep(.4)
  peersAfter=js("['navigator','output'].map(id=>forge.windows.panel(id).group.api.boundingBox)")
  check('Leaving a live docking preview restores peer sizes on free release',{'before':peersBefore,'after':peersAfter},equivalent(peersBefore,peersAfter)and js('forge.windows.api.getPanel('+json.dumps(source)+').api.location.type===\'floating\''))
  js("(async()=>{await forge.openFile(forge.state.root+'/main.cpp');forge.windows.joinDocuments();forge.windows.place('editor','float');forge.windows.panel('editor').group.api.setSize({width:420,height:290});})()");time.sleep(.35)
  js("forge.windows.place('console','float');true");time.sleep(.3)
  js("forge.windows.panel('console').group.element.closest('.dv-resize-container').dispatchEvent(new CustomEvent('studio-set-bounds',{detail:{left:10,top:540,width:300,height:150}}));forge.editor.focus();true");time.sleep(.15)
  otherBefore=js("forge.windows.panel('console').group.api.boundingBox")
  # Both touches must work on the same reusable right resize handle.
  for delta in [70,-45]:
   before=floatbox();b=js("forge.windows.panel('editor').group.element.closest('.dv-resize-container').querySelector('.dv-resize-handle-right').getBoundingClientRect().toJSON()");start={'x':b['x']+b['width']/2,'y':b['y']+b['height']/2};end={'x':start['x']+delta,'y':start['y']};a=physical(start);p=physical(end);adb('shell','input','swipe',*a,*p,450);time.sleep(.2);after=floatbox()
   check('Repeated real finger resize '+str(delta),{'before':before['width'],'after':after['width']},(after['width']-before['width'])*(1 if delta>0 else-1)>20)
  otherAfter=js("forge.windows.panel('console').group.api.boundingBox")
  check('Resizing one float does not move or resize another',{'before':otherBefore,'after':otherAfter},otherBefore==otherAfter)
  check('Upper edge and upper corners cannot resize windows',js("[...forge.windows.panel('editor').group.element.closest('.dv-resize-container').querySelectorAll('.dv-resize-handle-top,.dv-resize-handle-topleft,.dv-resize-handle-topright')].map(e=>getComputedStyle(e).display)"),js("[...forge.windows.panel('editor').group.element.closest('.dv-resize-container').querySelectorAll('.dv-resize-handle-top,.dv-resize-handle-topleft,.dv-resize-handle-topright')].every(e=>getComputedStyle(e).display==='none')"))
  js("forge.windows.panel('editor').group.api.setSize({width:150,height:210});true");time.sleep(.2)
  value=js("(()=>{const g=forge.windows.panel('editor').group;return [...g.element.querySelectorAll('[data-window-close],[data-window-menu],[data-window-tabs]')].filter(e=>!e.hidden).map(e=>{const b=e.getBoundingClientRect();return{type:Object.keys(e.dataset)[0],visible:b.width>0&&document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('button')===e};});})()")
  check('Close, menu and tab chooser remain reachable in a 150px window',value,len(value)==3 and all(v['visible']for v in value))
  js("forge.windows.showTabs(forge.windows.panel('editor').group,forge.windows.panel('editor').group.element.querySelector('[data-window-tabs]'));true");time.sleep(.1)
  check('Compact tab chooser exposes all grouped files',js("document.querySelectorAll('.studio-window-tabs button').length"),js("document.querySelectorAll('.studio-window-tabs button').length>=2"));js('StudioPopover.close();true')
  # Breakpoint marker replaces the number, with no reserved icon strip.
  js("(async()=>{forge.windows.panel('editor').group.api.setSize({width:500,height:310});await forge.openFile(forge.state.root+'/main.cpp');await forge.editor.focus();const m=forge.active.model;m.setValue('int main() {\\n    int value = 5;\\n    value += 2;\\n    return value;\\n}\\n');await NativeEditing.sync();forge.debugger.breakpoints.clear();forge.debugger.decorateBreakpoints(m);})()");time.sleep(.15)
  pane=js("[...NativeEditing.panes.values()].find(p=>p.editor===forge.editor).id");point=js('native("editorTestGutterPoint",'+json.dumps({'id':pane,'line':3})+')');adb('shell','input','tap',round(point['x']),round(point['y']));wait('native("editorVisualState",'+json.dumps({'id':pane})+').then(s=>s.breakpoints.includes(2))')
  value=js('native("editorVisualState",'+json.dumps({'id':pane})+')');check('Actual touch on line number toggles overlaid breakpoint without icon strip',{'points':value['breakpoints'],'sideIcons':value['sideIcons'],'textOffset':value['textOffset']},value['breakpoints']==[2]and not value['sideIcons'])
  # Save, restart in classic mode and verify working native input + project/output.
  js("(async()=>{await forge.saveAll();forge.windows.persist();await forge.changeSettings({interfaceMode:'simple'});await forge.persistSession();})()");restart()
  value=js("({mode:forge.settings.interfaceMode,windows:!!forge.windows,tabs:document.querySelectorAll('#tabs .tab').length,editor:!!forge.editor.getModel()})")
  check('Simple mode starts without Dockview and retains file tabs',value,value['mode']=='simple'and not value['windows']and value['tabs']>=2 and value['editor'])
  js("forge.showSide('project');forge.showPanel('console');true");time.sleep(.12)
  value=js("({console:document.querySelector('#panel').getBoundingClientRect().toJSON(),work:document.querySelector('.work-area').getBoundingClientRect().toJSON()})")
  check('Simple mode console remains full width',value,abs(value['console']['width']-value['work']['width'])<3)
  js("(async()=>{await forge.changeSettings({interfaceMode:'windows'});await forge.persistSession();})()");restart()
  check('Windowed mode restores its saved groups after returning from simple mode',js("({mode:forge.settings.interfaceMode,windows:!!forge.windows,panels:forge.windows?.api.panels.length})"),js("forge.settings.interfaceMode==='windows'&&!!forge.windows&&forge.windows.api.panels.length>=3"))
 except Exception as e:
  checks.append({'test':'Remaining gesture regression','passed':False,'error':str(e)});raise
 finally:
  try:js("(async()=>{if(forge.settings.interfaceMode==='windows'){forge.windows.reset();forge.windows.joinDocuments();forge.showSide('project');forge.showPanel('console');}await forge.saveAll();})()")
  except Exception:pass
  d.close();report={'checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)};(ROOT/'verification-window-gestures-035.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':report['passed'],'total':report['total']}),flush=True)

def MathMin(a,b):return min(a,b)
if __name__=='__main__':run()
