// Webviews live above dock parts. Their bounds must follow the actual visible
// anchor, including tab changes, floating groups and native page zoom.
const bindings=new WeakMap();
export function bindNativeOverlay(layout,anchor,clip){
 bindings.get(layout)?.dispose();let frame=0,disposed=false;
 const put=(style,key,value)=>{if(style[key]!==value)style[key]=value;};
 const update=()=>{frame=0;if(disposed)return;const box=anchor.getBoundingClientRect(),visible=anchor.isConnected&&box.width>0&&box.height>0&&anchor.checkVisibility({visibilityProperty:true})&&!anchor.closest('.studio-codeoss-parking,[inert]')&&box.right>0&&box.bottom>0&&box.left<innerWidth&&box.top<innerHeight;
  const content=layout.content,root=layout.root;put(content.style,'display',visible?'':'none');if(!visible)return;
  for(const[key,value]of Object.entries({position:'fixed',top:box.top+'px',left:box.left+'px',width:box.width+'px',height:box.height+'px'}))put(content.style,key,value);
  content.style.removeProperty('position-anchor');root.style.removeProperty('position-anchor');for(const[key,value]of Object.entries({position:'fixed',top:'0px',left:'0px',right:'0px',bottom:'0px',width:'auto',height:'auto'}))put(root.style,key,value);
  const bounds=clip?.getBoundingClientRect();put(root.style,'clipPath',bounds?`inset(${Math.max(0,bounds.top)}px ${Math.max(0,innerWidth-bounds.right)}px ${Math.max(0,innerHeight-bounds.bottom)}px ${Math.max(0,bounds.left)}px)`:'');
 };
 const queue=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(update);},resize=new ResizeObserver(queue);resize.observe(anchor);if(clip)resize.observe(clip);
 const changes=new MutationObserver(records=>{if(records.some(r=>!layout.root.contains(r.target)))queue();});changes.observe(document.documentElement,{attributes:true,attributeFilter:['style','class','inert'],subtree:true});window.addEventListener('resize',queue);document.addEventListener('scroll',queue,true);document.addEventListener('studio:dock-layout',queue);update();
 const binding={dispose(){disposed=true;cancelAnimationFrame(frame);resize.disconnect();changes.disconnect();window.removeEventListener('resize',queue);document.removeEventListener('scroll',queue,true);document.removeEventListener('studio:dock-layout',queue);}};bindings.set(layout,binding);
}
export function disposeNativeOverlay(layout){bindings.get(layout)?.dispose();bindings.delete(layout);}
