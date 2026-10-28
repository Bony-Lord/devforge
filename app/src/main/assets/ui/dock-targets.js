'use strict';
// Direct docking with a highlighted destination, stationary dwell and rollback.
// No private or Enterprise drag compass is used.
class StudioDockTargets{
  constructor(windows){this.windows=windows;this.ctx=null;document.addEventListener('pointerdown',e=>{if(!this.ctx)this.startPoint={x:e.clientX,y:e.clientY,pointerId:e.pointerId};},true);document.addEventListener('pointermove',e=>this.move(e),true);document.addEventListener('pointerup',e=>this.finish(e),true);document.addEventListener('pointercancel',e=>{if(!this.ctx||e.pointerId===this.ctx.pointerId)this.cancel();},true);windows.api.onWillShowOverlay(e=>{if(this.ctx||this.finishing)e.preventDefault();});windows.api.onWillDrop(e=>{if(this.ctx||this.finishing)e.preventDefault();});}
  begin(ids){
    this.stopInertia?.();this.cancel();const w=this.windows,rect=w.host.getBoundingClientRect(),group=w.api.getPanel(ids[0])?.group;this.ctx={ids,layout:w.api.toJSON(),rect,start:w.gestures?.active?.start||this.startPoint,pointerId:w.gestures?.active?.pointerId??this.startPoint?.pointerId,sourceBox:(group?.element.closest('.dv-resize-container')||group?.element)?.getBoundingClientRect(),sourceFloating:w.api.getPanel(ids[0])?.api.location.type==='floating'&&ids.length===group?.panels.length,boxes:new Map(w.api.groups.map(g=>[g.id,g.element.getBoundingClientRect()])),targets:[],anchor:null,selected:null,samples:[]};
    this.layer=document.createElement('div');this.layer.className='studio-dock-compass';document.body.append(this.layer);w.beginDrag();
  }
  refreshGeometry(){const c=this.ctx;if(!c)return;c.rect=this.windows.host.getBoundingClientRect();c.boxes=new Map(this.windows.api.groups.map(g=>[g.id,g.element.getBoundingClientRect()]));}
  tabTarget(group,x){const ids=group.panels.map(p=>p.id).filter(id=>!this.ctx.ids.includes(id));let index=ids.length;for(let i=0;i<ids.length;i++){const rect=group.element.querySelector('.studio-tool-tab[data-tool="'+ids[i]+'"]')?.getBoundingClientRect();if(rect&&x<rect.x+rect.width/2){index=i;break;}}return{side:'center',scope:'window',ids,index,beforeId:ids[index]||null,key:'tabs:'+group.id+':'+(ids[index]||'end')};}
  intent(event){
    this.refreshGeometry();const c=this.ctx,w=this.windows;
    const x=event.clientX,y=event.clientY,r=c.rect;
    // Screen edges win at the outermost strip; a header cannot steal the right edge.
    const edge=[['left',x-r.left],['right',r.right-x]].filter(([,distance])=>distance>=-24&&distance<30).sort((a,b)=>Math.abs(a[1])-Math.abs(b[1]))[0];
    if(edge)return{side:edge[0],scope:'screen',ids:null,key:'screen:'+edge[0]};
    for(const group of [...w.api.groups].reverse()){const box=c.boxes.get(group.id),ids=group.panels.map(p=>p.id).filter(id=>!c.ids.includes(id));if(box&&ids.length&&x>box.left+8&&x<box.right-8&&y>=box.top&&y<box.top+32)return this.tabTarget(group,x);}
    const vertical=[['top',y-r.top],['bottom',r.bottom-y]].find(([,distance])=>distance>=-24&&distance<30);if(vertical)return{side:vertical[0],scope:'screen',ids:null,key:'screen:'+vertical[0]};
    for(const group of [...w.api.groups].reverse()){const box=c.boxes.get(group.id),ids=group.panels.map(p=>p.id).filter(id=>!c.ids.includes(id));if(!box||!ids.length||x<box.x-8||x>box.right+8||y<box.y-8||y>box.bottom+8)continue;
      const bandX=Math.min(64,box.width*.24),bandY=Math.min(64,box.height*.24),horizontal=[['left',x-box.left],['right',box.right-x]].filter(([,distance])=>distance>=-8&&distance<bandX).sort((a,b)=>a[1]-b[1])[0];
      if(horizontal)return{side:horizontal[0],scope:'window',ids,key:group.id+':'+horizontal[0]};
      if(y>=box.top&&y-box.top<32)return this.tabTarget(group,x);
      const near=[['top',y-box.top],['bottom',box.bottom-y]].filter(([,distance])=>distance>=-8&&distance<bandY).sort((a,b)=>a[1]-b[1])[0];if(near)return{side:near[0],scope:'window',ids,key:group.id+':'+near[0]};
    }return null;
  }
  insert(c,target){
    if(this.ctx!==c&& !this.finishing)return;const w=this.windows,panel=w.api.getPanel(c.ids[0]);if(!panel)return;
    if(target.scope==='group')w.animateLayout(()=>w.applyLayout(StudioDockLayout.place(c.layout,c.ids,target.side,target.ids)));
    else w.animateLayout(()=>{let group=target.scope==='window'?w.api.groups.find(g=>g.panels.some(p=>target.ids?.includes(p.id))):null;if(!group)group=w.api.addGroup({direction:{top:'above',bottom:'below',left:'left',right:'right'}[target.side]||'right'});if(target.side==='center'){for(let offset=0;offset<c.ids.length;offset++)w.api.getPanel(c.ids[offset])?.api.moveTo({group,position:'center',index:(target.index??group.panels.length)+offset});}else{const item=c.ids.length===panel.group.panels.length?panel.group:panel;item.api.moveTo({group,position:target.scope==='screen'?'center':target.side});}});
    c.dockedTarget=target.key;c.dockedAt={...c.intentPoint};c.hadDock=true;c.live=null;this.highlight(null);w.changed();
  }
  move(event){
    const c=this.ctx;if(!c||event.pointerId!==c.pointerId)return;const retained=c.dockedTarget&&c.dockedAt&&Math.hypot(event.clientX-c.dockedAt.x,event.clientY-c.dockedAt.y)<=18;if(retained){this.refreshGeometry();this.highlight(null);return;}const target=this.intent(event),key=target?.key;
    c.samples.push({x:event.clientX,y:event.clientY,time:performance.now()});while(c.samples.length>2&&c.samples.at(-1).time-c.samples[0].time>100)c.samples.shift();
    if(key!==c.intent?.key){clearTimeout(c.intentTimer);c.intent=target;c.ready=null;c.intentPoint={x:event.clientX,y:event.clientY};c.intentSince=performance.now();if(target){const since=c.intentSince;const tick=()=>{if(this.ctx!==c||c.intentSince!==since)return;this.highlight(c.intent);if(performance.now()-since<300)requestAnimationFrame(tick);};requestAnimationFrame(tick);c.intentTimer=setTimeout(()=>{if(this.ctx===c&&c.intent?.key===key){c.ready=target;this.highlight(target);}},300);}}
    // Once the dwell has inserted the window, keep it there while the pointer
    // stays over that target. Leaving detaches it again without rebuilding peers.
    if(c.dockedTarget&&c.dockedTarget===key){this.highlight(null);return;}
    if(c.dockedTarget){c.live=null;c.dockedTarget=null;}
    if(!c.live){const w=this.windows,panel=w.api.getPanel(c.ids[0]),box=c.sourceBox;c.floatSize=c.sourceFloating?{width:box.width,height:box.height}:w.floatingSize(box,panel.id);c.floatStarted=performance.now();if(panel.api.location.type!=='floating'||c.ids.length!==panel.group.panels.length)w.preserveToolSizes(()=>w.api.addFloatingGroup(c.ids.length===panel.group.panels.length?panel.group:panel,{x:box.x-c.rect.x,y:box.y-c.rect.y,width:Math.min(box.width,c.rect.width-16),height:Math.min(box.height,c.rect.height-16)}));c.live=panel.group.element.closest('.dv-resize-container');const tick=()=>{if(this.ctx!==c||!c.live)return;this.renderLive(c);if(performance.now()-c.floatStarted<180)requestAnimationFrame(tick);else w.settleLayout();};requestAnimationFrame(tick);}
    c.pointer={x:event.clientX,y:event.clientY};this.renderLive(c);
    this.highlight(target);
  }
  renderLive(c){
    if(!c.live||!c.pointer)return;const w=this.windows,panel=w.api.getPanel(c.ids[0]);if(!panel)return;const progress=!StudioMotion.enabled()?1:Math.min(1,(performance.now()-c.floatStarted)/180),ease=1-Math.pow(1-progress,3),width=c.sourceBox.width+(c.floatSize.width-c.sourceBox.width)*ease,height=c.sourceBox.height+(c.floatSize.height-c.sourceBox.height)*ease,anchorX=Math.max(0,Math.min(1,((c.start?.x??c.pointer.x)-c.sourceBox.x)/c.sourceBox.width)),anchorY=Math.max(8,Math.min(34,(c.start?.y??c.pointer.y)-c.sourceBox.y));w.setFloatingBounds(panel.group,{left:c.pointer.x-c.rect.x-width*anchorX,top:c.pointer.y-c.rect.y-anchorY,width,height});NativeEditing.queueLayout();
    const dismiss=this.visibleRatio(c.live.getBoundingClientRect(),c.rect)<.3;if(dismiss&&this.layer&&!this.dismissHint){this.dismissHint=document.createElement('div');this.dismissHint.className='studio-dock-dismiss';this.dismissHint.textContent=tr('Скрыть окно');this.layer.append(this.dismissHint);}if(this.dismissHint)this.dismissHint.hidden=!dismiss;
  }
  visibleRatio(box,host){return Math.max(0,Math.min(box.right,host.right)-Math.max(box.left,host.left))*Math.max(0,Math.min(box.bottom,host.bottom)-Math.max(box.top,host.top))/(box.width*box.height);}
  releaseOutside(c){const w=this.windows,panel=w.api.getPanel(c.ids[0]),element=panel?.group.element.closest('.dv-resize-container');if(!element)return false;const host=w.host.getBoundingClientRect(),box=element.getBoundingClientRect();if(this.visibleRatio(box,host)<.3){for(const id of c.ids)w.hide(id);return true;}const left=Math.max(0,Math.min(host.width-box.width,box.x-host.x)),top=Math.max(0,Math.min(host.height-box.height,box.y-host.y));if(Math.abs(left-(box.x-host.x))+Math.abs(top-(box.y-host.y))<1)return false;w.animateLayout(()=>w.setFloatingBounds(panel.group,{left,top}));return true;}
  highlight(target){
    if(!this.layer)return;if(!target){if(this.previewElement)this.previewElement.hidden=true;return;}
    const c=this.ctx;let box=c.rect;if(target.ids?.length){const group=this.windows.api.groups.find(g=>g.panels.some(p=>target.ids.includes(p.id)));box=c.boxes.get(group?.id)||group?.element.getBoundingClientRect()||box;}
    let{x,y,width,height}=box;if(target.side==='center'){const group=this.windows.api.groups.find(g=>g.panels.some(p=>target.ids?.includes(p.id))),before=target.beforeId&&group?.element.querySelector('.studio-tool-tab[data-tool="'+target.beforeId+'"]'),last=group?.element.querySelector('.studio-tool-tab[data-tool="'+target.ids.at(-1)+'"]'),tabs=group?.element.querySelector('.dv-tabs-container')?.getBoundingClientRect(),tab=(before||last)?.getBoundingClientRect();x=Math.max(box.x+3,Math.min(tabs?.right||box.right-50,before?tab.x:(tab?.right||box.x+8)))-2;y=(tab?.y||box.y)+3;width=4;height=Math.max(18,(tab?.height||30)-6);}else if(['left','right'].includes(target.side)){width*=.28;if(target.side==='right')x+=box.width-width;}else if(['top','bottom'].includes(target.side)){height*=.28;if(target.side==='bottom')y+=box.height-height;}
    const element=this.previewElement||document.createElement('div');element.className='studio-dock-preview'+(target.side==='center'?' studio-tab-insertion':'');element.hidden=false;element.dataset.side=target.side;element.dataset.ready=String(!!c.ready);element.dataset.before=target.beforeId||'';element.setAttribute('aria-label',tr(target.side==='center'?'Место вставки вкладки':'Место привязки'));element.style.setProperty('--dock-dwell',String(Math.min(1,Math.max(0,(performance.now()-c.intentSince)/300))));Object.assign(element.style,{left:x+'px',top:y+'px',width:width+'px',height:height+'px'});if(!this.previewElement)this.layer.append(element);this.previewElement=element;NativeEditing.queueLayout();
  }
  restorePeers(c){
    const w=this.windows,panel=w.api.getPanel(c.ids[0]),element=panel?.group.element.closest('.dv-resize-container');if(!element)return;const box=element.getBoundingClientRect(),host=w.host.getBoundingClientRect();w.animateLayout(()=>{w.applyLayout(c.layout);const original=w.api.getPanel(c.ids[0]);w.api.addFloatingGroup(c.ids.length===original.group.panels.length?original.group:original,{x:box.x-host.x,y:box.y-host.y,width:box.width,height:box.height});});
  }

