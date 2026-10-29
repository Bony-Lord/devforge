'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {canonical,inside,atomic,exists}=require('./workspace.cjs');
const {capture}=require('./tooling.cjs');
class PythonRuntimes {
 constructor(host){this.host=host;this.root=path.join(host.ws.data,'python-runtimes');this.catalog=require(require('./assets.cjs').ui+'/addons/python-runtimes.json');this.jobs=new Map();this.controllers=new Map();}
 entry(id){const record=this.catalog.find(r=>r.id===id&&r.platform===process.platform&&r.arch===process.arch);if(!record)throw Error('Python runtime is not available for this platform and architecture');return record;}
 directory(id){this.entry(id);return path.join(this.root,id);}
 executable(id){return path.join(this.directory(id),'python',process.platform==='win32'?'python.exe':'bin/python3');}
 async info(){const result=[];for(const record of this.catalog.filter(r=>r.platform===process.platform&&r.arch===process.arch))result.push({...record,installed:await exists(this.executable(record.id)),executable:this.executable(record.id),name:'CPython '+record.version});return result;}
 async candidates(){return(await this.info()).filter(r=>r.installed).map(r=>r.executable);}
 install(id){if(this.jobs.has(id))return this.jobs.get(id);const controller=new AbortController();this.controllers.set(id,controller);const task=this.installNow(id,controller.signal).finally(()=>{this.jobs.delete(id);this.controllers.delete(id);});this.jobs.set(id,task);return task;}
 cancel(){for(const controller of this.controllers.values())controller.abort();return true;}
 async installNow(id,signal){
  const record=this.entry(id),destination=this.directory(id);if(await exists(this.executable(id)))return this.info();await fs.mkdir(this.root,{recursive:true});const staging=await fs.mkdtemp(path.join(this.root,'.install-')),archive=path.join(staging,'runtime.tar.gz'),content=path.join(staging,'content');
  try{
   const response=await fetch(record.url,{signal:AbortSignal.any([signal,AbortSignal.timeout(180000)])});if(!response.ok||new URL(response.url).protocol!=='https:')throw Error('Python download failed: '+response.status);let size=0;const hash=crypto.createHash('sha256'),handle=await fs.open(archive,'wx');
   try{for await(const bytes of response.body){size+=bytes.length;if(size>record.bytes)throw Error('Python runtime exceeds pinned size');hash.update(bytes);await handle.writeFile(bytes);this.host.event('runtimeProgress',{id,bytes:size,total:record.bytes});}}finally{await handle.close();}
   if(size!==record.bytes||hash.digest('hex')!==record.sha256)throw Error('Python runtime checksum mismatch');
   const listing=await capture('tar',['-tzf',archive],{timeout:30000,max:8*1024*1024});if(listing.code)throw Error('Cannot inspect Python archive');const names=listing.text.trim().split(/\r?\n/);if(!names.length||names.some(n=>!n.startsWith('python/')||n.split('/').some(p=>p==='..')||n.includes('\\')||n.includes('\0')))throw Error('Unsafe Python archive path');
   await fs.mkdir(content);const extracted=await capture('tar',['-xzf',archive,'-C',content],{timeout:60000});if(extracted.code)throw Error('Cannot extract Python runtime: '+extracted.error);
   // The pinned official archive may contain internal symbolic links. Validate
   // their resolved targets before running any executable or publishing the tree.
   const validate=async folder=>{for(const e of await fs.readdir(folder,{withFileTypes:true})){const file=path.join(folder,e.name);if(e.isSymbolicLink()){if(!inside(await fs.realpath(file),content))throw Error('Python archive link escapes its folder');}else if(e.isDirectory())await validate(file);}};await validate(content);
   const exe=path.join(content,'python',process.platform==='win32'?'python.exe':'bin/python3'),probe=await capture(exe,['-I','-c','import sys,ssl,venv,ensurepip;print(sys.version.split()[0])'],{timeout:15000});if(probe.code||probe.text.trim()!==record.version)throw Error('Python runtime verification failed');
   await atomic(path.join(content,'devforge-runtime.json'),JSON.stringify(record,null,2));await fs.rename(content,destination);this.host.python.environment.cache.clear();return this.info();
  }finally{const checked=await canonical(staging),base=await canonical(this.root);if(checked===base||!inside(checked,base))throw Error('Runtime staging escaped its root');await fs.rm(checked,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
 }
 async remove(id){if(this.jobs.has(id))throw Error('Wait for Python installation');const directory=await canonical(this.directory(id)),base=await canonical(this.root);if(directory===base||!inside(directory,base))throw Error('Runtime folder escaped its root');if(this.host.system.pythonRuntimeInUse?.(directory))throw Error('This Python runtime is in use by another project window');if(this.host.python.busy||this.host.python.kernel||this.host.tools.execution||this.host.pythonIntelligence.child)throw Error('Stop running Python and analysis before removing its runtime');await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});this.host.python.environment.cache.clear();return this.info();}
}
module.exports={PythonRuntimes};
