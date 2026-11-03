'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
// Same bound-method caching semantics as the pinned Code OSS delayed service DI.
function delayedService(instance){return new Proxy(Object.create(null),{get(target,key){if(key in target)return target[key];const value=instance[key];return typeof value==='function'?(target[key]=value.bind(instance)):value;},set(_target,key,value){instance[key]=value;return true;}});}
test('native save evicts cached DI method and commits through the guarded native writer',async()=>{
 const {installNativeSave}=await import('../compat/native-save.js'),resource={toString:()=> 'vscode-remote:/source.cpp'},events=[];
 const textFiles={async write(){events.push('old write');},files:{get:()=>({isDirty:()=>false,save:async options=>{events.push(['save',options]);await proxy.write(resource,'actual participant text',{});return true;}})}};
 const proxy=delayedService(textFiles),save=installNativeSave({textFiles:proxy,fileService:{resolve:async uri=>{events.push(['stat',uri]);return {size:23};}},commit:async(uri,text)=>{events.push(['native',text]);return true;}});
 await save(resource,1);assert(!events.includes('old write'));assert.equal(events[1][0],'native');assert.equal(events[1][1],'actual participant text');assert.equal(events[0][1].reason,1);assert.equal(events[0][1].ignoreErrorHandler,false);
});

test('Save All waits for the current edit when upstream first completes an older autosave',async()=>{
 const {installNativeSave}=await import('../compat/native-save.js'),resource={toString:()=> 'vscode-remote:/notebook.ipynb'};let attempts=0,dirty=true;
 const textFiles={write:async()=>{},files:{get:()=>({isDirty:()=>dirty,save:async()=>{if(++attempts===2)dirty=false;return true;}})}};
 const save=installNativeSave({textFiles,fileService:{},commit:async()=>true});assert.equal(await save(resource,1),true);assert.equal(attempts,2);
});
test('native save failure does not fall back to an unguarded filesystem writer',async()=>{
 const {installNativeSave}=await import('../compat/native-save.js'),resource={toString:()=> 'vscode-remote:/source.cpp'};let fallback=false;
 const textFiles={write:async()=>{fallback=true;},files:{get:()=>({save:async()=>{try{await textFiles.write(resource,'value');return true;}catch{return false;}}})}};
 const save=installNativeSave({textFiles,fileService:{resolve:async()=>({})},commit:async()=>{throw Error('File changed outside the editor');}});
 await assert.rejects(save(resource,1),/changed outside/);assert.equal(fallback,false);
});
test('unowned extension resources retain the upstream write path',async()=>{
 const {installNativeSave}=await import('../compat/native-save.js'),resource={toString:()=> 'fixture-fs:/other'};let called=false;
 const textFiles={write:async()=>{called=true;return 7;},files:{get:()=>undefined}};
 installNativeSave({textFiles,fileService:{},commit:async()=>false});assert.equal(await textFiles.write(resource,'data'),7);assert(called);
});
