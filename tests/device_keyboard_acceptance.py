"""Real Android IME and configurable overlay, with optional physical key taps.

--tap-q X Y --tap-space X Y supplies observed key centres for the device's
currently visible Latin keyboard; do not reuse these positions on another layout.
"""
import argparse, json, pathlib, subprocess, sys, time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'tools'))
from device_cdp import Device, ADB
ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--tap-q', nargs=2, type=int)
parser.add_argument('--tap-space', nargs=2, type=int)
args = parser.parse_args()
d = Device()
original = d.evaluate('({project:forge.state.project,settings:forge.settings})')
name = 'keyboard-verify-' + str(int(time.time()))
results = []

def test(label, fn, check):
    try:
        value = fn()
        assert check(value), str(value)
        results.append({'test': label, 'passed': True, 'evidence': value})
        print('PASS', label, flush=True)
    except Exception as exc:
        results.append({'test': label, 'passed': False, 'error': str(exc)})
        print('FAIL', label, str(exc), flush=True)

def metrics(percent):
    return d.evaluate("(async()=>{forge.settings.keyboardOverlap=" + str(percent) + ";await native('settings',forge.settings);await new Promise(r=>setTimeout(r,350));return {height:innerHeight,geometry:forge.keyboardGeometry};})()")

try:
    subprocess.run([ADB, 'shell', 'input', 'keyevent', '4'], capture_output=True)
    d.evaluate("(async()=>{await forge.saveAll();await native('newProject',{name:" + json.dumps(name) + ",language:'cpp'});await forge.switchProject(" + json.dumps(name) + ");forge.active.model.setValue('// IME: \\nint main() { return 0; }\\n');forge.editor.setPosition({lineNumber:1,column:9});forge.editor.focus();return true;})()")
    baseline = metrics(100)['height']
    d.evaluate("document.querySelector('#keyboardButton').click()")
    time.sleep(.7)
    test('Full IME overlay preserves WebView height', lambda: metrics(100), lambda r: r['geometry']['visible'] and r['geometry']['height'] > 100 and abs(r['height'] - baseline) <= 1 and r['geometry']['reserved'] == 0)
    test('50 percent overlay reserves half the IME height', lambda: metrics(50), lambda r: abs(r['geometry']['reserved'] - r['geometry']['height'] / 2) < 1 and abs(r['height'] - baseline + r['geometry']['reserved']) < 2)
    test('Zero overlay shrinks by the full IME height', lambda: metrics(0), lambda r: abs(r['geometry']['height'] - r['geometry']['reserved']) < 1 and abs(r['height'] - baseline + r['geometry']['height']) < 2)
    metrics(100)
    if args.tap_q and args.tap_space:
        d.evaluate('forge.editor.setPosition({lineNumber:1,column:9});forge.editor.focus()')
        for point in [args.tap_q, args.tap_space]:
            subprocess.run([ADB, 'shell', 'input', 'tap', *map(str, point)], check=True)
        time.sleep(.2)
        test('Real screen keys commit text into the Monaco model', lambda: d.evaluate('({focus:document.hasFocus(),text:forge.active.model.getValue()})'), lambda r: r['focus'] and r['text'].startswith('// IME: q '))
    test('Caret near the end of a long file remains above the IME', lambda: d.evaluate("(async()=>{const model=forge.active.model;model.setValue(Array.from({length:80},(_,i)=>'// line '+i).join('\\n'));forge.editor.setPosition({lineNumber:80,column:8});forge.editor.revealPositionInCenter({lineNumber:80,column:8});await new Promise(r=>setTimeout(r,250));const box=forge.editor.getDomNode().getBoundingClientRect(),caret=forge.editor.getScrolledVisiblePosition(forge.editor.getPosition());return {caretBottom:box.top+caret.top+caret.height,keyboardTop:innerHeight-forge.keyboardGeometry.overlap,editorTop:box.top};})()"), lambda r: r['editorTop'] < r['caretBottom'] < r['keyboardTop'])
finally:
    subprocess.run([ADB, 'shell', 'input', 'keyevent', '4'], capture_output=True)
    d.evaluate("(async()=>{await forge.saveAll();await forge.changeSettings(" + json.dumps(original['settings']) + ");await forge.switchProject(" + json.dumps(original['project']) + ");return true;})()")
    d.close()
    report = {'device': 'realme RMX3951', 'android': '16', 'testProject': name, 'results': results,
              'passed': sum(r['passed'] for r in results), 'total': len(results)}
    (ROOT / 'verification-keyboard.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'total': report['total']}), flush=True)
