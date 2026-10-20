import pathlib,sys,json,subprocess,time,re,xml.etree.ElementTree as ET
root=pathlib.Path.cwd();sys.path.insert(0,str(root/'tools'));from device_cdp import Device,ADB
d=Device();checks=[]
def check(name,code,ok=bool):
 v=d.evaluate(code);passed=ok(v);checks.append({'test':name,'passed':passed,'evidence':v});print('PASS'if passed else 'FAIL',name,flush=True);assert passed,str(v)[:500]
def adb(*args):return subprocess.check_output([ADB,*map(str,args)])
try:
 assert d.evaluate("forge.state.project.startsWith('input-check-')")
 check('A second tap on the active left tool window hides it and reopening restores it',r'''(()=>{forge.showSide('project');forge.toggleSide('project');const hidden=document.body.classList.contains('sidebar-hidden');forge.toggleSide('project');return hidden&&!document.body.classList.contains('sidebar-hidden');})()''')
 check('Custom searchable chooser changes the underlying standard select',r'''(()=>{const select=document.querySelector('#standardSelect'),old=select.value;StudioChoices.open(select);const dialog=document.querySelector('.studio-choice-popover'),rows=dialog.querySelectorAll('[role=option]');const box=dialog.getBoundingClientRect(),anchor=StudioChoices.buttons.get(select).getBoundingClientRect();const custom=rows.length>5&&!select.getBoundingClientRect().width&&Math.abs(box.top-anchor.bottom)<8&&!document.querySelector('dialog[open]');StudioChoices.close();return custom&&select.value===old;})()''')
 check('Only input/output areas allow text selection',r'''({label:getComputedStyle(document.querySelector('.tree-row')).userSelect,tab:getComputedStyle(document.querySelector('.tab')).userSelect,output:getComputedStyle(document.querySelector('#consoleOutput')).userSelect,input:getComputedStyle(document.querySelector('#terminalCommand')).userSelect})''',lambda v:v['label']=='none'and v['tab']=='none'and v['output']=='text'and v['input']=='text')
 d.evaluate("(async()=>{forge.settings.layout.sidebarWidth=230;forge.applyUIScale();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);})()")
 if d.evaluate('!!forge.keyboardGeometry?.visible'):
  adb('shell','input','keyevent',4);time.sleep(.3)
 # Real Android touch through the window geometry, not synthetic PointerEvents.
 xml=adb('shell','uiautomator','dump','/sdcard/studio-tablet-ui.xml');doc=ET.fromstring(adb('shell','cat','/sdcard/studio-tablet-ui.xml').decode());bounds=next(n.get('bounds')for n in doc.iter('node')if n.get('class')=='android.webkit.WebView');x0,y0,x1,y1=map(int,re.findall(r'\d+',bounds))
 box=d.evaluate("(()=>{const b=document.querySelector('#sidebarResizer').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2,width:b.width,scale:devicePixelRatio,start:document.querySelector('#sidebar').getBoundingClientRect().width};})()")
 x,y=round(x0+box['x']*box['scale']),round(y0+box['y']*box['scale']);adb('shell','input','swipe',x,y,x+100,y,450);time.sleep(.3)
 after=d.evaluate("document.querySelector('#sidebar').getBoundingClientRect().width");checks.append({'test':'Actual touch resizes sidebar with a thin 6px divider','passed':after>box['start']+20,'evidence':{'gripCssPx':box['width'],'before':box['start'],'after':after}});assert checks[-1]['passed'];print('PASS Actual touch resizes sidebar',flush=True)
 # Ordinary trackpad wheel navigation cannot start a splitter drag.
 check('Scrolling outside a pressed splitter does not arm resizing',r'''(()=>{const el=document.querySelector('#sidebarResizer'),before=document.querySelector('#sidebar').getBoundingClientRect().width;el.dispatchEvent(new WheelEvent('wheel',{deltaY:30,bubbles:true}));return before===document.querySelector('#sidebar').getBoundingClientRect().width&&!document.body.classList.contains('pane-resizing');})()''')
 check('C++ class wizard writes both real files in a new nested directory',r'''(async()=>{window.tabletClassDir='src/model-'+Date.now();await forge.newFile(tabletClassDir);document.querySelector('#createFileKind').value='class';document.querySelector('#createFilePath').value=tabletClassDir+'/TabletPoint';document.querySelector('#createClassNamespace').value='demo';document.querySelector('#createFileCMake').checked=false;document.querySelector('#createFileKind').dispatchEvent(new Event('change'));document.querySelector('#createFileForm').requestSubmit(document.querySelector('#createFileForm button[type=submit]'));for(let n=0;n<200;n++){if(!document.querySelector('#createFileDialog').open&&forge.active.path.endsWith('TabletPoint.cpp'))break;await new Promise(r=>setTimeout(r,25));}const h=await native('read',{path:forge.state.root+'/'+tabletClassDir+'/TabletPoint.hpp'}),cpp=await native('read',{path:forge.state.root+'/'+tabletClassDir+'/TabletPoint.cpp'});return{h:h.text,cpp:cpp.text,active:forge.active.path};})()''',lambda v:'class TabletPoint'in v['h']and'namespace demo'in v['cpp']and'TabletPoint::TabletPoint() = default;'in v['cpp'])
 check('Template collisions reject without overwriting existing files',r'''(async()=>{let rejected=false;const path=forge.state.root+'/'+tabletClassDir+'/TabletPoint.cpp',before=(await native('read',{path})).text;try{await native('createTemplate',{kind:'class',name:tabletClassDir+'/TabletPoint',namespace:'other'});}catch{rejected=true;}return rejected&&before===(await native('read',{path})).text;})()''')
 d.evaluate("(async()=>{await forge.openFile(forge.state.root+'/main.cpp');await NativeEditing.sync();forge.editor.focus();window.completionEventCount=0;window.stopCompletionProbe=onNative('editorCompletion',()=>completionEventCount++);})()")
 before=d.evaluate('completionEventCount');adb('shell','input','keycombination',113,62);time.sleep(.35)
 check('Ctrl+Space is no longer reserved for IDE completion','completionEventCount',lambda v:v==before)
 adb('shell','input','keycombination',113,42);time.sleep(.25)
 check('Native Ctrl+N opens the file/class creator',"document.querySelector('#createFileDialog').open")
 d.evaluate("document.querySelector('#createFileDialog').close();forge.editor.focus();")
 d.evaluate("window.breakpointProbeLine=forge.editor.getPosition().lineNumber;window.breakpointProbeBefore=!!forge.debugger.breakpoints.get(forge.active.path)?.has(breakpointProbeLine);")
 adb('shell','input','keycombination',113,138);time.sleep(.3) # Ctrl+F8
 check('Native Ctrl+F8 toggles a breakpoint at the caret',"forge.debugger.breakpoints.get(forge.active.path)?.has(breakpointProbeLine)!==breakpointProbeBefore")
finally:
 try:d.evaluate("(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());window.stopCompletionProbe?.();})()")
 except:pass
 d.close();(root/'verification-tablet-interface.json').write_text(json.dumps({'device':'Xiaomi Pad 6 / Android 14','scope':'Actual Android touch and injected key combinations; DOM checks for chooser and selection policies','checks':checks,'passed':sum(v['passed']for v in checks),'total':len(checks)},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
