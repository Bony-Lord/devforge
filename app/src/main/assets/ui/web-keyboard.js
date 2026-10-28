'use strict';
// Declare the input method before Chromium focuses a field; hiding an IME after
// it has opened produces a visible flash and can interrupt a panel gesture.
const StudioWebKeyboard={
  modes:new WeakMap(),lastMode:null,lastFocused:null,queued:false,lossFrame:null,
  floating(){const ide=window.forge;return !window.StudioDesktop&&ide?.settings.keyboardPrimary==='floating'&&(!ide.addons?.host.lastFeatures||ide.addons.host.enabled('keyboard'));},
  field(){const e=document.activeElement;if(!studioTextInput(e))return null;const overlay=e.closest?.('.dv-render-overlay');if(overlay&&getComputedStyle(overlay).visibility==='hidden')return null;if(e.getBoundingClientRect){const r=e.getBoundingClientRect();if(!r.width||!r.height||getComputedStyle(e).visibility==='hidden')return null;}return e;},
  prepare(e){if(!e?.matches?.('input,textarea'))return;if(this.floating()){if(!this.modes.has(e))this.modes.set(e,e.getAttribute('inputmode'));if(e.getAttribute('inputmode')!=='none')e.setAttribute('inputmode','none');}else if(this.modes.has(e)){const original=this.modes.get(e);original===null?e.removeAttribute('inputmode'):e.setAttribute('inputmode',original);this.modes.delete(e);}},
  prepareTree(root){this.prepare(root);for(const e of root.querySelectorAll?.('input,textarea')||[])this.prepare(e);},
  publish(focused){if(focused!==this.lastFocused){this.lastFocused=focused;native('editorWebInput',{focused}).catch(console.warn);}},
  refresh(){const mode=this.floating();if(mode!==this.lastMode){this.lastMode=mode;this.prepareTree(document);}const field=this.field();this.prepare(field);const focused=!!field;if(!focused&&this.lastFocused===true){if(this.lossFrame===null)this.lossFrame=requestAnimationFrame(()=>{this.lossFrame=null;if(this.field())this.refresh();else this.publish(false);});}else{if(this.lossFrame!==null){cancelAnimationFrame(this.lossFrame);this.lossFrame=null;}this.publish(focused);}return focused;},
  queue(){if(this.queued)return;this.queued=true;queueMicrotask(()=>{this.queued=false;this.refresh();});},
  init(){if(this.initialized)return;this.initialized=true;this.refresh();document.addEventListener('pointerdown',e=>{this.prepare(e.target);if(this.floating()&&e.target===this.field())native('keyboard').catch(console.warn);},true);for(const type of ['focusin','focusout'])document.addEventListener(type,()=>this.queue());new MutationObserver(records=>{for(const r of records)for(const node of r.addedNodes)this.prepareTree(node);this.queue();}).observe(document.body,{childList:true,subtree:true});onNative('floatingKeyboardMode',e=>{this.refresh();if(e.mode==='system'&&this.field())requestAnimationFrame(()=>{if(!this.floating()&&this.field())native('keyboard').catch(console.warn);});});}
};
