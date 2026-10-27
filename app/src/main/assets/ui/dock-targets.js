'use strict';
// Direct docking with a highlighted destination, stationary dwell and rollback.
// No private or Enterprise drag compass is used.
class StudioDockTargets{
  constructor(windows){this.windows=windows;this.ctx=null;document.addEventListener('pointerdown',e=>{this.startPoint={x:e.clientX,y:e.clientY};},true);document.addEventListener('pointermove',e=>this.move(e),true);document.addEventListener('pointerup',e=>this.finish(e),true);document.addEventListener('pointercancel',()=>this.cancel(),true);windows.api.onWillShowOverlay(e=>{if(this.ctx||this.finishing)e.preventDefault();});windows.api.onWillDrop(e=>{if(this.ctx||this.finishing)e.preventDefault();});}
  begin(ids){
    this.stopInertia?.();this.cancel();const w=this.windows,rect=w.host.getBoundingClientRect(),group=w.api.getPanel(ids[0])?.group;this.ctx={ids,layout:w.api.toJSON(),rect,start:this.startPoint,sourceBox:group?.element.getBoundingClientRect(),boxes:new Map(w.api.groups.map(g=>[g.id,g.element.getBoundingClientRect()])),targets:[],anchor:null,selected:null,samples:[]};
    this.layer=document.createElement('div');this.layer.className='studio-dock-compass';document.body.append(this.layer);w.beginDrag();
  }
  intent(event){
    const c=this.ctx,w=this.windows;
    const x=event.clientX,y=event.clientY,r=c.rect;
    // A file header is a tab target even when it touches the top of the screen.
    for(const group of w.api.groups){const box=c.boxes.get(group.id),ids=group.panels.map(p=>p.id).filter(id=>!c.ids.includes(id));if(box&&ids.length&&x>box.left+12&&x<box.right-12&&y>=box.top&&y<box.top+32)return{side:'center',scope:'window',ids,key:'tabs:'+group.id};}
    const edge=[['left',x-r.left],['right',r.right-x],['top',y-r.top],['bottom',r.bottom-y]].filter(([,distance])=>distance>=0&&distance<22).sort((a,b)=>a[1]-b[1])[0];
    if(edge)return{side:edge[0],scope:'screen',ids:null,key:'screen:'+edge[0]};
    for(const group of w.api.groups){const box=c.boxes.get(group.id),ids=group.panels.map(p=>p.id).filter(id=>!c.ids.includes(id));if(!box||!ids.length||x<box.x||x>box.right||y<box.y||y>box.bottom)continue;
      if(y-box.top<32)return{side:'center',scope:'window',ids,key:'tabs:'+group.id};
      const near=[['left',x-box.left],['right',box.right-x],['top',y-box.top],['bottom',box.bottom-y]].filter(([,distance])=>distance<25).sort((a,b)=>a[1]-b[1])[0];if(near)return{side:near[0],scope:'window',ids,key:group.id+':'+near[0]};
    }return null;
  }
  insert(c,target){
    if(this.ctx!==c&& !this.finishing)return;const w=this.windows,panel=w.api.getPanel(c.ids[0]);if(!panel)return;
    if(target.scope==='group')w.animateLayout(()=>w.applyLayout(StudioDockLayout.place(c.layout,c.ids,target.side,target.ids)));
    else w.animateLayout(()=>{let group=target.scope==='window'?w.api.groups.find(g=>g.panels.some(p=>target.ids?.includes(p.id))):null;if(!group)group=w.api.addGroup({direction:{top:'above',bottom:'below',left:'left',right:'right'}[target.side]||'right'});const item=c.ids.length===panel.group.panels.length?panel.group:panel;item.api.moveTo({group,position:target.scope==='screen'?'center':target.side});});
    c.dockedTarget=target.key;c.hadDock=true;c.live=null;this.highlight(null);w.changed();
  }
  move(event){
    const c=this.ctx;if(!c)return;const target=this.intent(event),key=target?.key;
    c.samples.push({x:event.clientX,y:event.clientY,time:performance.now()});while(c.samples.length>2&&c.samples.at(-1).time-c.samples[0].time>100)c.samples.shift();
    if(key!==c.intent?.key||!c.dockedTarget&&c.intentPoint&&Math.hypot(event.clientX-c.intentPoint.x,event.clientY-c.intentPoint.y)>8){clearTimeout(c.intentTimer);c.intent=target;c.intentPoint={x:event.clientX,y:event.clientY};if(target)c.intentTimer=setTimeout(()=>{if(this.ctx===c&&c.intent?.key===key){try{this.insert(c,target);}catch(error){safeError(error);}}},360);}
    // Once the dwell has inserted the window, keep it there while the pointer
    // stays over that target. Leaving detaches it again without rebuilding peers.
    if(c.dockedTarget&&c.dockedTarget===key){this.highlight(null);return;}
    if(c.dockedTarget){c.live=null;c.dockedTarget=null;}
    if(!c.live){const w=this.windows,panel=w.api.getPanel(c.ids[0]),box=c.sourceBox;if(panel.api.location.type!=='floating'||c.ids.length!==panel.group.panels.length)w.api.addFloatingGroup(c.ids.length===panel.group.panels.length?panel.group:panel,{x:box.x-c.rect.x,y:box.y-c.rect.y,width:Math.min(box.width,c.rect.width-16),height:Math.min(box.height,c.rect.height-16)});c.live=panel.group.element.closest('.dv-resize-container');}
    const dx=event.clientX-(c.start?.x||event.clientX),dy=event.clientY-(c.start?.y||event.clientY);c.live.dispatchEvent(new CustomEvent('studio-set-bounds',{detail:{left:c.sourceBox.x-c.rect.x+dx,top:c.sourceBox.y-c.rect.y+dy}}));NativeEditing.queueLayout();
    this.highlight(target);
  }
  highlight(target){
    if(!this.layer)return;if(!target){if(this.previewElement)this.previewElement.hidden=true;return;}
    const c=this.ctx;let box=c.rect;if(target.ids?.length){const group=this.windows.api.groups.find(g=>g.panels.some(p=>target.ids.includes(p.id)));box=c.boxes.get(group?.id)||group?.element.getBoundingClientRect()||box;}
    let{x,y,width,height}=box;if(['left','right'].includes(target.side)){width*=.28;if(target.side==='right')x+=box.width-width;}else if(['top','bottom'].includes(target.side)){height*=.28;if(target.side==='bottom')y+=box.height-height;}
    const element=this.previewElement||document.createElement('div');element.className='studio-dock-preview';element.hidden=false;element.dataset.side=target.side;element.setAttribute('aria-label',tr('Место привязки'));Object.assign(element.style,{left:x+'px',top:y+'px',width:width+'px',height:height+'px'});if(!this.previewElement)this.layer.append(element);this.previewElement=element;NativeEditing.queueLayout();
  }
  restorePeers(c){
    const w=this.windows,panel=w.api.getPanel(c.ids[0]),element=panel?.group.element.closest('.dv-resize-container');if(!element)return;const box=element.getBoundingClientRect(),host=w.host.getBoundingClientRect();w.animateLayout(()=>{w.applyLayout(c.layout);const original=w.api.getPanel(c.ids[0]);w.api.addFloatingGroup(c.ids.length===original.group.panels.length?original.group:original,{x:box.x-host.x,y:box.y-host.y,width:box.width,height:box.height});});
  }

