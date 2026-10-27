import json,pathlib,sys,time,subprocess
root=pathlib.Path(__file__).resolve().parents[1];ws=root;sys.path.insert(0,str(root/'tools'))
from device_cdp import Device,ADB
(root/'work').mkdir(exist_ok=True);d=Device();results=[]
def test(name,js,predicate=bool):
 value=d.evaluate(js);passed=bool(predicate(value));results.append({'test':name,'passed':passed,'evidence':value});print('PASS'if passed else 'FAIL',name,flush=True);assert passed,str(value)[:300]
try:
 assert d.evaluate("forge.state.project.startsWith('input-check-')")
 test('GCC builds an isolated source with debug symbols',r'''(async()=>{const model=forge.active.model;model.setValue('int main() {\n    int value = 5;\n    value += 2;\n    return value;\n}\n');await forge.saveAll();window.debugCheck={build:await native('build',{path:forge.active.path,mode:'file',options:{...forge.settings,optimization:'debug'},id:'native-debug-build'})};window.debugUntil=async(fn)=>{for(let n=0;n<150;n++){if(fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('debug timeout');};return debugCheck.build;})()''',lambda r:r['code']==0 and r['exists'])
 test('GDB stops at main with native execution decoration',r'''(async()=>{forge.debugger.breakpoints.clear();await forge.debugger.toggleBreakpoint(forge.active.model,3);await forge.debugger.start(debugCheck.build.executable);await debugUntil(()=>forge.debugger.paused&&forge.debugger.frames?.length);return {frame:forge.debugger.frames[0],execution:forge.debugger.nativeExecution,breakpoints:[...forge.debugger.breakpoints.get(forge.active.path).keys()]};})()''',lambda r:r['frame']['func']=='main' and r['execution']['line']>0 and r['breakpoints']==[3])
 time.sleep(.4);subprocess.run([ADB,'shell','screencap','-p','/sdcard/studio-native-debug.png'],check=True,capture_output=True);subprocess.run([ADB,'pull','/sdcard/studio-native-debug.png',str(ws/'work/native-debug.png')],check=True,capture_output=True)
 test('Native breakpoint stops at source line and reads value',r'''(async()=>{const serial=forge.debugger.stopSerial;await forge.debugger.command('-exec-continue');await debugUntil(()=>forge.debugger.paused&&forge.debugger.stopSerial>serial);return {value:(await forge.debugger.command('-data-evaluate-expression value')).value,line:forge.debugger.frames[0].line};})()''',lambda r:r['value']=='5' and int(r['line'])==3)
 test('Step over updates the actual inferior and native execution line',r'''(async()=>{const serial=forge.debugger.stopSerial;await forge.debugger.command('-exec-next');await debugUntil(()=>forge.debugger.paused&&forge.debugger.stopSerial>serial);await debugUntil(()=>forge.debugger.nativeExecution?.line===4);return {value:(await forge.debugger.command('-data-evaluate-expression value')).value,execution:forge.debugger.nativeExecution};})()''',lambda r:r['value']=='7' and r['execution']['line']==4)
finally:
 try:d.evaluate("(async()=>{if(forge.debugger.active)await forge.debugger.stop();await forge.saveAll();return true;})()")
 except Exception:pass
 d.close();(root/(sys.argv[1] if len(sys.argv)>1 else 'verification-native-debugger.json')).write_text(json.dumps({'results':results,'passed':sum(r['passed'] for r in results),'total':len(results)},ensure_ascii=False,indent=2),encoding='utf-8')
