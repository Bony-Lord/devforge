'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
// DevForge currently ships Russian and English UI. Trim only Chromium's other
// translations, inside the newly created package; preserve notices and code.
async function trimLocales(directory){
  const root=await fs.realpath(directory),removed=[];
  async function walk(folder){for(const entry of await fs.readdir(folder,{withFileTypes:true})){
    if(entry.isSymbolicLink())continue;const file=path.join(folder,entry.name),locale=entry.isFile()&&path.basename(folder)==='locales'&&entry.name.endsWith('.pak')||entry.isDirectory()&&entry.name.endsWith('.lproj');
    if(locale&&!/^(?:en(?:[-_][A-Za-z]+)?|ru)(?:\.pak|\.lproj)$/.test(entry.name)){
      const resolved=await fs.realpath(file),relative=path.relative(root,resolved);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Package path escaped output');
      if(entry.isDirectory()){const size=await sizeOf(file);await fs.rm(file,{recursive:true});removed.push({path:relative,bytes:size});}
      else{const size=(await fs.stat(file)).size;await fs.unlink(file);removed.push({path:relative,bytes:size});}
    }else if(entry.isDirectory())await walk(file);
  }}
  async function sizeOf(folder){let bytes=0;for(const entry of await fs.readdir(folder,{withFileTypes:true})){if(entry.isSymbolicLink())continue;const file=path.join(folder,entry.name);bytes+=entry.isDirectory()?await sizeOf(file):(await fs.stat(file)).size;}return bytes;}
  await walk(root);return {removed,bytes:removed.reduce((n,f)=>n+f.bytes,0)};
}
async function assertCoreContents(directory){
  async function walk(folder){for(const entry of await fs.readdir(folder,{withFileTypes:true})){
    const file=path.join(folder,entry.name);
    if(entry.name==='__pycache__'||/\.(?:pyc|whl|jks)$/i.test(entry.name))throw Error('Unexpected cache, downloaded tool or private key in core package: '+path.relative(directory,file));
    if(entry.isDirectory()&&!entry.isSymbolicLink())await walk(file);
  }}
  await walk(directory);
}
module.exports={trimLocales,assertCoreContents};
