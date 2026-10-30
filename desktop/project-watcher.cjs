'use strict';
const fs=require('node:fs'),path=require('node:path');
class ProjectWatcher {
 constructor(changed){this.changed=changed;this.root='';}
 watch(root){
  root=root?path.resolve(root):'';if(root===this.root)return;this.close();if(!root)return;
  this.root=root;
  try{this.watcher=fs.watch(root,{recursive:true},(event,name)=>{const parts=String(name||'').split(/[\\/]/);if(parts.some(p=>['.git','.forge','node_modules','build','.cache','__pycache__'].includes(p)||p.startsWith('cmake-build-')))return;this.pending??=new Set();if(name&&this.pending.size<256)this.pending.add(path.join(root,String(name)).replaceAll('\\','/'));clearTimeout(this.timer);this.timer=setTimeout(()=>{const files=[...this.pending];this.pending.clear();if(this.root===root)this.changed({root:root.replaceAll('\\','/'),files});},350);this.timer.unref?.();});this.watcher.unref?.();this.watcher.on('error',()=>this.close());}catch{this.close();}
 }
 close(){clearTimeout(this.timer);this.pending?.clear();this.watcher?.close();this.watcher=null;this.root='';}
}
module.exports={ProjectWatcher};
