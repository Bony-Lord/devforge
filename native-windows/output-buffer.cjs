'use strict';
class OutputBuffer {
 constructor(send){this.send=send;this.items=new Map();this.timer=null;}
 push(window,data){const key=window+'\0'+data.id+'\0'+data.stream,entry=this.items.get(key)||{window,data:{...data,text:''}};entry.data.text+=String(data.text||'');if(entry.data.text.length>131072)entry.data.text='\n[Earlier output truncated]\n'+entry.data.text.slice(-98304);this.items.set(key,entry);if(!this.timer){this.timer=setTimeout(()=>this.flush(),40);this.timer.unref();}}
 flush(){clearTimeout(this.timer);this.timer=null;const items=[...this.items.values()];this.items.clear();for(const item of items)this.send({event:'output',window:item.window,data:item.data});}
}
module.exports={OutputBuffer};
