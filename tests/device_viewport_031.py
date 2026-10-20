"""Native gesture/rendering probes plus real Android swipes. Disposable project only."""
import io,json,pathlib,subprocess,sys,time
root=pathlib.Path.cwd();sys.path.insert(0,str(root/'tools'));from device_cdp import Device,ADB
from PIL import Image
d=Device();checks=[]
def js(value):return d.evaluate(value)
def op(name,data=None):return js('native('+json.dumps(name)+','+json.dumps(data or {})+')')
def check(name,value,passed):
    checks.append({'test':name,'passed':bool(passed),'evidence':value});print(('PASS 'if passed else 'FAIL ')+name,flush=True);assert passed,str(value)[:700]
def adb(*args):return subprocess.check_output([ADB,*map(str,args)])
def capture():
    js("(async()=>{const done=new Promise(resolve=>{const off=onNative('editorCaptureReady',e=>{off();resolve(e);});});await native('editorCapture');return await done;})()");return Image.open(io.BytesIO(adb('exec-out','run-as','com.forgex','cat','cache/studio-window.png'))).convert('RGB')
def anchor_delta(last,after):
    return [last['offsetX']-after['offsetX'],last['offsetY']-after['offsetY']]
def gesture(start,end):
    before=op('editorVisualState');cx=before['width']*.52;cy=before['height']*.45
    points=lambda span:[{'x':cx-span,'y':cy},{'x':cx+span,'y':cy}]
    op('editorTestTouch',{'action':0,'points':points(start)[:1]});op('editorTestTouch',{'action':261,'points':points(start)})
    frames=[]
    for i in range(1,13):
        span=start+(end-start)*i/12;op('editorTestTouch',{'action':2,'points':points(span)});time.sleep(.025);frames.append(op('editorVisualState'))
    time.sleep(.04);last=op('editorVisualState');op('editorTestTouch',{'action':262,'points':points(end)});op('editorTestTouch',{'action':1,'points':points(end)[:1]});time.sleep(.25)
    return before,frames,last,op('editorVisualState')
