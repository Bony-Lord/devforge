'use strict';
class StudioOutputBuffer {
  constructor(element,{limit=1100000,frame=fn=>requestAnimationFrame(fn),timer=(fn,delay)=>setTimeout(fn,delay),cancelTimer=id=>clearTimeout(id)}={}){this.element=element;this.limit=limit;this.frame=frame;this.timer=timer;this.cancelTimer=cancelTimer;this.pending=[];this.pendingLength=0;this.renderedLength=0;this.first=null;this.last=null;this.token=0;this.scheduled=false;}
  append(text,kind=''){
    text=String(text);if(!text)return;if(text.length>this.limit)text=text.slice(-this.limit);
    const last=this.pending.at(-1);if(last&&last.kind===kind&&last.text.length+text.length<=65536)last.text+=text;else this.pending.push({text,kind});this.pendingLength+=text.length;
    while(this.pendingLength>this.limit&&this.pending.length){const first=this.pending[0],over=this.pendingLength-this.limit;if(first.text.length<=over){this.pendingLength-=first.text.length;this.pending.shift();}else{first.text=first.text.slice(over);this.pendingLength-=over;}}
    while(this.pending.length>512)this.pendingLength-=this.pending.shift().text.length;
    if(!this.scheduled){this.scheduled=true;const token=++this.token,flush=()=>{if(this.scheduled&&this.token===token)this.flush();};this.frame(flush);this.timeout=this.timer(flush,200);}
  }
  flush(){
    this.scheduled=false;this.token++;this.cancelTimer(this.timeout);const el=this.element();if(!el){this.pending=[];this.pendingLength=0;return;}
    if(el.firstChild!==this.first||el.lastChild!==this.last){this.renderedLength=0;for(const child of el.childNodes){child.studioOutputLength=child.textContent.length;this.renderedLength+=child.studioOutputLength;}}
    if(!this.pending.length){this.first=el.firstChild;this.last=el.lastChild;return;}
    const follow=el.scrollHeight-el.scrollTop-el.clientHeight<70;
    while(el.firstChild&&this.renderedLength+this.pendingLength>this.limit){const child=el.firstChild,length=child.studioOutputLength??child.textContent.length;this.renderedLength-=length;child.remove();}
    const fragment=el.ownerDocument.createDocumentFragment();for(const chunk of this.pending){const span=el.ownerDocument.createElement('span');span.className=chunk.kind;span.textContent=chunk.text;span.studioOutputLength=chunk.text.length;fragment.append(span);this.renderedLength+=chunk.text.length;}
    this.pending=[];this.pendingLength=0;el.append(fragment);this.first=el.firstChild;this.last=el.lastChild;if(follow)el.scrollTop=el.scrollHeight;
  }
  clear(){this.scheduled=false;this.token++;this.cancelTimer(this.timeout);this.pending=[];this.pendingLength=this.renderedLength=0;this.first=this.last=null;this.element()?.replaceChildren();}
}
if(typeof module!=='undefined')module.exports=StudioOutputBuffer;