  finish(event){
    const c=this.ctx;if(!c)return;const target=this.intent(event);this.finishing=true;this.clear();
    setTimeout(()=>{try{if(c.dockedTarget!==target?.key&&c.hadDock){this.restorePeers(c);c.dockedTarget=null;}if(!c.dockedTarget&&!target)this.inertia(c);this.windows.remember(this.windows.api.getPanel(c.ids[0]));this.windows.changed();}catch(error){safeError(error);}finally{this.finishing=false;}},0);
  }

  inertia(c){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches||c.samples.length<2)return;const first=c.samples[0],last=c.samples.at(-1),elapsed=last.time-first.time;if(elapsed<10||performance.now()-last.time>110)return;
    let vx=Math.max(-1.5,Math.min(1.5,(last.x-first.x)/elapsed)),vy=Math.max(-1.5,Math.min(1.5,(last.y-first.y)/elapsed));if(Math.hypot(vx,vy)<.12)return;
    const w=this.windows,panel=w.api.getPanel(c.ids[0]),element=panel?.group.element.closest('.dv-resize-container');if(!element)return;const host=w.host.getBoundingClientRect(),box=element.getBoundingClientRect();let x=box.x-host.x,y=box.y-host.y,previous=performance.now(),active=true;
    const stop=()=>{if(!active)return;active=false;this.stopInertia=null;w.endDrag();w.remember(panel);w.changed();};this.stopInertia=stop;w.beginDrag();
    const tick=now=>{if(!active||!element.isConnected)return stop();const dt=Math.min(32,now-previous);previous=now;const nx=Math.max(0,Math.min(host.width-box.width,x+vx*dt)),ny=Math.max(0,Math.min(host.height-box.height,y+vy*dt));if(nx===x)vx=0;if(ny===y)vy=0;x=nx;y=ny;const decay=Math.exp(-dt/125);vx*=decay;vy*=decay;element.dispatchEvent(new CustomEvent('studio-set-bounds',{detail:{left:x,top:y}}));NativeEditing.queueLayout();if(Math.hypot(vx,vy)>.025)requestAnimationFrame(tick);else stop();};requestAnimationFrame(tick);
  }
  clear(){clearTimeout(this.ctx?.intentTimer);this.layer?.remove();this.layer=null;this.previewElement=null;this.ctx=null;NativeEditing.queueLayout();}
  cancel(){if(this.ctx){const c=this.ctx;this.clear();if(c.live||c.hadDock)setTimeout(()=>this.windows.animateLayout(()=>this.windows.applyLayout(c.layout)),0);}}
}
