(()=>{
 'use strict';
 // Product-independent heuristics. These produce review candidates, not an
 // assertion that every overlap, deliberate ellipsis or low contrast is a bug.
 const visible=e=>{if(!e?.checkVisibility({visibilityProperty:true,contentVisibilityAuto:true}))return false;const r=e.getBoundingClientRect();return r.width>1&&r.height>1&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth;};
 const name=e=>(e.getAttribute('aria-label')||e.title||e.innerText||e.getAttribute('placeholder')||'').trim().replace(/\s+/g,' ').slice(0,160);
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
 const selector=e=>{if(e.id)return'#'+CSS.escape(e.id);const role=e.getAttribute('role'),aria=e.getAttribute('aria-label');if(aria)return e.tagName.toLowerCase()+'[aria-label='+JSON.stringify(aria)+']';if(role)return'[role='+JSON.stringify(role)+']';const parent=e.parentElement;return(parent?.id?'#'+CSS.escape(parent.id)+' > ':'')+e.tagName.toLowerCase()+[...e.classList].slice(0,2).map(v=>'.'+CSS.escape(v)).join('');};
 function inspect(){
  const issues=[],push=(kind,e,detail)=>{if(issues.length<50)issues.push({kind,selector:selector(e),label:name(e),rect:rect(e),detail});};
  const modals=[...document.querySelectorAll('dialog[open],[popover]:popover-open,[role=menu],.monaco-dialog-modal-block')].filter(visible),scope=modals.at(-1)||document;
  const controls=[...scope.querySelectorAll('button,input:not([type=hidden]),select,textarea,[role=button],[role=tab]')].filter(visible).filter(e=>!e.closest('.monaco-editor,.xterm,.view-lines')).slice(0,240);
  for(const element of controls){const r=element.getBoundingClientRect(),style=getComputedStyle(element);if(element.disabled||style.pointerEvents==='none')continue;
   let clip={left:0,top:0,right:innerWidth,bottom:innerHeight},scrolled=false;
   for(let p=element.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(s.visibility==='hidden'||p.inert){clip.right=clip.left;break;}if(/auto|scroll/.test(s.overflowX+s.overflowY))scrolled=true;if(/hidden|clip|auto|scroll/.test(s.overflowX)){clip.left=Math.max(clip.left,b.left);clip.right=Math.min(clip.right,b.right);}if(/hidden|clip|auto|scroll/.test(s.overflowY)){clip.top=Math.max(clip.top,b.top);clip.bottom=Math.min(clip.bottom,b.bottom);}}
   const width=Math.max(0,Math.min(r.right,clip.right)-Math.max(r.left,clip.left)),height=Math.max(0,Math.min(r.bottom,clip.bottom)-Math.max(r.top,clip.top));
   if(!scrolled&&(width<r.width-3||height<r.height-3)&&width*height>0)push('control-clipped',element,{visibleWidth:width,visibleHeight:height,scrollContainer:scrolled});
   // A clipped or scrolled-away center is not an overlap. Test only a center
   // that the element's own clipping ancestors actually expose to the user.
   const x=r.left+r.width/2,y=r.top+r.height/2,centerExposed=x>=clip.left&&x<=clip.right&&y>=clip.top&&y<=clip.bottom;
   if(!scrolled&&centerExposed&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&r.width>12&&r.height>12){const hit=document.elementFromPoint(x,y);if(hit&&!element.contains(hit)&&!hit.contains(element)&&!hit.closest('[data-soak-overlay]'))push('control-covered',element,{cover:selector(hit),coverLabel:name(hit)});}
   if(element.matches('button,[role=button],label')&&element.scrollWidth>element.clientWidth+4&&style.textOverflow!=='ellipsis'&&!element.title&&style.overflow!=='visible')push('text-clipped',element,{scrollWidth:element.scrollWidth,clientWidth:element.clientWidth});
  }
  for(const e of [...scope.querySelectorAll('svg')].filter(visible).slice(0,180)){
   if(e.closest('.monaco-editor,.xterm,[data-soak-overlay]'))continue;const box=e.viewBox?.baseVal;if(!box||!box.width||!box.height)continue;try{const ink=e.getBBox(),stroke=Math.max(0,...[...e.querySelectorAll('path,line,polyline,circle,rect')].slice(0,20).map(p=>Number.parseFloat(getComputedStyle(p).strokeWidth)||0))/2;if(ink.width>0&&ink.height>0&&(ink.x-stroke<box.x-1.5||ink.y-stroke<box.y-1.5||ink.x+ink.width+stroke>box.x+box.width+1.5||ink.y+ink.height+stroke>box.y+box.height+1.5))push('svg-outside-viewbox',e,{viewBox:{x:box.x,y:box.y,width:box.width,height:box.height},ink:{x:ink.x,y:ink.y,width:ink.width,height:ink.height},stroke});}catch{}
  }
  for(const e of modals){const r=e.getBoundingClientRect();if(e.scrollWidth>e.clientWidth+3&&innerWidth-r.width>80)push('popup-horizontal-scroll',e,{available:innerWidth,width:r.width,scrollWidth:e.scrollWidth});if(r.left<-2||r.top<-2||r.right>innerWidth+2||r.bottom>innerHeight+2)push('popup-outside-screen',e,{viewport:{width:innerWidth,height:innerHeight}});}
  return{schema:1,viewport:{width:innerWidth,height:innerHeight},inspected:controls.length,issues};
 }
 function overlay(issues){document.querySelector('[data-soak-overlay]')?.remove();const layer=document.createElement('div');layer.dataset.soakOverlay='';layer.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483647';for(const [index,issue]of issues.slice(0,12).entries()){const r=issue.rect,box=document.createElement('div');box.style.cssText=`position:absolute;left:${Math.max(0,r.x)}px;top:${Math.max(0,r.y)}px;width:${Math.max(1,r.width)}px;height:${Math.max(1,r.height)}px;outline:2px solid #ff5672;background:#ff567218;color:white;font:11px monospace;`;const label=document.createElement('span');label.textContent=(index+1)+' '+issue.kind;label.style.cssText='position:absolute;top:-14px;left:0;background:#9b1634;white-space:nowrap';box.append(label);layer.append(box);}([ ...document.querySelectorAll('dialog[open],[popover]:popover-open') ].filter(visible).at(-1)||document.body).append(layer);}
 globalThis.__devforgeVisual={inspect,overlay,clear:()=>document.querySelector('[data-soak-overlay]')?.remove()};return{schema:1};
})()
