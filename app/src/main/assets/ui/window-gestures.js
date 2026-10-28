'use strict';
// A single app-owned pointer session arbitrates resize, whole-window movement
// and dragging a tab. A resize never starts a second Dockview drag session.
class StudioWindowGestures{
  constructor(windows){this.windows=windows;this.active=null;document.addEventListener('pointerdown',e=>this.down(e),true);document.addEventListener('pointermove',e=>this.move(e),true);document.addEventListener('pointerup',e=>this.up(e),true);document.addEventListener('pointercancel',e=>this.cancel(e),true);window.addEventListener('blur',()=>this.cancel());onNative('windowResizePointer',e=>this.nativePointer(e));}
  nativePointer(value){
    const event={pointerId:value.pointerId,clientX:value.x,clientY:value.y,pointerType:'touch',preventDefault(){},stopImmediatePropagation(){}};
    if(value.phase==='down'){this.cancel();this.windows.targets.stopInertia?.();this.windows.stopLayoutAnimation();const group=this.windows.api.getGroup(value.group),element=group?.element.closest('.dv-resize-container');if(!element)return;this.active={pointerId:value.pointerId,start:{x:value.x,y:value.y},type:'resize',direction:value.direction,element,box:element.getBoundingClientRect(),host:this.windows.host.getBoundingClientRect(),ids:group.panels.map(p=>p.id),group,dragging:false};this.windows.targets.cancel();this.windows.beginDrag();}
    else if(value.phase==='move')this.move(event);else if(value.phase==='up')this.up(event);else this.cancel(event);
  }
  down(event){
    if(this.active&&this.active.pointerId!==event.pointerId){event.preventDefault();event.stopImmediatePropagation();return;}
    this.windows.targets.stopInertia?.();if(this.active)this.cancel();if(event.button!==0||event.target.closest('button,input,select,textarea,.studio-inline-popover,.studio-choice-popover'))return;
    const w=this.windows,handle=event.target.closest('[class*="dv-resize-handle-"]'),floating=event.target.closest('.dv-resize-container');
    const group=w.api.groups.find(g=>g.element.contains(event.target)||floating&&g.element.closest('.dv-resize-container')===floating);if(!group)return;
    const tab=event.target.closest('.studio-tool-tab'),header=event.target.closest('.dv-floating-titlebar,.dv-tabs-and-actions-container');if(!handle&&!tab&&!header)return;
    event.preventDefault();event.stopImmediatePropagation();w.stopLayoutAnimation();const box=floating?.getBoundingClientRect(),host=w.host.getBoundingClientRect();
    this.active={pointerId:event.pointerId,start:{x:event.clientX,y:event.clientY},type:handle?'resize':'pending',direction:handle?.className.replace('dv-resize-handle-',''),element:floating,box,host,ids:tab?[tab.dataset.tool]:group.panels.map(p=>p.id),group,tab,dragging:false};
    try{w.host.setPointerCapture(event.pointerId);}catch{}
    if(handle){w.targets.cancel();w.beginDrag();}
  }
  move(event){
    const a=this.active;if(!a||event.pointerId!==a.pointerId)return;const w=this.windows,dx=event.clientX-a.start.x,dy=event.clientY-a.start.y;
    if(a.type==='resize'){
      event.preventDefault();event.stopImmediatePropagation();const direction=a.direction,box=a.box;let width=box.width,height=box.height,left=box.x-a.host.x,top=box.y-a.host.y;
      if(direction.includes('right'))width=Math.max(120,Math.min(a.host.width-left,box.width+dx));
      if(direction.includes('left')){width=Math.max(120,Math.min(box.right-a.host.x,box.width-dx));left=box.right-a.host.x-width;}
      if(direction.includes('bottom'))height=Math.max(100,Math.min(a.host.height-top,box.height+dy));
      w.setFloatingBounds(a.group,{left,top,width,height});w.changed();return;
    }
    if(a.tab&&a.type!=='dock'&&Math.hypot(dx,dy)>(event.pointerType==='touch'?12:6)){
      const header=a.group.element.querySelector('.dv-tabs-and-actions-container')?.getBoundingClientRect();
      if(header&&event.clientX>=header.left&&event.clientX<=header.right&&event.clientY>=header.top-10&&event.clientY<=header.bottom+10){
        if(!a.dragging){a.dragging=true;a.type='tabs';w.beginDrag();const tab=a.tab.closest('.dv-tab')||a.tab;a.tabBox=tab.getBoundingClientRect();a.ghost=a.tab.cloneNode(true);a.ghost.classList.add('studio-tab-ghost');Object.assign(a.ghost.style,{width:a.tabBox.width+'px',height:a.tabBox.height+'px'});document.body.append(a.ghost);a.tab.classList.add('studio-tab-moving');}
        Object.assign(a.ghost.style,{left:event.clientX-(a.start.x-a.tabBox.x)+'px',top:header.y+'px'});
        const panel=w.api.getPanel(a.ids[0]),peers=a.group.panels.filter(p=>p!==panel),index=peers.filter(p=>{const rect=a.group.element.querySelector('.studio-tool-tab[data-tool="'+p.id+'"]').getBoundingClientRect();return event.clientX>rect.x+rect.width/2;}).length;
        if(a.group.panels.indexOf(panel)!==index){const before=new Map([...a.group.element.querySelectorAll('.studio-tool-tab')].map(t=>[t.dataset.tool,t.getBoundingClientRect()]));panel.api.moveTo({group:a.group,index});if(!!StudioMotion.enabled())for(const tab of a.group.element.querySelectorAll('.studio-tool-tab')){const previous=before.get(tab.dataset.tool),rect=tab.getBoundingClientRect();if(previous&&tab!==a.tab)tab.animate([{transform:`translateX(${previous.x-rect.x}px)`},{transform:'none'}],{duration:160,easing:'cubic-bezier(.2,.7,.2,1)'});}}
        event.preventDefault();event.stopImmediatePropagation();return;
      }
      this.clearTab(a);a.type='dock';a.dragging=true;w.targets.begin(a.ids);w.targets.move(event);
    }
    if(!a.dragging&&Math.hypot(dx,dy)>(event.pointerType==='touch'?12:6)){a.dragging=true;a.type='dock';w.targets.begin(a.ids);w.targets.move(event);}
    if(a.dragging){event.preventDefault();event.stopImmediatePropagation();}
  }
  up(event){
    const a=this.active;if(!a||event.pointerId!==a.pointerId)return;this.active=null;event.preventDefault();event.stopImmediatePropagation();
    this.clearTab(a);if((!a.dragging||a.type==='tabs')&&a.type!=='resize'&&a.tab){const panel=this.windows.api.getPanel(a.ids[0]);panel?.api.setActive();this.windows.codeWindows.get(a.ids[0])?.editor.focus();}
    if(a.type==='resize')for(const id of a.ids)this.windows.remember(this.windows.api.getPanel(id));
    this.windows.endDrag();this.windows.changed();
  }
  clearTab(a){a.ghost?.remove();a.ghost=null;a.tab?.classList.remove('studio-tab-moving');}
  cancel(event){if(!this.active||event&&event.pointerId!==this.active.pointerId)return;const a=this.active;this.active=null;this.clearTab(a);if(a.dragging)this.windows.targets.cancel();this.windows.endDrag();}
}
