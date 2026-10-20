"""Build the shipped examples with Android GCC/CMake; optionally capture our demos."""
import argparse,json,pathlib,subprocess,sys,time
root=pathlib.Path.cwd();sys.path.insert(0,str(root/'tools'))
from device_cdp import Device,ADB
p=argparse.ArgumentParser();p.add_argument('--gallery',action='store_true');args=p.parse_args()
d=Device();checks=[];created=[];stamp=str(int(time.time()));gallery=root/'docs/screenshots'
def js(s):return d.evaluate(s)
def op(n,v=None):return js('native('+json.dumps(n)+','+json.dumps(v or {})+')')
def wait(s):return js('(async()=>{for(let i=0;i<300;i++){if('+s+')return true;await new Promise(r=>setTimeout(r,30));}throw Error("Timeout");})()')
def shot(name):
    if not args.gallery:return
    time.sleep(.25)
    r=js("(async()=>{await NativeEditing.layout();const ready=new Promise(resolve=>{const off=onNative('editorCaptureReady',e=>{off();resolve(e);});});await native('editorCapture');return await ready;})()")
    assert 'error'not in r,r
    gallery.mkdir(exist_ok=True);(gallery/(name+'.png')).write_bytes(subprocess.check_output([ADB,'exec-out','run-as','com.forgex','cat','cache/studio-window.png']))
    print('Captured '+name,flush=True)
def check(name,v,ok):
    checks.append({'test':name,'passed':bool(ok),'evidence':v});print(('PASS 'if ok else 'FAIL ')+name,flush=True);assert ok,str(v)[:500]
original=js('({project:forge.state.project,settings:forge.settings})')
try:
    for folder,expected in [('console-files','C++ Studio: 42'),('formatting','Sum: 16'),('debug-containers','Total: 30')]:
        name='demo-'+folder+'-'+stamp
        op('newProject',{'name':name,'language':'cpp'});created.append(name)
        js('forge.switchProject('+json.dumps(name)+')');base=js('forge.state.root')
        # Existing files belong to the new project just created above.
        for f in sorted((root/'examples'/folder).rglob('*')):
            if not f.is_file():continue
            rel=f.relative_to(root/'examples'/folder).as_posix();path=base+'/'+rel
            if rel in ['main.cpp','CMakeLists.txt','.clang-format']:op('write',{'path':path,'text':f.read_text(encoding='utf-8')})
            else:op('newFile',{'path':path,'text':f.read_text(encoding='utf-8')})
        js("(async()=>{await forge.reloadFromDisk();await forge.refreshTree();await forge.openFile(forge.state.root+'/main.cpp');await forge.changeSettings({compiler:'gcc',cppStandard:'c++20',buildMode:'cmake',target:'app',uiScale:100,codeScale:110,layout:{sidebarWidth:230,panelHeight:210,panelHidden:false}});})()")
        result=js("(async()=>{await forge.build(true);for(let i=0;i<200&&forge.running;i++)await new Promise(r=>setTimeout(r,25));return{build:document.querySelector('#buildOutput').textContent,console:document.querySelector('#consoleOutput').textContent};})()")
        check(folder+' builds and runs from its project root',result,expected in result['console']and 'код 0'in result['build'])
        wait("forge.analysisStatus==='ready'&&forge.diagnosticMap.has(forge.active.model.uri.toString())&&!(forge.diagnosticMap.get(forge.active.model.uri.toString()).diagnostics||[]).some(x=>x.severity===1)")
        if folder=='console-files':
            shot('console-files')
            js("(async()=>{await forge.openFile(forge.state.root+'/CMakeLists.txt');})()");time.sleep(.4);shot('cmake')
            js('forge.newFile()');shot('file-creation');js('StudioPopover.close()')
            js("(async()=>{await forge.openFile(forge.state.root+'/src/summary.cpp');forge.renameTreeItem({path:forge.active.path,dir:false});})()");shot('inline-rename')
            js("forge.treeRename.input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))")
            js('forge.openToolPacks()');shot('tools');js("document.querySelector('#toolPacksDialog').close()")
        elif folder=='formatting':
            js('forge.openFormatter()');js("(()=>{const p=document.querySelector('#formatterPreset');p.value='studio';p.onchange();})()");wait("!document.querySelector('#formatterSave').disabled");shot('formatter');js("document.querySelector('#formatterDialog').close()")
        else:
            js('forge.settings.layout.panelHeight=400;forge.applyUIScale()')
            js("(async()=>{forge.debugger.breakpoints.clear();await forge.debugger.toggleBreakpoint(forge.active.model,24);const build=await native('build',{path:forge.active.path,mode:'cmake',options:forge.settings,id:'gallery-debug'});if(build.code)throw Error('Debug build failed');await forge.debugger.start(build.executable);})()")
            wait('forge.debugger.paused&&forge.debugger.frames?.length');time.sleep(.2);js("forge.debugger.action('continue')");wait('forge.debugger.paused&&forge.debugger.nativeExecution?.line===24');wait('forge.debugger.variablesSerial===forge.debugger.stopSerial')
            js("(()=>{for(const name of ['point','values']){const n=[...document.querySelectorAll('#debugVariables>.debug-value-node')].find(n=>n.dataset.expression===name);n?.querySelector('.debug-value-toggle').click();}})()")
            wait("document.querySelectorAll('#debugVariables .debug-value-children .debug-value-node').length>=5")
            rows=js("[...document.querySelectorAll('#debugVariables .debug-value-row')].map(e=>({height:e.getBoundingClientRect().height,level:e.parentElement.getAttribute('aria-level'),left:e.getBoundingClientRect().left}))")
            check('Debugger rows are compact and nested',rows,bool(rows)and all(x['height']<=26 for x in rows)and max(x['left']for x in rows)>min(x['left']for x in rows)+12)
            shot('debug-containers')
            b=js("document.querySelector('[data-debug-action=next]').getBoundingClientRect().toJSON()")
            d.call('Input.dispatchMouseEvent',{'type':'mouseMoved','x':b['x']+b['width']/2,'y':b['y']+b['height']/2});time.sleep(.65);shot('mouse-hints');js('StudioHover.hide();forge.debugger.stop()')
            js(r"(async()=>{forge.active.model.setValue('#include <vector>\n\nint main() {\n    int unused_value = 0;\n    std::vector<int> values{1, 2, 3};\n    missing_function(values);\n}\n');await forge.saveAll();forge.showPanel('problems');})()")
            wait("(forge.diagnosticMap.get(forge.active.model.uri.toString())?.diagnostics||[]).some(x=>x.message.includes('missing_function'))");time.sleep(.3);shot('diagnostics')
    report=op('performanceReport');check('Local responsiveness ring is bounded and does not contain source',{'entries':len(report)},len(report)<=16 and all('text'not in r and'path'not in r for r in report))
finally:
    try:
        js("(async()=>{if(forge.debugger.active)await forge.debugger.stop();StudioPopover.close();StudioChoices.close();document.querySelectorAll('dialog[open]').forEach(e=>e.close());await forge.saveAll();})()")
        js('forge.switchProject('+json.dumps(original['project'])+')');js('forge.changeSettings('+json.dumps(original['settings'])+')')
    finally:
        d.close();(root/'verification-examples-031.json').write_text(json.dumps({'device':'Xiaomi Pad 6 / Android 14','createdProjects':created,'checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
