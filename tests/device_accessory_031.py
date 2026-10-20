"""Actual Android gestures on the native accessory bar; disposable project only."""
import json,pathlib,subprocess,sys,time
root=pathlib.Path.cwd();sys.path.insert(0,str(root/'tools'))
from device_cdp import Device,ADB
d=Device();checks=[]
def adb(*args):return subprocess.check_output([ADB,*map(str,args)],text=True).strip()
def js(s):return d.evaluate(s)
def state():return js("native('editorVisualState')")
def text():return js("(async()=>{await NativeEditing.sync();return forge.active.model.getValue();})()")
def tap(index):
    b=state()['accessory'];assert b['visible'],b
    adb('shell','input','tap',round(b['left']+key*(index+.5)),round(58+b['top']+b['height']/2));time.sleep(.15)
    return b
def check(name,value,ok):
    checks.append({'test':name,'passed':bool(ok),'evidence':value});print(('PASS 'if ok else 'FAIL ')+name,flush=True);assert ok,str(value)
old=adb('shell','settings','get','secure','show_ime_with_hard_keyboard')
try:
    assert js("forge.state.project.startsWith('input-check-')")
    js("(async()=>{StudioHover.hide();await forge.changeSettings({codeScale:150,keyboardExtraKeys:true});forge.active.model.setValue('abcdefghijklmnopqrstuvwxyz0123456789');forge.editor.setPosition({lineNumber:1,column:21});await NativeEditing.sync();await forge.editor.focus();})()")
    adb('shell','settings','put','secure','show_ime_with_hard_keyboard',1)
    js("native('keyboard')")
    for _ in range(40):
        s=state()
        if s['accessory']['visible']:break
        time.sleep(.1)
    bar=s['accessory'];assert bar['visible'],bar
    density=js('devicePixelRatio');key=44*density;y=round(58+bar['top']+bar['height']/2)
    before=text();x=round(key*5.5)
    adb('shell','input','swipe',x,y,x+180,y,450)
    adb('shell','input','swipe',x,y,x,y-100,450)
    time.sleep(.15);after=text()
    check('Scrolling across accessory keys never inserts bracket pairs',{'before':before,'after':after},after==before)
    js('forge.editor.setPosition({lineNumber:1,column:21})');time.sleep(.1)
    x=round(key*1.5);adb('shell','input','tap',x,y);time.sleep(.15)
    one=js('forge.editor.getPosition().column')
    check('Arrow tap moves exactly one column',one,one==20)
    adb('shell','input','swipe',x,y,x,y,650);time.sleep(.15)
    held=js('forge.editor.getPosition().column')
    check('Stationary arrow hold repeats without an extra release tap',{'before':one,'after':held},held<one-2)
    js("forge.editor.setSelection(new monaco.Range(1,1,1,4))");time.sleep(.15)
    # Copy and paste are the last two native keys; they fit on this tablet.
    copy_bar=tap(14)
    js('forge.editor.setPosition({lineNumber:1,column:37})');time.sleep(.15)
    paste_bar=tap(15)
    pasted=text();check('Native copy/paste works after scaling and accessory gestures',{'text':pasted,'copyBar':copy_bar,'pasteBar':paste_bar},pasted==before+'abc')
finally:
    if old=='null':adb('shell','settings','delete','secure','show_ime_with_hard_keyboard')
    else:adb('shell','settings','put','secure','show_ime_with_hard_keyboard',old)
    adb('shell','input','keyevent','KEYCODE_BACK')
    d.close();(root/'verification-accessory-031.json').write_text(json.dumps({'device':'Xiaomi Pad 6 / Android 14','input':'Actual ADB taps, drags and holds with Yandex IME visible','checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