try:
    assert js("forge.state.project.startsWith('input-check-')")
    js("(async()=>{await forge.changeSettings({uiScale:100,codeScale:100,wordWrap:false});const path=forge.state.root+'/viewport-'+Date.now()+'.cpp';await native('newFile',{path,text:'int main() {\\n    int value = 42; // '+('long code '.repeat(40))+'RIGHT_EDGE_END\\n    return value;\\n}\\n'});await forge.refreshTree();await forge.openFile(path);forge.editor.setPosition({lineNumber:3,column:5});await NativeEditing.sync();await forge.debugger.toggleBreakpoint(forge.active.model,2);})()")
    # The source expression above deliberately uses escaped JS newlines.
    js(r"(async()=>{const m=forge.active.model;m.setValue(m.getValue().replaceAll('\\n','\n'));await forge.saveAll();})()")
    time.sleep(.25)
    before,frames,last,after=gesture(150,225)
    check('Pinch transforms both axes together and renders the complete viewport',{'before':before['fontPx'],'scales':[[f['viewScaleX'],f['viewScaleY'],f['innerWidth'],f['width']]for f in frames],'after':after['fontPx']},after['fontPx']>before['fontPx']*1.45 and len({f['viewScaleX']for f in frames})>=6 and all(abs(f['viewScaleX']-f['viewScaleY'])<.0001 and abs(f['innerWidth']*f['viewScaleX']-f['width'])<2 for f in frames))
    check('Lifting fingers preserves both scroll coordinates after zoom in',{'during':[last['offsetX'],last['offsetY']],'after':[after['offsetX'],after['offsetY']]},max(abs(x)for x in anchor_delta(last,after))<=2)
    before,frames,last,after=gesture(225,150)
    check('Zoom out reflows fully and preserves the final anchor',{'before':before['fontPx'],'after':after['fontPx'],'during':[last['offsetX'],last['offsetY']],'settled':[after['offsetX'],after['offsetY']]},abs(after['fontPx']-29.75)<.3 and max(abs(x)for x in anchor_delta(last,after))<=2 and not after['preview'])
    image=capture();state=op('editorVisualState');y=round(state['top']+state['rowHeight']+2);x1=round(state['left']+state['width']*.55);x2=round(state['left']+state['width']-8);c1=image.getpixel((x1,y));c2=image.getpixel((x2,y))
    check('Breakpoint background reaches the right edge after zooming',{'middle':c1,'rightEdge':c2,'width':state['width']},sum(abs(a-b)for a,b in zip(c1,c2))<8 and c2[0]>c2[1]+5)
    coverage=[]
    for percent in [50,75,100,125,150,175,200,250]:
        js('forge.setCodeScale('+str(percent)+')');time.sleep(.12);state=op('editorVisualState');im=capture();top=round(state['top']+state['rowHeight']);right=round(state['left']+state['width']-8);bg=im.getpixel((right,top+1));area=im.crop((right-80,top+2,right,round(top+state['rowHeight']-1)));ink=sum(1 for c in area.get_flattened_data() if max(c)-min(c)<35 and min(c)>80);coverage.append({'percent':percent,'rightBackground':bg,'textPixelsAtRight':ink,'physicalWidth':state['width'],'logicalWidth':state['innerWidth'],'viewScale':state['viewScaleX']})
    check('Right-edge text and full-line background survive eight zoom levels',coverage,all(c['rightBackground'][0]>c['rightBackground'][1]+5 and c['textPixelsAtRight']>4 and abs(c['logicalWidth']*c['viewScale']-c['physicalWidth'])<2 for c in coverage))
    js('forge.setCodeScale(100)');time.sleep(.15)
    js("(async()=>{forge.editor.setPosition({lineNumber:2,column:forge.active.model.getLineMaxColumn(2)});await NativeEditing.sync();})()")
    time.sleep(.12);end=op('editorVisualState');check('Long code remains horizontally reachable after zoom',{'offsetX':end['offsetX'],'maxX':end['maxX'],'layoutWidth':end['layoutWidth'],'viewport':end['width']},end['offsetX']>1000 and end['maxX']>end['width'])
    # Regression missed by the original zero-scroll coverage check: View.draw's
    # canvas is in scrolled content coordinates, including at fractional scales.
    js("(async()=>{forge.active.model.setValue(Array.from({length:180},(_,i)=>'// row '+i+' '+('long code '.repeat(120))).join('\\n'));await forge.debugger.toggleBreakpoint(forge.active.model,99);await NativeEditing.sync();})()")
    scrolled=[]
    for percent in [50,100,137.47,175,250]:
        js('forge.setCodeScale('+str(percent)+')');time.sleep(.12)
        js('forge.editor.setPosition({lineNumber:100,column:500})');time.sleep(.15)
        s=op('editorVisualState');im=capture();row_top=s['top']+98*s['rowHeight']-s['offsetY'];right=round(s['left']+s['width']-8)
        y=round(row_top+2);bg=im.getpixel((right,y));area=im.crop((right-80,round(row_top+2),right,round(row_top+s['rowHeight']-2)));ink=sum(1 for c in area.get_flattened_data() if max(c)-min(c)<40 and min(c)>80)
        scrolled.append({'percent':percent,'offset':[s['offsetX'],s['offsetY']],'rightBackground':bg,'textPixelsAtRight':ink})
    check('Scrolled code and breakpoint background reach the right edge at fractional scales',scrolled,all(c['offset'][0]>100 and c['offset'][1]>100 and c['rightBackground'][0]>c['rightBackground'][1]+5 and c['textPixelsAtRight']>4 for c in scrolled))
    js('forge.setCodeScale(100)');time.sleep(.15)
    js("forge.editor.setPosition({lineNumber:1,column:1})");time.sleep(.1)
    # Real Android swipe while the caret is outside the new viewport.
    js("(async()=>{forge.active.model.setValue(Array.from({length:700},(_,i)=>'// row '+i).join('\\n'));await NativeEditing.sync();forge.editor.setPosition({lineNumber:400,column:1});})()")
    time.sleep(.1);state=op('editorVisualState');x=round(state['left']+state['width']*.6);y=round(58+state['top']+state['height']*.4);adb('shell','input','swipe',x,y,x,y+180,300);time.sleep(.8)
    for _ in range(20):
        a=op('editorVisualState')['offsetY'];time.sleep(.1)
        if abs(op('editorVisualState')['offsetY']-a)<.1:break
    before=op('editorVisualState');point=js("(()=>{const b=document.querySelector('#panelResizer').getBoundingClientRect();return{x:(b.x+b.width*.7)*devicePixelRatio,y:58+(b.y+b.height/2)*devicePixelRatio};})()")
    adb('shell','input','swipe',round(point['x']),round(point['y']),round(point['x']),round(point['y']-100),500);time.sleep(.15);after=op('editorVisualState')
    check('Dragging the console boundary leaves the code scroll anchor stable',{'before':before['offsetY'],'after':after['offsetY'],'oldHeight':before['height'],'newHeight':after['height']},before['offsetY']>1000 and abs(before['offsetY']-after['offsetY'])<=1 and before['height']!=after['height'])
    js("forge.showPanel('debug')");b=js("document.querySelector('[data-debug-action=next]').getBoundingClientRect().toJSON()")
    d.call('Input.dispatchMouseEvent',{'type':'mouseMoved','x':b['x']+b['width']/2,'y':b['y']+b['height']/2});time.sleep(.65)
    tip=js("document.querySelector('.studio-hover-tip')?.textContent");check('Mouse hover shows the debugger action and Android shortcut',tip,bool(tip)and'Ctrl+Alt' in tip)
    js("StudioHover.hide();forge.editor.focus();forge.active.model.setValue('int main() { missing_hover_probe(); }\\n')");time.sleep(.3)
    for _ in range(100):
        found=js("(forge.diagnosticMap.get(forge.active.model.uri.toString())?.diagnostics||[]).some(x=>x.message.includes('missing_hover_probe'))")
        if found:break
        time.sleep(.04)
    op('editorTestHover',{'line':0,'column':0,'action':9});op('editorTestHover',{'line':0,'column':17,'action':7});time.sleep(1.3);shown=op('editorTestHover',{'line':0,'column':17,'action':7})
    check('Mouse hover opens the native detailed diagnostic without clicking',{'clangdDiagnostic':found,'nativeTooltip':shown},found and shown)
finally:
    try:op('editorTestHover',{'line':0,'column':0,'action':10});js('StudioHover.hide()')
    except Exception:pass
    d.close();(root/'verification-viewport-031.json').write_text(json.dumps({'device':'Xiaomi Pad 6 / Android 14','gestureInjection':'MotionEvent dispatched to own native editor; real ADB console swipe; CDP mouse for HTML control','checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
