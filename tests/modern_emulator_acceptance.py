"""Real API 36 compiler/debugger acceptance; refuses physical devices.
Run with ANDROID_SERIAL=emulator-5556 after installing a modern debug build.
Uses an isolated project and restores the original project/settings.
"""
import json,os,pathlib,subprocess,sys,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from device_cdp import Device,ADB
sys.stdout.reconfigure(encoding='utf-8')
serial=os.environ.get('ANDROID_SERIAL','')
assert serial.startswith('emulator-'),'This check is restricted to the owned emulator'
assert subprocess.check_output([ADB,'shell','getprop','ro.kernel.qemu'],text=True).strip()=='1'
OUT=ROOT/'work/modern-final';OUT.mkdir(exist_ok=True)
checks=[];d=Device();original=d.evaluate('({project:forge.state.project,settings:forge.settings})')
def evaluate(code):return d.evaluate(code)
def wait(code,timeout=45):
 end=time.monotonic()+timeout
 while not evaluate(code):
  if time.monotonic()>end:raise RuntimeError('Timeout: '+code)
  time.sleep(.1)
def record(name,evidence):
 checks.append({'name':name,'evidence':evidence});print(name,flush=True)
def source(text):
 evaluate('(async()=>{forge.active.model.setValue('+json.dumps(text)+');await forge.saveAll();})()')
def build(compiler='gcc',mode='file',checks='assertions'):
 r=evaluate("native('build',{path:forge.active.path,mode:"+json.dumps(mode)+",options:{...forge.settings,compiler:"+json.dumps(compiler)+",optimization:'debug',runtimeChecks:"+json.dumps(checks)+"},id:'accept-build-'+Date.now()})")
 assert r['code']==0,r
 return r

def run(r):
 return evaluate("""(async()=>{const id='accept-run-'+Date.now();forge.consoleId=id;forge.runtimeDiagnostics.begin(id);document.querySelector('#consoleOutput').textContent='';const ended=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(Error('Run timeout'));},30000);const off=onNative('exit',e=>{if(e.id===id){clearTimeout(timer);off();resolve(e);}});});await native('run',{executable:"""+json.dumps(r['executable'])+""",args:[],id});const exit=await ended;await new Promise(r=>setTimeout(r,200));await forge.runtimeDiagnostics.symbolize();return{exit,fault:forge.runtimeDiagnostics.parser.fault,frames:forge.runtimeDiagnostics.parser.frames,output:document.querySelector('#consoleOutput').textContent};})()""")
def capture(name):
 time.sleep(.35);r=evaluate("native('captureApp')")
 data=subprocess.check_output([ADB,'exec-out','run-as','com.forgex','cat',r['path']]);assert data.startswith(bytes.fromhex('89504e470d0a1a0a'))
 (OUT/name).write_bytes(data)
try:
 evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
 name='release-check-Кириллица-'+str(int(time.time()))
 evaluate("(async()=>{const s=await native('newProject',{name:"+json.dumps(name)+",language:'cpp'});forge.state.projects=s.projects;await forge.switchProject(s.createdProject||"+json.dumps(name)+");forge.settings.autosave=true;})()")
 source('#include <fstream>\n#include <iostream>\nint main(){std::ifstream f("data.txt");int x=0;f>>x;std::cout<<"Project data: "<<x<<"\\n";return x==42?0:1;}\n')
 evaluate("native('newFile',{path:forge.state.root+'/data.txt',text:'42'})")
 for compiler,mode in [('gcc','file'),('clang','file'),('gcc','cmake')]:
  r=run(build(compiler,mode));assert r['exit']['code']==0 and 'Project data: 42' in r['output'],r
  record(compiler+' '+mode+' build/run in Unicode project, project-root cwd',{'code':r['exit']['code'],'output':r['output']})
 source('struct Node { int value; };\nint main(){\n Node item{42};\n volatile int* ptr=nullptr;\n *ptr=item.value;\n return 0;\n}\n')
 r=build();evaluate("forge.debugger.start("+json.dumps(r['executable'])+")")
 wait('forge.debugger.paused&&forge.debugger.variablesSerial===forge.debugger.stopSerial')
 evaluate("forge.debugger.action('continue')")
 wait('forge.debugger.paused&&!!forge.runtimeDiagnostics.parser.fault&&forge.debugger.variablesSerial===forge.debugger.stopSerial')
 value=evaluate("forge.debugger.command('-data-evaluate-expression '+JSON.stringify('item.value'))")
 info=evaluate('({fault:forge.runtimeDiagnostics.parser.fault,frames:forge.debugger.frames,line:forge.debugger.nativeExecution?.line,tree:document.querySelector("#debugVariables").textContent})')
 assert value['value']=='42' and info['line']==5 and 'SIGSEGV' in info['fault']['title'],info
 evaluate("document.querySelector('[data-expression=item] .debug-value-toggle')?.click()")
 wait("document.querySelector('#debugVariables').textContent.includes('42')")
 capture('android-debug-crash.png');record('GDB stops on SIGSEGV, selects project source and expands Node.value',info)
 evaluate('forge.debugger.stop()')
 source('#include <cstdio>\nint main(){\n auto *value=new int(7);\n delete value;\n std::printf("%d\\n", *value);\n}\n')
 r=run(build('clang','file','sanitizers'));assert r['fault']['kind']=='sanitizer' and 'heap-use-after-free' in r['fault']['title'],r
 assert {3,4,5}.issubset({f['line'] for f in r['frames'] if f['path'].endswith('/main.cpp')}),r
 capture('android-asan.png');record('ASan detects use-after-free and resolves allocation/free/read lines',{'exit':r['exit'],'fault':r['fault'],'frames':r['frames']})
 source('int main(){return 139;}\n');r=run(build());assert r['exit']['code']==139 and r['fault'] is None,r
 record('return 139 remains an exit code, without a fabricated signal',r['exit'])
 source('#include <vector>\nint main(){std::vector<int> values{1};return values[9];}\n');r=run(build());assert r['fault']['kind']=='assertion',r
 record('Debug stdlib hardening catches out-of-range vector access',{'exit':r['exit'],'fault':r['fault']})
 evaluate('forge.openSettings()');wait("document.querySelector('#settingsDialog').open")
 capture('android-settings.png');evaluate("document.querySelector('#settingsDialog').close()")
finally:
 try:
  evaluate('(async()=>{await forge.stop();await forge.saveAll();forge.settings='+json.dumps(original['settings'])+';await native("settings",forge.settings);await forge.switchProject('+json.dumps(original['project'])+');})()')
 except Exception as e:print('Restore:',e,flush=True)
 d.close();(OUT/'acceptance.json').write_text(json.dumps({'platform':'Android 16 API 36 x86_64 emulator','physicalDeviceTested':False,'checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
