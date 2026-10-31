'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {atomic,inside}=require('./workspace.cjs');
class CodeOSSUserData{
 constructor(data,event=()=>{}){this.data=path.resolve(data);this.root=path.resolve(data,'codeoss','userdata');this.event=event;this.tail=Promise.resolve();}
 async resolve(value,{root=false}={}){if(typeof value!=='string'||value.includes('\0')||value.split(/[\\/]/).some(s=>s==='..'||/[<>:"|?*\x00-\x1f]/.test(s)))throw Error('Invalid extension profile path');const target=path.resolve(this.root,'.'+(value.startsWith('/')?value:'/'+value));if(!inside(target,this.root)||!root&&target===this.root)throw Error('Extension profile path escapes storage');let current=this.root;for(const part of path.relative(this.root,target).split(path.sep).filter(Boolean)){current=path.join(current,part);try{if((await fs.lstat(current)).isSymbolicLink())throw Error('Extension profile links are not followed');}catch(e){if(e.code!=='ENOENT')throw e;}}return target;}
 handle(d){const task=this.tail.catch(()=>{}).then(()=>this.perform(d));this.tail=task;return task;}
 async perform(d){try{
  this.root=await require('./codeoss-paths.cjs').profileDirectory(this.data,'codeoss','userdata');const file=await this.resolve(d.path,{root:['stat','readdir','mkdir'].includes(d.action)}),type=s=>s.isDirectory()?2:s.isSymbolicLink()?64:1;
  if(d.action==='stat'){const s=await fs.stat(file);return{type:type(s),ctime:s.ctimeMs,mtime:s.mtimeMs,size:s.size};}
  if(d.action==='read'){if((await fs.stat(file)).size>8*1024*1024)throw Error('Extension settings file exceeds 8 MiB');return(await fs.readFile(file)).toString('base64');}
  if(d.action==='readdir'){const list=await fs.readdir(file,{withFileTypes:true});return list.map(s=>[s.name,type(s)]);}
  if(d.action==='mkdir')await fs.mkdir(file,{recursive:true});
  else if(d.action==='write'){if(typeof d.bytes!=='string'||d.bytes.length>12*1024*1024)throw Error('Invalid extension settings bytes');const exists=await fs.stat(file).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});if(exists&&!d.options?.overwrite)throw Object.assign(Error('Profile file already exists'),{code:'EEXIST'});if(!exists&&!d.options?.create)throw Object.assign(Error('Profile file not found'),{code:'ENOENT'});await atomic(file,Buffer.from(d.bytes,'base64'));}
  else if(d.action==='delete'){const verified=await this.resolve(d.path);if(verified===this.root||!inside(verified,this.root))throw Error('Invalid profile delete target');await fs.rm(verified,{recursive:!!d.options?.recursive,force:false});}
  else if(d.action==='rename'){const destination=await this.resolve(d.to);if(await fs.stat(destination).then(()=>true,()=>false)){if(!d.options?.overwrite)throw Object.assign(Error('Profile destination exists'),{code:'EEXIST'});if((await fs.stat(destination)).isDirectory())throw Error('A profile directory cannot replace another directory');}await fs.rename(file,destination);this.event({path:d.to,type:1});}
  else throw Error('Unknown extension profile operation');this.event({path:d.path,type:d.action==='delete'?2:0});return true;
 }catch(error){throw Error((error.code||'EUNKNOWN')+': '+error.message);}}
}
module.exports={CodeOSSUserData};
