'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{fileURLToPath}=require('node:url'),JSON5=require('json5');
// Lazy Workspace import keeps this usable by the Workspace class itself.
async function readWorkspace(input){
 const {canonical,key}=require('./workspace.cjs'),file=await canonical(input),stat=await fs.stat(file);
 if(!file.toLowerCase().endsWith('.code-workspace')||!stat.isFile()||stat.size>4*1024*1024)throw Error('Select a .code-workspace file up to 4 MB');
 return parseWorkspace(file,await fs.readFile(file,'utf8'));
}
async function parseWorkspace(file,text){
 const {canonical,key}=require('./workspace.cjs');
 if(typeof text!=='string'||Buffer.byteLength(text)>4*1024*1024)throw Error('Invalid workspace contents');
 const data=JSON5.parse(text.replace(/^\uFEFF/,''));
 if(!data||!Array.isArray(data.folders)||data.folders.length>256)throw Error('Invalid workspace folders');
 const folders=[],seen=new Set();
 for(const entry of data.folders){
  if(!entry||typeof entry!=='object'||typeof entry.path!=='string'&&typeof entry.uri!=='string')throw Error('Invalid workspace folder');
  const value=typeof entry.path==='string'?path.resolve(path.dirname(file),entry.path):fileURLToPath(entry.uri);
  const root=await canonical(value),identity=key(root);if(seen.has(identity))continue;
  const info=await fs.stat(root).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(info&&!info.isDirectory())throw Error('Workspace folder is not a directory: '+root);
  if(entry.name!==undefined&&(typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>256))throw Error('Invalid workspace folder name');
  seen.add(identity);folders.push({path:root,name:entry.name||path.basename(root),missing:!info});
 }
 return{file,folders};
}
async function normalizeFolders(entries){
 const {canonical,key}=require('./workspace.cjs');if(!Array.isArray(entries)||entries.length>256)throw Error('Invalid workspace folders');
 const result=[],seen=new Set();for(const entry of entries){
  if(!entry||typeof entry.path!=='string'||!path.isAbsolute(entry.path)||entry.name!==undefined&&(typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>256))throw Error('Invalid workspace folder');
  const root=await canonical(entry.path),identity=key(root);if(seen.has(identity))continue;
  const stat=await fs.stat(root).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(stat&&!stat.isDirectory())throw Error('Workspace folder is not a directory: '+root);
  seen.add(identity);result.push({path:root,name:entry.name||path.basename(root),missing:!stat});
 }return result;
}
function projectRoots(project){return project?.workspaceFile?(project.workspaceFolders||[]).map(f=>f.path):project?.path?[project.path]:[];}
function projectsOverlap(first,second){
 const {inside,key}=require('./workspace.cjs');if(!first||!second)return false;
 if(first.workspaceFile&&second.workspaceFile&&key(first.workspaceFile)===key(second.workspaceFile))return true;
 if(first.workspaceFile&&projectRoots(second).some(root=>inside(first.workspaceFile,root))||second.workspaceFile&&projectRoots(first).some(root=>inside(second.workspaceFile,root)))return true;
 return projectRoots(first).some(a=>projectRoots(second).some(b=>inside(a,b)||inside(b,a)));
}
module.exports={readWorkspace,parseWorkspace,normalizeFolders,projectRoots,projectsOverlap};
