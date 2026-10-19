"""Compiler-standard selectors, real WebView key dispatch and restart persistence.

Requires an installed debug APK on an authorized ARM64 Android device.
Viewport checks emulate tablet dimensions; they do not replace a physical tablet.
"""
import json, pathlib, subprocess, sys, time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'tools'))
from device_cdp import Device, ADB
ROOT = pathlib.Path(__file__).resolve().parents[1]
d = Device()
results = []
original = d.evaluate('forge.state.project')
name = 'workspace-verify-' + str(int(time.time()))

def test(label, fn, check=lambda x: bool(x)):
    try:
        result = fn()
        assert check(result), str(result)[:2500]
        results.append({'test': label, 'passed': True, 'evidence': result})
        print('PASS', label, flush=True)
        return result
    except Exception as exc:
        results.append({'test': label, 'passed': False, 'error': str(exc)})
        print('FAIL', label, str(exc)[:1000], flush=True)

def key(key, code, vk, modifiers=0):
    for kind in ['rawKeyDown', 'keyUp']:
        d.call('Input.dispatchKeyEvent', {'type': kind, 'key': key, 'code': code,
               'windowsVirtualKeyCode': vk, 'nativeVirtualKeyCode': vk, 'modifiers': modifiers})

def viewport(width=1280, height=800):
    d.call('Emulation.setDeviceMetricsOverride', {'width': width, 'height': height,
           'deviceScaleFactor': 1, 'mobile': False})
    time.sleep(.15)

try:
    test('Isolated workspace project', lambda: d.evaluate("(async()=>{await native('newProject',{name:" + json.dumps(name) + ",language:'cpp'});await forge.switchProject(" + json.dumps(name) + ");return forge.state.project;})()"), lambda x: x == name)
    matrix = """(async()=>{const root=forge.state.root;await native('newFile',{path:root+'/standard.c',text:'int main(void) { return 0; }\\n'});await native('newFile',{path:root+'/standard.cpp',text:'int main() { return 0; }\\n'});const result=[];for(const compiler of ['gcc','clang'])for(const [lang,standards]of [['c',cStandards],['cpp',cppStandards]])for(const standard of standards){const b=await native('build',{path:root+'/standard.'+lang,mode:'file',id:'standard-'+compiler+'-'+standard,options:{...forge.settings,compiler,[lang==='c'?'cStandard':'cppStandard']:standard}});result.push({compiler,lang,standard,code:b.code});}return result;})()"""
    test('Every offered C and C++ standard accepted by both compilers', lambda: d.evaluate(matrix), lambda x: len(x) == 38 and all(r['code'] == 0 for r in x))
    viewport()
    test('Tablet viewport fits application shell', lambda: d.evaluate("({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,editor:document.querySelector('#editor').getBoundingClientRect().width})"), lambda x: x['width'] == 1280 and not x['overflow'] and x['editor'] > 500)
    d.evaluate("forge.editor.focus()")
    key('=', 'Equal', 187, 2)
    test('Ctrl plus changes only code zoom', lambda: d.evaluate('({ui:forge.settings.uiScale,code:forge.settings.codeScale})'), lambda x: x == {'ui': 100, 'code': 110})
    key('=', 'Equal', 187, 3)
    test('Ctrl Alt plus changes only UI zoom', lambda: d.evaluate('({ui:forge.settings.uiScale,code:forge.settings.codeScale})'), lambda x: x == {'ui': 105, 'code': 110})
    d.evaluate("(async()=>{await forge.changeSettings({autosave:false});forge.active.model.setValue('#include <vector>\\nint main() {\\n    std::vector<int> values;\\n    values.\\n}\\n');await forge.lsp.start();const uri=forge.active.model.uri.toString();for(let n=0;n<100;n++){if(forge.diagnosticMap.get(uri)?.diagnostics.some(d=>d.code==='expected_unqualified_id'))break;await new Promise(r=>setTimeout(r,100));}forge.editor.setPosition({lineNumber:4,column:12});forge.editor.focus();return true;})()")
    key('s', 'KeyS', 83, 2)
    time.sleep(.2)
    test('Ctrl S saves active source', lambda: d.evaluate("(async()=>({saved:(await native('read',{path:forge.active.path})).text===forge.active.model.getValue()}))()"), lambda x: x['saved'])
    key(' ', 'Space', 32, 2)
    time.sleep(1)
    test('Ctrl Space opens clangd completion popup', lambda: d.evaluate("({visible:!!document.querySelector('.suggest-widget.visible'),text:document.querySelector('.suggest-widget')?.innerText})"), lambda x: x['visible'] and 'begin()' in x['text'] and 'capacity()' in x['text'])
    key('Escape', 'Escape', 27)
    d.evaluate("(async()=>{await forge.changeSettings({autosave:true});forge.setUIScale(115,false);forge.setCodeScale(130,false);forge.splitEditor('side',false);forge.settings.layout={...forge.settings.layout,splitRatio:.37,sidebarWidth:245,panelHeight:175};await native('settings',forge.settings);await forge.persistSession();return true;})()")
    d.close()
    subprocess.run([ADB, 'shell', 'am', 'force-stop', 'com.forgex'], check=True, capture_output=True)
    subprocess.run([ADB, 'shell', 'am', 'start', '-n', 'com.forgex/dev.forge.ide.MainActivity'], check=True, capture_output=True)
    for attempt in range(15):
        time.sleep(.4)
        try:
            d = Device()
            if d.evaluate('!!window.forge?.active'): break
            d.close()
        except Exception:
            if attempt == 14: raise
    viewport()
    test('Restart restores zoom, pane sizes and split with a source model', lambda: d.evaluate("({ui:forge.settings.uiScale,code:forge.settings.codeScale,font:forge.editor.getOption(monaco.editor.EditorOption.fontSize),layout:forge.settings.layout,secondary:forge.secondaryEditor?.getModel()?.uri.toString(),sidebar:document.querySelector('#sidebar').getBoundingClientRect().width})"), lambda x: x['ui'] == 115 and x['code'] == 130 and abs(x['font'] - 18.2) < .1 and x['layout']['splitRatio'] == .37 and x['secondary'] and abs(x['sidebar'] - 281.75) < 2)
finally:
    try:
        d.evaluate("(async()=>{forge.resetLayout();forge.setUIScale(100);forge.setCodeScale(100);await forge.changeSettings({autosave:true});await forge.switchProject(" + json.dumps(original) + ");return true;})()")
        d.call('Emulation.clearDeviceMetricsOverride')
        d.close()
    except Exception: pass
    report = {'device': 'realme RMX3951', 'android': '16', 'testProject': name,
              'results': results, 'passed': sum(r['passed'] for r in results), 'total': len(results),
              'limitations': ['Keyboard events injected through CDP; no physical keyboard tested.', 'Tablet viewport emulated in the phone WebView.']}
    (ROOT / 'verification-workspace.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'total': report['total']}), flush=True)
