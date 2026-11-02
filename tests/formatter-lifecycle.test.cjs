'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(providers=[],enabled=true){const calls=[],context=vm.createContext({formatterMethods:{formatCurrentDocument(){calls.push('native');return 'native-result';}}});vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/ui/python-style.js'),'utf8'),context);const app={active:{model:{getLanguageId:()=> 'python'}},addons:{registry:{list:()=>providers},host:{enabled:()=>enabled}},pythonStyle:{format(){calls.push('python');return 'python-result';}}};return{format:()=>vm.runInContext('pythonStyleMethods.formatCurrentDocument',context).call(app),calls};}
test('formatting remains awaitable when an addon/provider is missing, disabled or does not support the active language',async()=>{
 for(const f of [fixture(),fixture([{value:{languages:['python'],feature:'pythonFormatting'}}],false),fixture([{value:{languages:['cpp'],feature:'formatter'}}])]){const result=f.format();assert.equal(typeof result.catch,'function');await result;assert.deepEqual(f.calls,[]);}
});
test('active formatter routing retains provider results for both Python and native backends',async()=>{
 for(const [handler,expected]of [['python-style','python'],['native','native']]){const f=fixture([{value:{languages:['python'],feature:'formatter',handler}}]);assert.equal(await f.format(),expected+'-result');assert.deepEqual(f.calls,[expected]);}
});
test('a VSX formatter remains callable when no native formatter addon is enabled',async()=>{
 const calls=[],context=vm.createContext({StudioCodeOSS:{api:{}}});vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/ui/python-style.js'),'utf8'),context);const action={isSupported:()=>true,run:async()=>{calls.push('vsx');return 'formatted';}},app={active:{model:{getLanguageId:()=> 'cpp'}},addons:{registry:{list:()=>[]}},editor:{getAction:id=>{assert.equal(id,'editor.action.formatDocument');return action;}}};assert.equal(await vm.runInContext('pythonStyleMethods.formatCurrentDocument',context).call(app),'formatted');assert.deepEqual(calls,['vsx']);
});
