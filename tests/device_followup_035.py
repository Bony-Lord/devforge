"""Release-only docking, resize persistence, project configurations and real UBSan/GDB."""
import json,pathlib,subprocess,sys,time
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from device_cdp import Device,ADB

def run():
 d=Device();checks=[]
 def js(s):return d.evaluate(s)
 def check(name,value,ok):
  checks.append({'test':name,'passed':bool(ok),'evidence':value});print(('PASS 'if ok else'FAIL ')+name,flush=True);assert ok,str(value)[:2200]
 def wait(code):
  end=time.monotonic()+15
  while True:
   value=js(code)
   if value and value!={'type':'undefined'}:return value
   if time.monotonic()>end:raise AssertionError(code[:180])
   time.sleep(.05)
 def mouse(t,x,y,buttons=0):d.call('Input.dispatchMouseEvent',{'type':t,'x':x,'y':y,'button':'none'if t=='mouseMoved'else'left','buttons':buttons,'clickCount':1})
 def click(selector):
  b=js('document.querySelector('+json.dumps(selector)+').getBoundingClientRect().toJSON()');x=b['x']+b['width']/2;y=b['y']+b['height']/2;mouse('mousePressed',x,y,1);mouse('mouseReleased',x,y);time.sleep(.25)
 def move(a,b):
  for i in range(1,9):mouse('mouseMoved',a['x']+(b['x']-a['x'])*i/8,a['y']+(b['y']-a['y'])*i/8,1);time.sleep(.015)
 def start(id,ratio=.2,title=False):
  selector='.dv-floating-titlebar'if title else'.studio-tool-tab[data-tool="'+id+'"]';b=js('forge.windows.api.getPanel('+json.dumps(id)+').group.element'+('.closest(".dv-resize-container")'if title else'')+'.querySelector('+json.dumps(selector)+').getBoundingClientRect().toJSON()');p={'x':b['x']+b['width']*ratio,'y':b['y']+b['height']/2};mouse('mousePressed',p['x'],p['y'],1);return p
 def bounds(id):return js('forge.windows.panel('+json.dumps(id)+').group.element.closest(".dv-resize-container").getBoundingClientRect().toJSON()')
 try:
  assert js("forge.state.project==='input-check-workspace-035-20261027'")
  js("(async()=>{document.querySelector('#runConfigurationsDialog')?.close();await native('editorWebInput',{focused:false});if(forge.debugger.active)await forge.debugger.stop();await forge.changeSettings({keyboardPrimary:'system',compiler:'gcc',buildMode:'file',runtimeChecks:'undefined'});forge.windows.reset();await forge.openFile(forge.state.root+'/main.cpp');await forge.openFile(forge.state.root+'/CMakeLists.txt');forge.windows.joinDocuments();})()");time.sleep(.35)
  click('[data-tool="project"].activity');check('Second activity-rail press hides the navigation window',js("!forge.windows.panel('navigator')"),js("!forge.windows.panel('navigator')"));click('[data-tool="project"].activity');check('Next rail press restores navigation',True,js("!!forge.windows.panel('navigator')"));click('[data-tool="search"].activity');check('Different rail action changes the existing navigator',js('forge.windows.sideMode'),js("forge.windows.sideMode==='search'"));click('[data-tool="search"].activity');check('Repeated press also hides Search mode',True,js("!forge.windows.panel('navigator')"));js("forge.windows.show('project');true")
  for name in ['console','project','editor']:
   js('forge.windows.place('+json.dumps(name)+',"float");true');time.sleep(.35);js('forge.windows.setFloatingBounds(forge.windows.panel('+json.dumps(name)+').group,{left:380,top:110,width:420,height:300});true');time.sleep(.2)
   before=bounds(name);x=before['right']+2;y=before['y']+before['height']/2;mouse('mousePressed',x,y,1);move({'x':x,'y':y},{'x':x+60,'y':y});mid=bounds(name);mouse('mouseReleased',x+60,y);time.sleep(.5);after=bounds(name)
   check(name+' resize survives pointer release and layout settling',{'before':before['width'],'during':mid['width'],'after':after['width']},after['width']>before['width']+35 and abs(after['width']-mid['width'])<2)
   js('forge.windows.hide('+json.dumps(name)+');true');time.sleep(.3);js('forge.windows.show('+json.dumps(name)+');true');time.sleep(.3);again=bounds(name);check(name+' size survives hide/show',{'before':after,'reopened':again},abs(after['width']-again['width'])<2 and abs(after['height']-again['height'])<2)
  js("forge.windows.reset();forge.windows.joinDocuments();await forge.openFile(forge.state.root+'/main.cpp');".replace('await ','void '));time.sleep(.3)
  ids=js('forge.windows.api.panels.filter(p=>forge.windows.isCode(p.id)).map(p=>p.id)');source=ids[0];other=ids[1]
  b=js('forge.windows.api.getPanel('+json.dumps(other)+').group.element.querySelector(\'.studio-tool-tab[data-tool="'+other+'"]\').getBoundingClientRect().toJSON()');a=start(source);p={'x':b['right']-8,'y':b['y']+14};move(a,p);order=js('forge.windows.api.getPanel('+json.dumps(source)+').group.panels.map(p=>p.id)');check('Dragging across sibling tab reorders in-place without detaching',order,order.index(source)>order.index(other)and js('forge.windows.api.getPanel('+json.dumps(source)+').api.location.type===\'grid\''));mouse('mouseReleased',p['x'],p['y']);time.sleep(.3)
  a=start(source);r=js('forge.windows.host.getBoundingClientRect().toJSON()');edge={'x':r['right']-17,'y':r['y']+r['height']*.45};move(a,edge);time.sleep(.12);preview=js("(()=>{const e=document.querySelector('.studio-dock-preview');return{side:e?.dataset.side,opacity:e&&getComputedStyle(e).opacity,ready:e?.dataset.ready,where:forge.windows.api.getPanel("+json.dumps(source)+").api.location.type};})()");check('Moving over right screen edge shows a pale destination',preview,preview['side']=='right'and float(preview['opacity'])<1 and preview['where']=='floating');time.sleep(.35);check('Dwell readies preview but does not attach while finger is down',True,js("forge.windows.targets.ctx?.ready?.side==='right'&&forge.windows.api.getPanel("+json.dumps(source)+").api.location.type==='floating'"));mouse('mouseReleased',edge['x'],edge['y']);time.sleep(.4);check('Right docking commits only on pointer release',True,js('forge.windows.api.getPanel('+json.dumps(source)+').api.location.type===\'grid\''))
  # The window hit band is intentionally wider than the screen band.
  js('forge.windows.targets.startPoint={x:500,y:250,pointerId:99};forge.windows.targets.begin(['+json.dumps(source)+']);true');box=js('forge.windows.api.getPanel('+json.dumps(other)+').group.element.getBoundingClientRect().toJSON()');target=js('forge.windows.targets.intent({clientX:'+str(box['right']-45)+',clientY:'+str(box['y']+box['height']*.6)+'})');js('forge.windows.targets.clear();forge.windows.endDrag();true');check('Window-side docking works 45px inside its edge',target,target and target['side']=='right'and target['scope']=='window')
  js('forge.windows.place('+json.dumps(source)+',"float");true');time.sleep(.4);b=bounds(source);a=start(source,ratio=.8,title=True);p={'x':43,'y':300};move(a,p);time.sleep(.15);outside=bounds(source);check('Window can travel past workspace edge while held',outside,outside['left']<r['left']-50);mouse('mouseReleased',p['x'],p['y']);time.sleep(.5);check('Mostly offscreen release folds window away without closing its document',True,js('!forge.windows.api.getPanel('+json.dumps(source)+')&&forge.docs.size>=2'))
  js("forge.windows.reset();await forge.openFile(forge.state.root+'/main.cpp');".replace('await ','void '));time.sleep(.3)
  ui=js("(()=>{forge.configurations.edit();const e=document.querySelector('#runConfigurationsDialog');return{open:e.open,columns:!!e.querySelector('.studio-config-sidebar')&&!!e.querySelector('.studio-config-form'),rows:e.querySelectorAll('[data-configuration]').length};})()");check('Configuration editor has CLion-style list and independent details',ui,ui['open']and ui['columns']and ui['rows']>=3)
  time.sleep(.15);ui=js("(()=>{const s=document.querySelector('#runConfigurationsDialog [data-field=profile]').parentElement.querySelector('.studio-select'),c=document.querySelector('#runConfigurationsDialog [data-field=buildBeforeRun]');return{select:s.getBoundingClientRect().width,checkbox:c.getBoundingClientRect().width};})()");check('Enhanced profile chooser and build checkbox retain usable dimensions',ui,ui['select']>150 and ui['checkbox']>=14)
  # Genuine floating keyboard commits into an HTML form instead of source.
  before=js('forge.active.model.getValue()');js("(async()=>{await forge.changeSettings({keyboardPrimary:'floating'});const field=document.querySelector('#runConfigurationsDialog [data-field=name]');field.focus();field.setSelectionRange(field.value.length,field.value.length);await native('editorWebInput',{focused:true});await native('keyboard');})()");time.sleep(.2);k=js("native('editorTestFloatingKeyboard').then(k=>k.keys.find(v=>v.action==='a'))");subprocess.run([ADB,'shell','input','tap',str(round(k['x']+k['width']/2)),str(round(k['y']+k['height']/2))],check=True,capture_output=True);time.sleep(.2);check('Floating keyboard edits configuration fields without changing source',js("document.querySelector('#runConfigurationsDialog [data-field=name]').value"),js('forge.active.model.getValue()')==before and js("document.querySelector('#runConfigurationsDialog [data-field=name]').value.endsWith('a')"));js("document.querySelector('#runConfigurationsDialog').close();native('editorWebInput',{focused:false});forge.changeSettings({keyboardPrimary:'system'});true")
  # Compile and execute recoverable bounds UB in the actual GCC+GDB inferior.
  sourceText='#include <stdio.h>\nint main() {\n    volatile int index = 3;\n    int data[3] = {1, 2, 3};\n    printf("value=%d\\n", data[index]);\n    puts("CONTINUED_AFTER_WARNING");\n    return 0;\n}\n'
  js('(async()=>{await forge.openFile(forge.state.root+"/main.cpp");forge.active.model.setValue('+json.dumps(sourceText)+');await forge.saveAll();forge.debugger.breakpoints.clear();window.runtimeOptions={...forge.settings,compiler:"gcc",debugSession:true,runtimeChecks:"undefined"};window.runtimeBuild=await native("build",{path:forge.active.path,mode:"file",options:runtimeOptions,id:"runtime-bounds"});})()');check('GCC debug runtime instrumentation links successfully',js('runtimeBuild'),js('runtimeBuild.code===0&&runtimeBuild.exists'))
  js('(async()=>{await forge.debugger.start(runtimeBuild.executable,[],runtimeOptions);})()');wait('forge.debugger.paused');js('forge.debugger.command("-exec-continue")');wait('!forge.debugger.active');time.sleep(.25)
  result=js("({warnings:forge.runtimeWarnings,text:document.querySelector('#consoleOutput').textContent,markers:monaco.editor.getModelMarkers({owner:'runtime-warning'}).map(m=>({severity:m.severity,line:m.startLineNumber,message:m.message}))})");check('Real out-of-bounds access is a warning and inferior continues',result,result['warnings']and 'CONTINUED_AFTER_WARNING'in result['text']and all(m['severity']==4 for m in result['markers']))
  # CMake File API must resolve a target whose executable has a different name.
  cmake='cmake_minimum_required(VERSION 3.16)\nproject(followup LANGUAGES CXX)\nadd_executable(app main.cpp)\nset_target_properties(app PROPERTIES OUTPUT_NAME different_name RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/nested")\n'
  js('(async()=>{await forge.openFile(forge.state.root+"/CMakeLists.txt");forge.active.model.setValue('+json.dumps(cmake)+');await forge.saveAll();window.profileOptions={...forge.settings,compiler:"gcc",debugSession:false,buildDirectory:".forge/profile-file-api",cmakeProfile:"file-api",target:"app",cmakeOptions:[]};window.cmakeBuilt=await native("build",{mode:"cmake",options:profileOptions,id:"file-api"});})()');value=js('cmakeBuilt');check('CMake selects named target and discovers real renamed/nested artifact',value,value['code']==0 and value['exists']and value['executable'].endswith('/nested/different_name'))
  # Hand-written argv tasks work without CMake/compiler conventions.
  value=js("native('build',{mode:'custom',options:{workingDirectory:'.',environment:{STUDIO_CUSTOM:'yes'},buildCommands:[['/system/bin/sh','-c','test \"$STUDIO_CUSTOM\" = yes && printf manual > .manual-check']],executable:''},id:'custom-argv'})");check('Manual project executes explicit build argv and environment',value,value['code']==0)
 except Exception as e:
  checks.append({'test':'Remaining follow-up checks','passed':False,'error':str(e)});raise
 finally:
  try:js("(async()=>{if(forge.debugger.active)await forge.debugger.stop();document.querySelector('#runConfigurationsDialog')?.close();await native('editorWebInput',{focused:false});await forge.changeSettings({keyboardPrimary:'system'});forge.windows.reset();await forge.openFile(forge.state.root+'/main.cpp');await forge.saveAll();})()")
  except Exception:pass
  d.close();report={'checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)};(ROOT/'verification-followup-035.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':report['passed'],'total':report['total']}),flush=True)

if __name__=='__main__':run()
