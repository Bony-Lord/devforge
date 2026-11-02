'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('a renderer timeout cancels exactly its own preparation or details request',async()=>{
 for(const op of ['extensionGalleryPrepare','extensionGalleryPrepareSelection','extensionGalleryInfo']){
  const sent=[],timers=[],context=vm.createContext({window:{},crypto:require('node:crypto'),setTimeout:fn=>(timers.push(fn),timers.length),clearTimeout(){},ForgeNative:{request:raw=>sent.push(JSON.parse(raw))}});vm.runInContext(fs.readFileSync(require('../assets.cjs').ui+'/bridge.js','utf8'),context);
  const result=vm.runInContext('native('+JSON.stringify(op)+',{})',context);const failed=assert.rejects(result,/Истекло время/);timers[0]();await failed;assert.equal(sent.length,2);assert.equal(sent[1].op,op==='extensionGalleryInfo'?'extensionGalleryCancelInfo':'extensionGalleryCancel');const field=op==='extensionGalleryInfo'?'requestId':'operationId';assert.equal(sent[1].data[field],sent[0].data[field]);assert(sent[0].data[field]);
 }
});
