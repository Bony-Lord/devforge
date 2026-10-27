"""Physical Android dispatch for configurable completion keys; isolated project only."""
import json,pathlib,subprocess,sys,time
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from device_cdp import Device,ADB
d=Device();checks=[]
def js(code):return d.evaluate(code)
def op(name,data=None):return js('native('+json.dumps(name)+','+json.dumps(data or {})+')')
def chord(*codes):subprocess.run([ADB,'shell','input','keycombination',*map(str,codes)],check=True,capture_output=True,timeout=10);time.sleep(.15)
def check(name,evidence,passed):
    checks.append({'test':name,'passed':bool(passed),'evidence':evidence});print(('PASS ' if passed else 'FAIL ')+name,flush=True);assert passed,str(evidence)[:1000]
def prepare(source,offset):
    js('(async()=>{document.querySelectorAll("dialog[open]").forEach(x=>x.close());await forge.openFile(forge.state.root+"/main.cpp");const m=forge.active.model;m.setValue('+json.dumps(source)+');await NativeEditing.sync();const p=m.getPositionAt('+str(offset)+');await native("editorSelection",{id:"primary",line:p.lineNumber,column:p.column});await native("editorFocus",{id:"primary"});window.shortcutCalls=[];})()')
def await_action(name):
    for _ in range(60):
        calls=js('window.shortcutCalls');
        if name in calls:return calls
        time.sleep(.05)
    return calls
original=js('structuredClone(forge.settings)')
try:
    assert js('forge.state.project.startsWith("input-check-")')
    js('(async()=>{await forge.changeSettings({completionShortcut:"Ctrl+Alt+Space",parameterShortcut:"Ctrl+Alt+P",codeScale:188,autosave:false});window.shortcutOriginalAction=forge.action;forge.action=function(id){(window.shortcutCalls??=[]).push(id);return window.shortcutOriginalAction.call(this,id);};})()')
    source='struct Item { int member; };\nint main(){ Item item{}; item. }\n';prepare(source,source.index('item.')+5);chord(113,57,62)
    calls=await_action('editor.action.triggerSuggest');r=op('editorTestCompletionState');check('Ctrl Alt Space dispatches completion without Quick Fix',{'calls':calls,'popup':r},calls==['editor.action.triggerSuggest'])
    for _ in range(60):
        if (r:=op('editorTestCompletionState'))['showing'] and r['count']:break
        time.sleep(.1)
    check('Default shortcut shows actual clangd completion',r,r['showing'] and r['count']>0)
    # Small lists must also show above a transformed native editor.
    for scale in [50,100,188,250]:
        js('forge.changeSettings({codeScale:'+str(scale)+'})');prepare(source,source.index('item.')+5);chord(113,57,62)
        for _ in range(60):
            if (r:=op('editorTestCompletionState'))['showing'] and r['count']==1:break
            time.sleep(.05)
        check('Single-item popup stays visible at code scale%d'%scale,r,r['showing'] and r['count']==1)
    subprocess.run([ADB,'shell','input','keyevent','61'],check=True,capture_output=True,timeout=10);time.sleep(.15)
    r=js('forge.active.model.getValue()');check('Tab accepts a real one-item completion exactly once',r,'item.member' in r and r.count('item.member')==1)
    op('editorAction',{'id':'primary','action':'right'});js('window.shortcutCalls=[]');chord(113,62);chord(113,59,62);calls=js('window.shortcutCalls');check('Ctrl Space and unassigned Ctrl Shift Space do not trigger completion',calls,calls==[])
    source='int add(int first,int second){return first+second;}\nint main(){return add(1, );}\n';prepare(source,source.index('add(1,')+6);chord(113,57,44);calls=await_action('editor.action.triggerParameterHints');
    for _ in range(60):
        if js('!!document.querySelector("#nativeInfoDialog[open]")'):break
        time.sleep(.05)
    r=js('({calls:window.shortcutCalls,open:!!document.querySelector("#nativeInfoDialog[open]"),text:document.querySelector("#nativeInfoDialog pre")?.textContent})');check('Ctrl Alt P opens real function parameter information',r,calls==['editor.action.triggerParameterHints'] and r['open'] and 'second' in r['text'])
    js('document.querySelectorAll("dialog[open]").forEach(x=>x.close())')
    r=js('(async()=>{forge.openSettings();const f=document.querySelector("#settingsForm");f.elements.completionShortcut.value="Ctrl+Alt+P";f.elements.parameterShortcut.value="Ctrl+Alt+P";await forge.saveSettingsForm();return{open:document.querySelector("#settingsDialog").open,completion:forge.settings.completionShortcut,parameters:forge.settings.parameterShortcut};})()');check('Settings reject assigning both actions to the same key',r,r['open'] and r['completion']=='Ctrl+Alt+Space')
    js('(async()=>{document.querySelector("#settingsDialog").close();await forge.changeSettings({completionShortcut:"Ctrl+Alt+I",parameterShortcut:"Ctrl+Shift+Space"});})()')
    source='struct Item { int member; };\nint main(){ Item item{}; item. }\n';prepare(source,source.index('item.')+5);chord(113,57,37);calls=await_action('editor.action.triggerSuggest');check('Custom Ctrl Alt I routes through native hardware dispatch',calls,calls==['editor.action.triggerSuggest'])
    op('editorAction',{'id':'primary','action':'right'});source='int add(int first,int second){return first+second;}\nint main(){return add(1, );}\n';prepare(source,source.index('add(1,')+6);chord(113,59,62);calls=await_action('editor.action.triggerParameterHints');check('Custom Ctrl Shift Space triggers only parameter information',calls,calls==['editor.action.triggerParameterHints'])
finally:
    try:js('(async()=>{if(window.shortcutOriginalAction)forge.action=window.shortcutOriginalAction;document.querySelectorAll("dialog[open]").forEach(x=>x.close());await forge.changeSettings('+json.dumps(original)+');})()')
    except Exception:pass
    d.close();(ROOT/'verification-completion-keys-032.json').write_text(json.dumps({'device':'Xiaomi Pad6 Android14','checks':checks,'passed':all(c['passed'] for c in checks),'input':'Android keycombination'},ensure_ascii=False,indent=2),encoding='utf-8')
