'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const policy=require('../app/src/main/assets/ui/project-policy.js');
function fixture(actions){
  const events=[],configuration={id:'test',actions},options={buildBeforeRun:true,compiler:'gcc'},providers=[
    {id:'cpp.build',kind:'build',handler:'cpp.build',compiler:true},
    {id:'cpp.run',kind:'run',handler:'cpp.run',compiler:true},
    {id:'cpp.debug',kind:'debug',handler:'cpp.debug',compiler:true},
    {id:'extension.build',kind:'build',execute:async()=>{events.push('extension build');return{code:0,exists:true,executable:'/project/custom'};}}
  ];
  const ide={settings:{},configurations:{document:{active:'test',configurations:[configuration]},current:()=>({configuration,options})},addons:{registry:{list:()=>providers.map(value=>({value}))},host:{runtimeEnabled:()=>true,enabled:()=>true},local:v=>v},updateRunButtons(){},async build(_run,opts){events.push('cpp build '+(opts.debugSession?'debug':'normal'));return{code:0,exists:true,executable:'/project/binary'};},async debugBuild(opts){events.push('debug '+opts.executable);},async runConfigured(opts){events.push('run '+opts.executable);}};
  const context=vm.createContext({StudioProjectPolicy:policy,safeError:e=>{throw e;}});vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/ui/project-actions.js'),'utf8')+';globalThis.Actions=StudioProjectActions;',context);
  return{ide,configuration,options,events,providers,actions:new context.Actions(ide)};
}
test('absent action hotkeys do nothing; providers can be disabled by project addons',async()=>{const f=fixture({});await f.ide.build(false);assert.deepEqual(f.events,[]);f.configuration.actions.run={provider:'cpp.run'};f.ide.addons.host.runtimeEnabled=()=>false;assert.equal(f.actions.provider('run'),null);await f.ide.build(true);assert.deepEqual(f.events,[]);});
test('run executes the chosen addon build action and its artifact',async()=>{const f=fixture({build:{provider:'extension.build'},run:{provider:'cpp.run'}});await f.ide.build(true);assert.deepEqual(f.events,['extension build','run /project/custom']);assert.equal(f.actions.running,false);});
test('missing build is not silently replaced by C++ compilation',async()=>{const f=fixture({run:{provider:'cpp.run'}});f.options.executable='/project/prebuilt';await f.ide.build(true);assert.deepEqual(f.events,['run /project/prebuilt']);});
test('failed build prevents run; debugger requests debug build flags',async()=>{const f=fixture({build:{provider:'cpp.build'},debug:{provider:'cpp.debug'}});await f.ide.debugBuild();assert.deepEqual(f.events,['cpp build debug','debug /project/binary']);f.events.length=0;f.configuration.actions.build={provider:'extension.build'};f.providers.find(p=>p.id==='extension.build').execute=async()=>({code:7});await f.ide.debugBuild();assert.deepEqual(f.events,[]);});
