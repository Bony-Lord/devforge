'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {ExtensionGallery}=require('../extension-gallery.cjs');
const ROOT='https://open-vsx.org/api/',identity={namespace:'fixture',name:'extension'},never=()=>new Promise(()=>{}),pkg={manifest:{id:'vscode.fixture.extension',version:'1.0.0',vscode:{originalId:'fixture.extension',dependencyIds:[]}}};
test('a stalled details request times out, clears its controller, and can be retried',async()=>{
 let stalled=true;const gallery=new ExtensionGallery(async()=>stalled?never():new Response(JSON.stringify({...identity,version:'1.0.0',files:{}})),undefined,{infoTimeoutMs:25,requestTimeoutMs:1000});
 await assert.rejects(gallery.info({...identity,requestId:'card'}),/GALLERY_TIMEOUT/);assert.equal(gallery.infoRequests.size,0);stalled=false;assert.equal((await gallery.info(identity)).name,'extension');
});
test('details and search remain usable while downloading and are not cancelled with it',async()=>{
 const gallery=new ExtensionGallery(async url=>new Response(JSON.stringify(url.includes('/-/search')?{totalSize:1,extensions:[]}:{...identity,files:{}})),undefined,{runtime:()=> 'codeoss'});
 gallery.prepareOne=never;const pending=gallery.prepareFull({...identity,operationId:'download'});await assert.rejects(gallery.prepareFull(identity),/GALLERY_BUSY/);
 assert.equal((await gallery.info(identity)).name,'extension');assert.equal((await gallery.search({})).total,1);gallery.cancel({operationId:'download'});await assert.rejects(pending,/GALLERY_CANCELLED/);assert.equal(gallery.status().running,false);
});
test('cancelling an old operation never clears or cancels its replacement',async()=>{
 const gallery=new ExtensionGallery(undefined,undefined,{runtime:()=> 'codeoss'});let finishOld,finishNew;
 gallery.prepareOne=()=>new Promise(resolve=>{finishOld=resolve;});const first=gallery.prepareFull({...identity,operationId:'old'});await new Promise(setImmediate);gallery.cancel({operationId:'old'});await assert.rejects(first,/GALLERY_CANCELLED/);
 gallery.prepareOne=()=>new Promise(resolve=>{finishNew=resolve;});const second=gallery.prepareFull({...identity,operationId:'new'});await new Promise(setImmediate);finishOld({pkg});await new Promise(setImmediate);gallery.cancel({operationId:'old'});assert.equal(gallery.status().operationId,'new');finishNew({pkg});await second;assert.equal(gallery.status().running,false);
});
test('a stalled package stream times out, aborts the transport, removes its partial file, and releases the slot',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'df-gallery-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));let stalled=true,transportSignal;
 const bytes=Buffer.from('fixture'),expected=crypto.createHash('sha256').update(bytes).digest('hex');
 const gallery=new ExtensionGallery(async(url,options)=>{
  if(url.endsWith('/hash'))return new Response(expected);
  if(url.endsWith('/download')){transportSignal=options.signal;return stalled?{ok:true,headers:new Headers(),body:{[Symbol.asyncIterator](){return{next:never,return:async()=>({done:true})};}}}:new Response(bytes);}
  return new Response(JSON.stringify({files:{download:ROOT+'download',sha256:ROOT+'hash'}}));
 },undefined,{runtime:()=> 'codeoss',storage:()=>root,prepareFile:async()=>pkg,idleTimeoutMs:25,requestTimeoutMs:500});
 await assert.rejects(gallery.prepareFull(identity),/GALLERY_TIMEOUT/);await new Promise(setImmediate);assert.equal(transportSignal.aborted,true);assert.equal(gallery.status().running,false);assert.deepEqual(await fs.readdir(path.join(root,'vsix-downloads')),[]);
 stalled=false;assert.equal(JSON.parse((await gallery.prepareFull(identity)).text).manifest.id,pkg.manifest.id);
});
test('a total operation timeout recovers even if the preparer ignores cancellation',async()=>{
 const gallery=new ExtensionGallery(undefined,undefined,{runtime:()=> 'codeoss',operationTimeoutMs:25});gallery.prepareOne=never;
 await assert.rejects(gallery.prepareFull(identity),/GALLERY_TIMEOUT/);assert.equal(gallery.status().running,false);gallery.prepareOne=async()=>({pkg});await gallery.prepareFull(identity);
});
test('closing or disabling the gallery cancels its download and its independent cards',async()=>{
 const gallery=new ExtensionGallery(never,undefined,{runtime:()=> 'codeoss'});gallery.prepareOne=never;const download=gallery.prepareFull(identity),card=gallery.info({...identity,requestId:'closing'}),closed=Promise.all([assert.rejects(download,/GALLERY_CANCELLED/),assert.rejects(card,/GALLERY_CANCELLED/)]);gallery.close();await closed;assert.equal(gallery.status().running,false);assert.equal(gallery.infoRequests.size,0);
});
test('cancelling details does not cancel the installation and an optional stalled readme cannot block a card',async()=>{
 const gallery=new ExtensionGallery(async url=>url.endsWith('readme')?never():new Response(JSON.stringify({...identity,files:{readme:ROOT+'readme'}})),undefined,{readmeTimeoutMs:20});
 assert.equal((await gallery.info(identity)).readme,'');gallery.cache.clear();const card=gallery.info({...identity,requestId:'details'});gallery.cancelInfo({requestId:'details'});await assert.rejects(card,/GALLERY_CANCELLED/);assert.equal(gallery.infoRequests.size,0);
});
