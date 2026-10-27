"""Compile/run through the actual toolbar workflow with a floating Console."""
import pathlib,sys,json,time
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from device_cdp import Device
d=Device();checks=[]
try:
 assert d.evaluate("forge.state.project==='input-check-compact-20261027'")
 value=d.evaluate(r'''(async()=>{
 await native('editorFloatingKeyboard',{enabled:false});await forge.openFile(forge.state.root+'/main.cpp');await forge.changeSettings({buildMode:'file',compiler:'gcc',optimization:'debug'});
 forge.active.model.setValue('#include <iostream>\nint main() {\n    std::cout << "C++ Studio windows: 42" << std::endl;\n    return 0;\n}\n'.replaceAll('\\n','\n'));await forge.saveAll();
 forge.windows.place('console','float');await forge.build(true);
 for(let n=0;n<160&&forge.running;n++)await new Promise(r=>setTimeout(r,25));
 return{output:document.querySelector('#consoleOutput').textContent,build:document.querySelector('#buildOutput').textContent,running:forge.running,busy:forge.busy,console:forge.windows.api.getPanel('console').api.location,visible:forge.windows.api.getPanel('console').api.isVisible};
 })()''')
 passed='C++ Studio windows: 42'in value['output']and'код 0'in value['build']and not value['running']and not value['busy']and value['console']['type']=='floating'and value['visible']
 checks.append({'test':'Actual GCC build and run retain floating console and correct output','passed':passed,'evidence':value});print('PASS'if passed else'FAIL',value);assert passed
finally:
 d.close();(ROOT/'verification-run-window-033.json').write_text(json.dumps({'device':'Xiaomi Pad 6 / Android 14','checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)},ensure_ascii=False,indent=2),encoding='utf-8')
