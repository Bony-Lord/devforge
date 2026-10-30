'use strict';
const StudioNativeActivity={pending:new Map(),notify(){if(typeof document!=='undefined')document.dispatchEvent(new CustomEvent('studio:native-activity'));},start(id,op){if(/^(?:extensionGallery(?:Info|Search|Prepare)|optionalAssetInstall|python(?:Runtime|Style|Intelligence)Install|toolPackInstall(?:Many)?|build|cmakeConfigure|addonBegin|addonFinish)$/.test(op)){this.pending.set(id,op);this.notify();}},finish(id){if(this.pending.delete(id))this.notify();}};
globalThis.StudioNativeActivity=StudioNativeActivity;
let nativeSequence=0;
const nativePending=new Map(),nativeListeners=new Map();
function native(op,data={}){
  return new Promise((resolve,reject)=>{
    const id=String(++nativeSequence);
    const timer=setTimeout(()=>{nativePending.delete(id);StudioNativeActivity.finish(id);reject(new Error('Истекло время ожидания: '+op));},['toolPackInstall','toolPackInstallMany','toolPackRemove','toolEngineRemove'].includes(op)?1800000:['pythonStyleInstall','pythonIntelligenceInstall','optionalAssetInstall','extensionGalleryInfo','extensionGalleryPrepare'].includes(op)?210000:op==='build'?390000:45000);
    nativePending.set(id,{resolve,reject,timer,op});StudioNativeActivity.start(id,op);
    try{ForgeNative.request(JSON.stringify({id,op,data}));}catch(e){clearTimeout(timer);nativePending.delete(id);StudioNativeActivity.finish(id);reject(e);}
  });
}
window.__nativeResult=r=>{const p=nativePending.get(r.id);if(!p)return;nativePending.delete(r.id);StudioNativeActivity.finish(r.id);clearTimeout(p.timer);if(p.op==='build')window.forge?.flushOutput?.('build');if(r.error?.startsWith('WORKSPACE_UNTRUSTED:'))window.forge?.openWorkspaceTrust();r.error?p.reject(new Error(r.error)):p.resolve(r.value);};
window.__nativeEvent=(type,data)=>{for(const fn of nativeListeners.get(type)||[])try{fn(data);}catch(e){console.error(type,e);}};
function onNative(type,fn){if(!nativeListeners.has(type))nativeListeners.set(type,new Set());nativeListeners.get(type).add(fn);return()=>nativeListeners.get(type).delete(fn);}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
