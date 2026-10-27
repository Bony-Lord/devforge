"""Isolated cold-runtime checks; original usr must be backed up by prepare_cold_runtime.py.

The shared-library archive is prefilled via ADB. CMake is downloaded over HTTPS;
GCC cancellation is real, then an ADB-prefilled prefix tests actual HTTP Range resume.
"""
import json,pathlib,subprocess,sys,time,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1];FOLDER=ROOT/'work/runtime-037-20261027';sys.path.insert(0,str(ROOT/'tools'));from device_cdp import Device,ADB
d=Device();checks=[];completed=False
def js(code):return d.evaluate(code)
def adb(*args):return subprocess.run([ADB,*map(str,args)],capture_output=True,check=True,timeout=60)
def check(name,value,ok):
 checks.append({'test':name,'passed':bool(ok),'evidence':value});print(('PASS 'if ok else'FAIL ')+name,flush=True);assert ok,str(value)[:2000]
def state():return {p['id']:p for p in js("native('toolPacks')")['packs']}
def cache(id,prefix=None):
 source=FOLDER/'packs'/('cpp-studio-'+id+'-aarch64.zip')
 if prefix is not None:
  out=FOLDER/('prefix-'+id+'.zip');out.write_bytes(source.read_bytes()[:prefix]);source=out
 remote='/data/local/tmp/studio-037-'+id+'.zip';adb('push',source,remote);adb('shell','run-as','com.forgex','cp',remote,'files/tmp/pack-'+id+'.zip');adb('shell','rm',remote)
def start(id):
 js("window.packTrace=[];window.packResult=null;void forge.setToolPack("+json.dumps(id)+",true).then(()=>window.packResult={ok:true},e=>window.packResult={error:e.message});true")
def finish(timeout=240):
 deadline=time.monotonic()+timeout;phase=None
 while time.monotonic()<deadline:
  result=js('window.packResult');event=js('window.packTrace.at(-1)')
  if isinstance(event,dict)and phase!=(event.get('id'),event.get('phase')):phase=(event.get('id'),event.get('phase'));print('INSTALL '+str(phase),flush=True)
  if result:return result
  time.sleep(.2)
 raise AssertionError('Component operation did not finish')
