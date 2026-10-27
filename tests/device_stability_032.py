"""Real Android completion navigation and caret regression in an isolated project.

Does not modify user projects. Uses actual Android key events, not DOM keydown.
"""
import json, pathlib, subprocess, sys, time
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from device_cdp import Device, ADB

def run():
    device=Device(); checks=[];latencies=[]
    def js(code):return device.evaluate(code)
    def op(name,data=None):return js('native('+json.dumps(name)+','+json.dumps(data or {})+')')
    def state():return op('editorTestCompletionState')
    def wait(test,seconds=15):
        until=time.monotonic()+seconds
        while True:
            result=test()
            if result:return result
            if time.monotonic()>until:raise AssertionError('Timed out waiting for device state')
            time.sleep(.05)
    def check(name,evidence,passed=True):
        checks.append({'test':name,'passed':bool(passed),'evidence':evidence});print(('PASS ' if passed else 'FAIL ')+name,flush=True)
        assert passed,str(evidence)[:1200]
    def keys(*codes):
        start=time.monotonic();subprocess.run([ADB,'shell','input','keyevent',*map(str,codes)],check=True,capture_output=True,timeout=25);latencies.append(round((time.monotonic()-start)*1000))
    def reset(text,line=1,column=17):
        js('(async()=>{if(!forge.state.project.startsWith("input-check-"))throw Error("isolated project required");await forge.openFile(forge.state.root+"/main.cpp");forge.active.model.setValue('+json.dumps(text)+');await NativeEditing.sync();await native("editorSelection",{id:"primary",line:'+str(line)+',column:'+str(column)+'});await native("editorFocus",{id:"primary"});})()')
    def arrow(action,count):
        return js('(async()=>{for(let i=0;i<'+str(count)+';i++)await native("editorAction",{id:"primary",action:'+json.dumps(action)+'});return await native("editorTestCompletionState");})()')
    original=js('({project:forge.state.project,settings:structuredClone(forge.settings)})')
    try:
        assert original['project'].startswith('input-check-'),'Select a disposable input-check-* project first'
        js('(async()=>{if(forge.secondaryEditor)forge.unsplitEditor();await forge.changeSettings({wordWrap:false,codeScale:100,smartFormatOnClose:false,autosave:false,indentMode:"spaces",indentWidth:4,tabWidth:4});})()')
        text='abcdefghijklmnopqrstuvwxyz0123456789\nabc\n\nq\nabcdefghijklmnopqrstuvwxyz0123456789\n'
        reset(text); keys(*([20]*4));r=state();check('Hardware Down preserves column17 across short and empty lines',r,r['line']==5 and r['column']==17)
        keys(*([19]*4));r=state();check('Hardware Up restores the original column',r,r['line']==1 and r['column']==17)
        reset(text);r=arrow('down',4);check('Accessory Down shares the preferred column',r,r['line']==5 and r['column']==17)
        r=arrow('up',4);check('Accessory Up shares the preferred column',r,r['line']==1 and r['column']==17)
        keys(20,21,20,20,20);r=state();check('Horizontal movement resets the preferred column',r,r['line']==5 and r['column']==3)
        reset(text);keys(20);op('editorAction',{'id':'primary','action':'z'});keys(20,20,20);r=state();check('Typing resets the preferred column',r,r['line']==5 and r['column']==5)
        reset(text)
        for _ in range(4):subprocess.run([ADB,'shell','input','keycombination','59','20'],check=True,capture_output=True,timeout=10)
        r=state();check('Shift Down keeps the anchor and preferred column',r,r['line']==5 and r['column']==17 and r['start']==16 and r['end']>r['start'])
        reset('\tabcdefghijklmnop\nx\n01234567890123456789\n',column=8);keys(20,20);r=state();check('Tab widths preserve the visual column',r,r['line']==3 and r['column']==11)
        fields='\n'.join(' int member_%03d;'%i for i in range(140))
        source='struct Many {\n'+fields+'\n};\nint main(){\n Many value{};\n value.\n}\n'
        reset(source,line=145,column=8)
        js('(async()=>{const m=forge.active.model,p=m.getPositionAt(m.getValue().indexOf("value.")+6);await native("editorSelection",{id:"primary",line:p.lineNumber,column:p.column});forge.editor.setPosition(p);await NativeEditing.sync();await native("editorAction",{id:"primary",action:"suggest"});})()')
        r=wait(lambda:(s if (s:=state())['showing'] and s['count']>=50 else None),25);check('Actual clangd completion list contains at least50 entries',r)
        for cycle in range(3):
            for direction in [20,19]:
                for _ in range(4):keys(*([direction]*25))
                r=wait(lambda:(s if (s:=state())['showing'] and s['first']<=s['selected']<=s['last'] else None))
                check('Completion remains responsive and selected row visible: cycle%d key%d'%(cycle,direction),r)
        keys(111);op('editorAction',{'id':'primary','action':'right'})
        check('Completion navigation leaves the source unchanged',{'length':js('forge.active.model.getValue().length')},js('forge.active.model.getValue()')==source)
        r=op('performanceReport');check('No Android UI stalls over1s in this regression run',r,not any(x.get('area')=='Android UI' and x.get('delayMs',0)>1000 for x in r))
        check('Android key batches complete within3seconds',{'count':len(latencies),'maxMs':max(latencies)},max(latencies)<3000)
    finally:
        try:js('forge.changeSettings('+json.dumps(original['settings'])+')')
        except Exception:pass
        device.close();(ROOT/'verification-stability-032.json').write_text(json.dumps({'platform':'Android physical tablet','checks':checks,'passed':all(c['passed'] for c in checks),'keyInput':'Android input keyevent/keycombination','durationNote':'Not a claim of exhaustive stability'},ensure_ascii=False,indent=2),encoding='utf-8')
    return checks

if __name__=='__main__':run()
