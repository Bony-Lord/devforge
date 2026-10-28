'use strict';
let nativeSequence=0;
const nativePending=new Map(),nativeListeners=new Map();
function native(op,data={}){
  return new Promise((resolve,reject)=>{
    const id=String(++nativeSequence);
    const timer=setTimeout(()=>{nativePending.delete(id);reject(new Error('Истекло время ожидания: '+op));},op==='toolPackInstall'?1800000:op==='build'?390000:45000);
    nativePending.set(id,{resolve,reject,timer,op});
    try{ForgeNative.request(JSON.stringify({id,op,data}));}catch(e){clearTimeout(timer);nativePending.delete(id);reject(e);}
  });
}
window.__nativeResult=r=>{const p=nativePending.get(r.id);if(!p)return;nativePending.delete(r.id);clearTimeout(p.timer);if(p.op==='build')window.forge?.flushOutput?.('build');r.error?p.reject(new Error(r.error)):p.resolve(r.value);};
window.__nativeEvent=(type,data)=>{for(const fn of nativeListeners.get(type)||[])try{fn(data);}catch(e){console.error(type,e);}};
function onNative(type,fn){if(!nativeListeners.has(type))nativeListeners.set(type,new Set());nativeListeners.get(type).add(fn);return()=>nativeListeners.get(type).delete(fn);}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
