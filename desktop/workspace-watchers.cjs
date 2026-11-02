'use strict';
const fs=require('node:fs'),path=require('node:path'),{ProjectWatcher}=require('./project-watcher.cjs');
class WorkspaceWatchers{
 constructor(changed){this.changed=changed;this.roots=new Map();}
 watch(input){
  const folders=typeof input==='string'?(input?[input]:[]):input?.folders||[],workspaceFile=typeof input==='object'?input.workspaceFile||'':'';
  const wanted=new Set(folders.map(root=>path.resolve(root)));
  for(const [root,watcher]of this.roots)if(!wanted.has(root)){watcher.close();this.roots.delete(root);}
  for(const root of wanted){let watcher=this.roots.get(root);if(!watcher){watcher=new ProjectWatcher(this.changed);this.roots.set(root,watcher);}if(watcher.root!==root)watcher.watch(root);}
  if(workspaceFile===this.workspaceFile)return;
  this.configuration?.close();this.configuration=null;clearTimeout(this.timer);this.workspaceFile=workspaceFile;
  if(workspaceFile)try{this.configuration=fs.watch(path.dirname(workspaceFile),(event,name)=>{if(name&&String(name).toLowerCase()!==path.basename(workspaceFile).toLowerCase())return;clearTimeout(this.timer);this.timer=setTimeout(()=>this.changed({root:path.dirname(workspaceFile).replaceAll('\\','/'),workspaceFile,files:[workspaceFile]}),350);this.timer.unref?.();});this.configuration.on('error',()=>{this.configuration?.close();this.configuration=null;this.workspaceFile='';});this.configuration.unref?.();}catch{this.workspaceFile='';}
 }
 close(){for(const watcher of this.roots.values())watcher.close();this.roots.clear();this.configuration?.close();this.configuration=null;this.workspaceFile='';clearTimeout(this.timer);}
}
module.exports={WorkspaceWatchers};
