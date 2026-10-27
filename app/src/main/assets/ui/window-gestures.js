'use strict';
// A single app-owned pointer session arbitrates resize, whole-window movement
// and dragging a tab. A resize never starts a second Dockview drag session.
class StudioWindowGestures{
  constructor(windows){this.windows=windows;this.active=null;document.addEventListener('pointerdown',e=>this.down(e),true);document.addEventListener('pointermove',e=>this.move(e),true);document.addEventListener('pointerup',e=>this.up(e),true);document.addEventListener('pointercancel',e=>this.cancel(e),true);window.addEventListener('blur',()=>this.cancel());onNative('windowResizePointer',e=>this.nativePointer(e));}
  nativePointer(value){
    const event={pointerId:value.pointerId,clientX:value.x,clientY:value.y,pointerType:'touch',preventDefault(){},stopImmediatePropagation(){}};
    if(value.phase==='down'){this.cancel();const group=this.windows.api.getGroup(value.group),element=group?.element.closest('.dv-resize-container');if(!element)return;this.active={pointerId:value.pointerId,start:{x:value.x,y:value.y},type:'resize',direction:value.direction,element,box:element.getBoundingClientRect(),host:this.windows.host.getBoundingClientRect(),ids:group.panels.map(p=>p.id),group,dragging:false};this.windows.targets.cancel();this.windows.beginDrag();}
    else if(value.phase==='move')this.move(event);else if(value.phase==='up')this.up(event);else this.cancel(event);
  }
  down(event){
    this.windows.targets.stopInertia?.();if(this.active)this.cancel();if(event.button!==0||event.target.closest('button,input,select,textarea,.studio-inline-popover,.studio-choice-popover'))return;
    const w=this.windows,handle=event.target.closest('[class*="dv-resize-handle-"]'),floating=event.target.closest('.dv-resize-container');
    const group=w.api.groups.find(g=>g.element.contains(event.target)||floating&&g.element.closest('.dv-resize-container')===floating);if(!group)return;
    const tab=event.target.closest('.studio-tool-tab'),header=event.target.closest('.dv-floating-titlebar,.dv-tabs-and-actions-container');if(!handle&&!tab&&!header)return;
    event.preventDefault();event.stopImmediatePropagation();const box=floating?.getBoundingClientRect(),host=w.host.getBoundingClientRect();
    this.active={pointerId:event.pointerId,start:{x:event.clientX,y:event.clientY},type:handle?'resize':'pending',direction:handle?.className.replace('dv-resize-handle-',''),element:floating,box,host,ids:tab?[tab.dataset.tool]:group.panels.map(p=>p.id),group,tab,dragging:false};
    try{event.target.setPointerCapture(event.pointerId);}catch{}
    if(handle){w.targets.cancel();w.beginDrag();}
  }
  move(event){
    const a=this.active;if(!a||event.pointerId!==a.pointerId)return;const w=this.windows,dx=event.clientX-a.start.x,dy=event.clientY-a.start.y;
    if(a.type==='resize'){
      event.preventDefault();event.stopImmediatePropagation();const direction=a.direction,box=a.box;let width=box.width,height=box.height,left=box.x-a.host.x,top=box.y-a.host.y;
      if(direction.includes('right'))width=Math.max(120,Math.min(a.host.width-left,box.width+dx));
      if(direction.includes('left')){width=Math.max(120,Math.min(box.right-a.host.x,box.width-dx));left=box.right-a.host.x-width;}
      if(direction.includes('bottom'))height=Math.max(100,Math.min(a.host.height-top,box.height+dy));
      a.element.dispatchEvent(new CustomEvent('studio-set-bounds',{detail:{left,top,width,height}}));w.changed();return;
    }
    if(!a.dragging&&Math.hypot(dx,dy)>(event.pointerType==='touch'?12:6)){a.dragging=true;w.targets.begin(a.ids);w.targets.move(event);}
    if(a.dragging){event.preventDefault();event.stopImmediatePropagation();}
  }
  up(event){
    const a=this.active;if(!a||event.pointerId!==a.pointerId)return;this.active=null;event.preventDefault();event.stopImmediatePropagation();
    if(!a.dragging&&a.type!=='resize'&&a.tab){const panel=this.windows.api.getPanel(a.ids[0]);panel?.api.setActive();this.windows.codeWindows.get(a.ids[0])?.editor.focus();}
    this.windows.endDrag();this.windows.changed();
  }
  cancel(event){if(!this.active||event&&event.pointerId!==this.active.pointerId)return;const a=this.active;this.active=null;if(a.dragging)this.windows.targets.cancel();this.windows.endDrag();}
}