def install(id):start(id);result=finish();assert result.get('ok'),result;return result
try:
 assert js("forge.state.project==='input-check-runtime-037-20261027'")
 assert json.loads((FOLDER/'runtime-moved.json').read_text())['restored']is False
 with zipfile.ZipFile(ROOT/'app/build/outputs/apk/debug/app-debug.apk')as archive:
  size=(ROOT/'app/build/outputs/apk/debug/app-debug.apk').stat().st_size;check('APK has no compiler runtime asset or residual 100 MB payload',{'bytes':size,'runtimeAsset':'assets/runtime.zip'in archive.namelist()},size<15000000 and'assets/runtime.zip'not in archive.namelist())
 s=state();check('Editor starts with no native tool packages installed',{id:p['installed']for id,p in s.items()},not any(p['installed']for p in s.values()))
 check('Upgrade recognizes all previous tool installations',None,all(p['installed']for p in json.loads((FOLDER/'upgrade-preserved.json').read_text())['packs']))
 js("onNative('toolPackProgress',e=>{(window.packTrace??=[]).push(e);});window.runEvents=[];window.runExits=[];onNative('output',e=>runEvents.push(e));onNative('exit',e=>runExits.push(e));")
 js('forge.openSetup()');ids=js('forge.setupDraft.packs');check('Quick setup includes GCC CMake analysis and shared libraries once',ids,ids==['platform','gcc','cmake','analysis'])
 js("forge.setupStep=1;forge.renderSetup();document.querySelector('#setupPackList input[value=platform]').click();");ids=js('forge.setupDraft.packs');check('Unselecting a required shared component unselects dependents',ids,not ids)
 js("document.querySelector('#setupPackList input[value=gcc]').click();");ids=js('forge.setupDraft.packs');check('Selecting GCC automatically selects its shared libraries',ids,ids==['platform','gcc'])
 js('forge.skipSetup()');js('forge.build(false)');check('Build without compiler opens the tool installer',js("document.querySelector('#toolPacksDialog')?.open"),js("document.querySelector('#toolPacksDialog')?.open")is True);js("document.querySelector('#toolPacksDialog').close()")
 cache('platform');install('cmake');s=state();trace=js('packTrace');check('CMake HTTPS download installs shared libraries but no GCC',{'installed':{id:p['installed']for id,p in s.items()},'phases':list(dict.fromkeys(e['id']+':'+e['phase']for e in trace))},s['platform']['installed']and s['cmake']['installed']and not s['gcc']['installed']and any(e['id']=='cmake'and 0<e['done']<e['total']for e in trace))
 start('gcc');deadline=time.monotonic()+45
 while time.monotonic()<deadline:
  e=js('window.packTrace.at(-1)')
  if isinstance(e,dict)and e.get('id')=='gcc'and 0<e.get('done',0)<e.get('total',0):break
  if js('window.packResult'):raise AssertionError(js('window.packResult'))
  time.sleep(.05)
 else:raise AssertionError('No GCC download progress')
 js("native('toolPackCancel')");result=finish();length=int(adb('shell','run-as','com.forgex','stat','-c','%s','files/tmp/pack-gcc.zip').stdout);check('Cancel stops download and retains a resumable partial archive',{'result':result,'partialBytes':length},'error'in result and 0<length<63843767 and not state()['gcc']['installed'])
 prefix=(FOLDER/'packs/cpp-studio-gcc-aarch64.zip').stat().st_size-524288;cache('gcc',prefix);install('gcc');trace=js('packTrace');first=next(e for e in trace if e['id']=='gcc'and e['phase']=='download');check('Real HTTPS Range resume uses the saved prefix and installs GCC',{'firstProgress':first,'installed':state()['gcc']['installed']},first['done']==prefix and state()['gcc']['installed'])
 text='#include <bits/stdc++.h>\nint main() { std::vector<int> v{1, 2, 3}; std::cout << "PACKS=" << std::accumulate(v.begin(), v.end(), 0) << "\\n"; }\n'
 js('(async()=>{forge.active.model.setValue('+json.dumps(text)+');await NativeEditing.sync();await forge.saveAll();})()')
 b=js("native('build',{path:forge.active.path,mode:'file',id:'packs-cpp',options:{...forge.settings,compiler:'gcc',cppStandard:'c++20',optimization:'debug',flags:[]}})");check('Downloaded GCC compiles C++20 with bits convenience header',b,b['code']==0 and b['exists'])
 js("native('run',{executable:"+json.dumps(b['executable'])+",id:'packs-run'})");deadline=time.monotonic()+10
 while not js("!!runExits.find(e=>e.id==='packs-run')")and time.monotonic()<deadline:time.sleep(.1)
 result=js("({exit:runExits.find(e=>e.id==='packs-run'),text:runEvents.filter(e=>e.id==='packs-run').map(e=>e.text).join('')})");check('Downloaded C++ runtime executes correctly',result,result['exit']['code']==0 and'PACKS=6'in result['text'])
 cmake='cmake_minimum_required(VERSION 3.20)\nproject(pack_check LANGUAGES C CXX)\nadd_executable(packs main.cpp)\n'
 js("native('write',{path:forge.state.root+'/CMakeLists.txt',text:"+json.dumps(cmake)+"})");b=js("native('build',{path:forge.active.path,mode:'cmake',id:'packs-cmake',options:{...forge.settings,compiler:'gcc',target:'packs',buildMode:'cmake',optimization:'debug',flags:[]}})");check('Downloaded CMake Ninja and GCC build a real project',b,b['code']==0 and b['exists'])
 c='#include <stdio.h>\nint main(void) { puts("C=42"); return 0; }\n';js("native('write',{path:forge.state.root+'/probe.c',text:"+json.dumps(c)+"})");b=js("native('build',{path:forge.state.root+'/probe.c',mode:'file',id:'packs-c',options:{...forge.settings,compiler:'gcc',cStandard:'c17',optimization:'debug',flags:[]}})");check('Downloaded GCC compiles C17 with platform headers',b,b['code']==0 and b['exists'])
 b=js("native('build',{path:forge.active.path,mode:'file',id:'packs-lto',options:{...forge.settings,compiler:'gcc',cppStandard:'c++20',optimization:'release',flags:['-flto','-g0']}})");check('GCC LTO tools work without debug information',b,b['code']==0 and b['exists'])
 result=js("native('toolPackRemove',{id:'platform'}).then(()=>({removed:true}),e=>({error:e.message}))");check('Shared libraries cannot be removed while dependent tools are installed',result,'error'in result and state()['platform']['installed'])
 js("forge.setToolPack('gcc',false)");s=state();check('Removing GCC preserves CMake and shared libraries',{id:s[id]['installed']for id in ['platform','gcc','cmake']},s['platform']['installed']and s['cmake']['installed']and not s['gcc']['installed']);cache('gcc');install('gcc');check('GCC can be installed again from a verified cached archive',None,state()['gcc']['installed'])
 js("forge.setToolPack('cmake',false)");s=state();check('CMake can be removed independently from GCC',{id:s[id]['installed']for id in ['gcc','cmake']},s['gcc']['installed']and not s['cmake']['installed']);cache('cmake');install('cmake');check('CMake can be installed again independently',None,state()['cmake']['installed'])
 js("(async()=>{await forge.changeSettings({language:'en'});localStorage.setItem('gccStudioLanguage','en');await forge.persistSession();})()");d.call('Page.reload');d.close();d=Device();js('forge.openSetup()');js('forge.setupStep=1;forge.renderSetup()');body=js("document.querySelector('#setupBody').textContent");check('English package wizard has no untranslated Russian text',body,js('StudioI18n.locale')=='en'and not any('\u0400'<=c<='\u04ff'for c in body));js('forge.skipSetup()');js('forge.openToolPacks()');body=js("document.querySelector('#toolPacksDialog').textContent");check('English tool manager has no untranslated Russian text',body,not any('\u0400'<=c<='\u04ff'for c in body));js("document.querySelector('#toolPacksDialog').close()");check('Downloaded package installation survives interface restart',{id:p['installed']for id,p in state().items()},all(state()[id]['installed']for id in ['platform','gcc','cmake']))
 completed=True
finally:
 try:js('(async()=>{await forge.saveAll();})()')
 except Exception:pass
 d.close();report={'completed':completed,'method':'Cold usr. Shared-library archive and GCC resume prefix prefilled through ADB; CMake HTTPS download and GCC cancellation/resume use the real network. All archives and extracted files checked against SHA256.','checks':checks,'passed':sum(c['passed']for c in checks),'total':len(checks)};(ROOT/'verification-downloadable-runtime-037.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'completed':completed,'passed':report['passed'],'total':report['total']}),flush=True)
