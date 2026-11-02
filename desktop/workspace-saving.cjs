'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {canonical,key,portable,atomic,decode}=require('./workspace.cjs');
const {parseWorkspace}=require('./workspace-descriptor.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function contents(file){try{const stat=await fs.stat(file);if(!stat.isFile()||stat.size>4*1024*1024)throw Error('Select a workspace file up to 4 MB');return await fs.readFile(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function snapshot(ws){
 ws.assertEditable();const source=ws.workspaceFile,bytes=source?await contents(source):null;
 if(source&&!bytes)throw Error('Workspace configuration no longer exists');
 return{project:ws.prefs.current,source,root:ws.prefs.current?ws.root:'',hash:bytes?hash(bytes):null,text:bytes?decode(bytes).text:null};
}
async function target(input){
 if(typeof input!=='string'||!path.isAbsolute(input))throw Error('Invalid workspace filename');
 const file=await canonical(input.toLowerCase().endsWith('.code-workspace')?input:input+'.code-workspace'),bytes=await contents(file);
 return{path:file,hash:bytes?hash(bytes):null};
}
async function save(ws,d,{inUse=()=>false,transfer=async()=>{}}={}){
 ws.assertEditable();if(d.project!==ws.prefs.current||d.source!==ws.workspaceFile)throw Error('Workspace changed');
 const current=await snapshot(ws);if(current.hash!==d.sourceHash)throw Error('Workspace configuration changed outside the editor');
 if(typeof d.file!=='string'||!path.isAbsolute(d.file)||!d.file.toLowerCase().endsWith('.code-workspace'))throw Error('Invalid workspace filename');
 const file=await canonical(d.file);if(current.source&&key(file)===key(current.source))throw Error('Use Save for the current workspace file');
 const previous=ws.prefs.projects[ws.prefs.current];
 if(Object.entries(ws.prefs.projects).some(([id,p])=>id!==ws.prefs.current&&p.workspaceFile&&key(p.workspaceFile)===key(file)))throw Error('The destination belongs to another registered workspace');
 const descriptor=await parseWorkspace(file,d.text);if(inUse(descriptor))throw Error('PROJECT_IN_USE: The destination is being edited in another window');
 const oldTarget=await contents(file);if((oldTarget?hash(oldTarget):null)!==(d.targetHash??null))throw Error('Workspace destination changed or already exists. Choose it again to confirm replacement.');
 const id=ws.prefs.current||crypto.randomUUID(),oldCurrent=ws.prefs.current,cleared=ws.prefs.projectSelectionCleared;
 // The caller stops the old extension host and flushes its storage first. Copy
 // storage before exposing the new workspace identity to this or other windows.
 const rollback=await transfer({from:current.source||current.root,to:file});let written=false;
 try{
 ws.assertEditable();if(d.project!==ws.prefs.current||d.source!==ws.workspaceFile)throw Error('Workspace changed during saving');if(inUse(descriptor))throw Error('PROJECT_IN_USE: The destination is being edited in another window');
 if(current.source){const latestSource=await contents(current.source);if(!latestSource||hash(latestSource)!==current.hash)throw Error('Workspace configuration changed during saving');}
 const latest=await contents(file);if((latest?hash(latest):null)!==(oldTarget?hash(oldTarget):null))throw Error('Workspace destination changed during saving');
 await fs.mkdir(path.dirname(file),{recursive:true});if(oldTarget)await atomic(file,d.text);else await fs.writeFile(file,d.text,{flag:'wx'});written=true;
 if(d.project!==ws.prefs.current||d.source!==ws.workspaceFile)throw Error('Workspace changed during saving');
 ws.prefs.projects[id]={...previous,path:previous?.path||portable(path.dirname(file)),label:previous?.label||path.basename(file,'.code-workspace'),workspaceFile:file,workspaceFolders:descriptor.folders,managedWorkspace:true};ws.prefs.current=id;ws.prefs.projectSelectionCleared=false;
 try{await ws.persist();}catch(error){
  if(previous)ws.prefs.projects[id]=previous;else delete ws.prefs.projects[id];if(ws.prefs.current===id){ws.prefs.current=oldCurrent;ws.prefs.projectSelectionCleared=cleared;}
  throw error;
 }
 }catch(error){
  // Keep a new copy for recovery. Restore an overwritten destination only while
  // it still matches this operation, never over an external editor's changes.
  if(written&&oldTarget){const bytes=await contents(file);if(bytes&&hash(bytes)===hash(Buffer.from(d.text)))await atomic(file,oldTarget);}
  await rollback?.();throw error;
 }
 // A destination may already be open as a clean document. Its next native save
 // must compare against the bytes just committed, rather than its old snapshot.
 ws.readState.set(file,{hash:hash(Buffer.from(d.text)),bom:false});ws.prefs.encodings[file]='UTF-8';
 return{project:id,workspaceFile:file};
}
module.exports={snapshot,target,save};
