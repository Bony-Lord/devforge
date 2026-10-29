'use strict';
const fs=require('node:fs'),path=require('node:path');
class ProjectWatcher {
 constructor(changed){this.changed=changed;this.root='';}
 watch(root){
  root=root?path.resolve(root):'';if(root===this.root)return;this.close();if(!root)return;
  this.root=root;
  try{this.watcher=fs.watch(root,{recursive:true},(event,name)=>{if(event!=='rename')return;const parts=String(name||'').split(/[\\/]/);if(parts.length>1&&parts.some(p=>['.git','node_modules','build','.cache'].includes(p)||p.startsWith('cmake-build-')))return;clearTimeout(this.timer);this.timer=setTimeout(()=>{if(this.root===root)this.changed({root:root.replaceAll('\\','/')});},350);this.timer.unref?.();});this.watcher.unref?.();this.watcher.on('error',()=>this.close());}catch{this.close();}
 }
 close(){clearTimeout(this.timer);this.watcher?.close();this.watcher=null;this.root='';}
}
module.exports={ProjectWatcher};
