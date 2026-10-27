"""Generated project defaults, manual projects, and actual memory diagnostics."""
import json,pathlib,sys,subprocess,time
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'));from device_cdp import Device,ADB
d=Device();checks=[]
def js(s):return d.evaluate(s)
def check(name,value,ok):
 checks.append({'test':name,'passed':bool(ok),'evidence':value});print(('PASS 'if ok else'FAIL ')+name,flush=True);assert ok,str(value)[:2500]
def wait(s):
 for _ in range(200):
  if js(s):return
  time.sleep(.06)
 raise AssertionError(s)
try:
 assert js("forge.state.project==='input-check-workspace-035-20261027'")
 for name,kind in [('input-check-generated-035-20261027','c'),('input-check-empty-035-20261027','empty')]:
  js('native("newProject",'+json.dumps({'name':name,'language':kind})+')')
  raw=subprocess.check_output([ADB,'exec-out','run-as','com.forgex','cat','files/projects/'+name+'/.cpp-studio/configurations.json']);value=json.loads(raw)
  check(kind+' project receives separate Debug/Release profiles',value['profiles'],[p['id']for p in value['profiles']]==['debug','release'])
  entries=subprocess.check_output([ADB,'shell','run-as','com.forgex','ls','-a','files/projects/'+name],text=True).split()
  check(kind+' project generates only its intended structure',entries,('main.c'in entries and'CMakeLists.txt'in entries)if kind=='c'else('CMakeLists.txt'not in entries and'main.cpp'not in entries and value['configurations'][0]['type']=='custom'))
 js("(async()=>{await forge.openFile(forge.state.root+'/main.cpp');forge.active.model.setValue('int main() { int value; return value; }\\n');await forge.saveAll();window.uninitBuild=await native('build',{path:forge.active.path,mode:'file',options:{...forge.settings,compiler:'gcc',debugSession:true,runtimeChecks:'undefined',flags:['-Werror']},id:'uninit-warning'});})()")
 value=js("({result:uninitBuild,output:document.querySelector('#buildOutput').textContent})");check('Definite uninitialized use remains a warning under general Werror',value,value['result']['code']==0 and'uninitialized'in value['output']and'warning:'in value['output'])
 # ASan complements UBSan for a heap access whose allocation size is dynamic.
 source='#include <cstdio>\nint main() {\n    volatile int size = 2;\n    int* data = new int[size];\n    volatile int index = 4;\n    data[index] = 42;\n    std::puts("ASAN_CONTINUED");\n    delete[] data;\n    return 0;\n}\n'
 js('(async()=>{forge.active.model.setValue('+json.dumps(source)+');await forge.saveAll();forge.debugger.breakpoints.clear();window.asanOptions={...forge.settings,compiler:"clang",debugSession:true,runtimeChecks:"address",flags:[]};window.asanBuild=await native("build",{path:forge.active.path,mode:"file",options:asanOptions,id:"asan-build"});})()');value=js('asanBuild');check('Clang ASan+UBSan debug build links on Android',value,value['code']==0 and value['exists'])
 js('forge.debugger.start(asanBuild.executable,[],asanOptions)');wait('forge.debugger.paused');js('forge.debugger.command("-exec-continue")');wait('!forge.debugger.active');value=js("({text:document.querySelector('#consoleOutput').textContent,warnings:forge.runtimeWarnings})");check('Actual heap overflow is reported and recovery continues under GDB',value,'heap-buffer-overflow'in value['text']and'ASAN_CONTINUED'in value['text']and len(value['warnings'])>0)
finally:
 try:js("(async()=>{if(forge.debugger.active)await forge.debugger.stop();forge.active.model.setValue('#include <cstdio>\\nint main() { std::puts(\"C++ Studio\"); return 0; }\\n');await forge.saveAll();})()")
 except Exception:pass
 d.close();(ROOT/'verification-profiles-035.json').write_text(json.dumps({'checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)},ensure_ascii=False,indent=2),encoding='utf-8')