  finish(event){
    const c=this.ctx;if(!c||event.pointerId!==c.pointerId)return;const retained=c.dockedTarget&&c.dockedAt&&Math.hypot(event.clientX-c.dockedAt.x,event.clientY-c.dockedAt.y)<=18,target=retained?{key:c.dockedTarget}:this.intent(event);this.finishing=true;this.clear();
    setTimeout(()=>{try{if(target&&c.ready?.key===target.key)this.insert(c,target);else{if(c.live&&c.floatSize&&performance.now()-c.floatStarted<180)this.windows.animateLayout(()=>{c.floatStarted=performance.now()-180;this.renderLive(c);});if(!this.releaseOutside(c)&&!target)this.inertia(c);}this.windows.remember(this.windows.api.getPanel(c.ids[0]));this.windows.settleLayout();this.windows.changed();}catch(error){safeError(error);}finally{this.finishing=false;}},0);
  }

  inertia(c){
    if(!StudioMotion.enabled()||c.samples.length<2)return;const first=c.samples[0],last=c.samples.at(-1),elapsed=last.time-first.time;if(elapsed<10||performance.now()-last.time>110)return;
    let vx=Math.max(-1.5,Math.min(1.5,(last.x-first.x)/elapsed)),vy=Math.max(-1.5,Math.min(1.5,(last.y-first.y)/elapsed));if(Math.hypot(vx,vy)<.12)return;
    const w=this.windows,panel=w.api.getPanel(c.ids[0]),element=panel?.group.element.closest('.dv-resize-container');if(!element)return;const host=w.host.getBoundingClientRect(),box=element.getBoundingClientRect();let x=box.x-host.x,y=box.y-host.y,previous=performance.now(),active=true;
    const stop=()=>{if(!active)return;active=false;this.stopInertia=null;w.endDrag();w.remember(panel);w.changed();};this.stopInertia=stop;w.beginDrag();
    const tick=now=>{if(!active||!element.isConnected)return stop();const dt=Math.min(32,now-previous);previous=now;const nx=Math.max(0,Math.min(host.width-box.width,x+vx*dt)),ny=Math.max(0,Math.min(host.height-box.height,y+vy*dt));if(nx===x)vx=0;if(ny===y)vy=0;x=nx;y=ny;const decay=Math.exp(-dt/125);vx*=decay;vy*=decay;element.dispatchEvent(new CustomEvent('studio-set-bounds',{detail:{left:x,top:y}}));NativeEditing.queueLayout();if(Math.hypot(vx,vy)>.025)requestAnimationFrame(tick);else stop();};requestAnimationFrame(tick);
  }
  clear(){clearTimeout(this.ctx?.intentTimer);this.layer?.remove();this.layer=null;this.previewElement=null;this.dismissHint=null;this.ctx=null;NativeEditing.queueLayout();}
  cancel(){if(this.ctx){const c=this.ctx;this.clear();if(c.live||c.hadDock)setTimeout(()=>this.windows.animateLayout(()=>this.windows.applyLayout(c.layout)),0);}}
}
