'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const {profileDirectory}=require('./codeoss-paths.cjs'),{atomic,inside}=require('./workspace.cjs');
async function treeSize(directory){
 let info;try{info=await fs.lstat(directory);}catch(error){if(error.code==='ENOENT')return 0;throw error;}
 if(info.isSymbolicLink())throw Error('Workspace storage transfer cannot follow links');
 if(info.isFile())return info.size;if(!info.isDirectory())throw Error('Unsupported workspace storage entry');
 let bytes=0;for(const name of await fs.readdir(directory))bytes+=await treeSize(path.join(directory,name));return bytes;
}
async function waitUnlocked(directory){
 const deadline=Date.now()+20000,file=path.join(directory,'vscode.lock');
 while(true){let owner;try{owner=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return;throw error;}
  if(!Number.isInteger(owner.pid)||owner.pid<=0)throw Error('Invalid workspace storage lock');
  try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')return;throw error;}
  if(Date.now()>=deadline)throw Error('Workspace storage is still in use. Close the other window and try again.');
  await new Promise(resolve=>setTimeout(resolve,100));
 }
}
async function locations(store,{fromId,toId}){
 if(![fromId,toId].every(id=>typeof id==='string'&&/^devforge-(?:empty|-?[a-f0-9]{1,16})$/.test(id)))throw Error('Invalid workspace storage identity');
 if(fromId===toId)throw Error('Workspace storage identities collide');
 const home=await profileDirectory(store.data,'codeoss','user','User','workspaceStorage');return{home,sourceDirectory:path.join(home,fromId),targetDirectory:path.join(home,toId)};
}
module.exports=async function transfer(store,{from,to,fromId,toId,fromScope,toScope}){
 const scope=value=>'workspace:'+(value?value.replaceAll('\\','/').toLowerCase():'empty'),sourceScope=fromScope||scope(from),targetScope=toScope||scope(to);
 if(typeof sourceScope!=='string'||typeof targetScope!=='string'||scope(sourceScope.slice(10))!==scope(from)||scope(targetScope.slice(10))!==scope(to)||!sourceScope.startsWith('workspace:')||!targetScope.startsWith('workspace:'))throw Error('Invalid workspace storage scope');
 const source=await store.perform({scope:sourceScope,action:'read'}),previous=await store.perform({scope:targetScope,action:'read'}),sourceKeys=new Set(source.map(([key])=>key)),previousKeys=new Set(previous.map(([key])=>key));
 const {home,sourceDirectory,targetDirectory}=await locations(store,{fromId,toId});
 const [sourceBytes,targetBytes]=await Promise.all([treeSize(sourceDirectory),treeSize(targetDirectory)]),space=await fs.statfs(home);
 if(sourceBytes+targetBytes+4*1024*1024>space.bavail*space.bsize)throw Error('Not enough disk space to preserve extension workspace storage');
 const backup=await profileDirectory(store.data,'codeoss','workspace-transfer-backups',crypto.randomUUID()),prepared=path.join(backup,'prepared'),saved=path.join(backup,'files');
 if(previous.length||targetBytes)await atomic(path.join(backup,'state.json'),JSON.stringify({scope:targetScope,items:previous}));
 const boundary=await fs.realpath(store.data),move=async(from,to)=>{const [real,parent]=await Promise.all([fs.realpath(from),fs.realpath(path.dirname(to))]);if(!inside(real,boundary)||!inside(parent,boundary))throw Error('Workspace storage move escaped its profile');await fs.rename(real,to);};
 let replaced=false,hadTarget=false;
 const restore=async perform=>{
  if(replaced){await move(targetDirectory,path.join(backup,'aborted-files'));replaced=false;}
  if(hadTarget){await move(saved,targetDirectory);hadTarget=false;}
  const now=await perform({scope:targetScope,action:'read'});await perform({scope:targetScope,insert:previous,delete:now.map(([key])=>key).filter(key=>!previousKeys.has(key))});
 };
 try{
  // Prepare the merged directory before changing either live destination. Old
  // destination files are retained separately and can be restored on failure.
  if(sourceBytes||targetBytes){await fs.mkdir(prepared);if(targetBytes)await fs.cp(targetDirectory,prepared,{recursive:true,filter:file=>file!==path.join(targetDirectory,'vscode.lock')});if(sourceBytes)await fs.cp(sourceDirectory,prepared,{recursive:true,force:true,filter:file=>file!==path.join(sourceDirectory,'vscode.lock')});
   const meta=path.join(prepared,'meta.json');try{const value=JSON.parse(await fs.readFile(meta,'utf8'));await atomic(meta,JSON.stringify({...value,id:toId,configuration:pathToFileURL(to).toString()},null,2));}catch(error){if(error.code!=='ENOENT')throw error;}
   await treeSize(prepared);if(await fs.stat(targetDirectory).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;})){await move(targetDirectory,saved);hadTarget=true;}await move(prepared,targetDirectory);replaced=true;
  }
  await store.perform({scope:targetScope,insert:source,delete:previous.map(([key])=>key).filter(key=>!sourceKeys.has(key))});
 }catch(error){await restore(d=>store.perform(d));throw error;}
 return()=>{const task=store.tail.catch(()=>{}).then(()=>restore(d=>store.perform(d)));store.tail=task;return task;};
};
module.exports.waitForLocks=async(store,identities)=>{const {sourceDirectory,targetDirectory}=await locations(store,identities);await Promise.all([waitUnlocked(sourceDirectory),waitUnlocked(targetDirectory)]);};
