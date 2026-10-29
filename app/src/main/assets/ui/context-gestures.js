'use strict';
// Touch context menus share existing right-click handlers; text selection is native.
const StudioContextGestures={
 init(){if(this.started)return;this.started=true;let press=null,suppress=null;const pointers=new Set(),selector='.tree-row,#projectName,.studio-project-row,.tab,.studio-tool-tab,[data-context-menu]';
  const cancel=()=>{if(press)clearTimeout(press.timer);press=null;};
  document.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;pointers.add(e.pointerId);cancel();if(pointers.size!==1||e.target.closest('input,textarea,[contenteditable=true],.tree-drag-handle,.tab-close,button.studio-project-more'))return;const target=e.target.closest(selector);if(!target)return;const p=press={id:e.pointerId,target,x:e.clientX,y:e.clientY};p.timer=setTimeout(()=>{if(press!==p||!target.isConnected)return;p.shown=true;suppress={target,until:performance.now()+1000};target.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:p.x,clientY:p.y,button:2}));},550);},true);
  document.addEventListener('pointermove',e=>{if(press?.id===e.pointerId&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>9)cancel();},true);
  for(const type of ['pointerup','pointercancel'])document.addEventListener(type,e=>{pointers.delete(e.pointerId);if(press?.id===e.pointerId){if(press.shown){e.preventDefault();suppress={target:press.target,until:performance.now()+800};}cancel();}},true);
  document.addEventListener('click',e=>{if(suppress&&performance.now()<suppress.until&&suppress.target.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}suppress=null;},true);
  document.addEventListener('contextmenu',e=>{if(e.isTrusted&&suppress&&performance.now()<suppress.until&&suppress.target.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('scroll',cancel,true);window.addEventListener('blur',()=>{cancel();pointers.clear();});
  document.addEventListener('keydown',e=>{if(e.key!=='ContextMenu'&&!(e.shiftKey&&e.key==='F10'))return;const target=e.target.closest(selector);if(!target||e.target.closest('input,textarea,[contenteditable=true]'))return;const r=target.getBoundingClientRect();e.preventDefault();target.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+20,clientY:r.bottom,button:2}));});
 }
};
