'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{fork}=require('node:child_process');
const {atomic,exists,inside}=require('./workspace.cjs');
class VSCodeRuntime {
 constructor(host){this.host=host;this.pending=new Map();this.sequence=0;this.active=new Set();this.queue=Promise.resolve();}
 get storage(){return path.join(this.host.ws.data,'vsix-bundles');}
 async prepare(bytes){
  const {archive,convert}=require('./vsix.cjs'),read=archive(bytes),hash=crypto.createHash('sha256').update(bytes).digest('hex'),pkg=convert(bytes,{bundle:hash}),folder=path.join(this.storage,hash),seen=new Set();
  await fs.mkdir(this.storage,{recursive:true});if((await fs.lstat(this.storage)).isSymbolicLink())throw Error('VSIX storage cannot be a link');
  if(!await exists(path.join(folder,'ready.json'))){const temp=await fs.mkdtemp(path.join(this.storage,'prepare-'));try{
   for(const[name]of read.entries){if(!name.startsWith('extension/')||name.endsWith('/'))continue;const relative=name.slice(10),parts=relative.split('/');if(parts.some(p=>!p||/[<>:"|?*\x00-\x1f]/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p))||seen.has(relative.toLowerCase()))throw Error('Unsafe Windows VSIX path');seen.add(relative.toLowerCase());const target=path.resolve(temp,relative);if(!inside(target,temp))throw Error('Unsafe VSIX path');await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,read.buffer(name),{flag:'wx'});
   }
   await atomic(path.join(temp,'ready.json'),JSON.stringify({hash,id:pkg.manifest.id,version:pkg.manifest.version,preparedAt:Date.now()}));await fs.rename(temp,folder);
  }catch(error){if(inside(temp,this.storage))await fs.rm(temp,{recursive:true,force:true});throw error;}}
  return pkg;
 }
 authorize(id){const entry=this.host.addons.data.packages.find(e=>e.package.manifest.id===id&&e.accepted);if(!entry?.package.manifest.vscode)throw Error('Reviewed VSIX installation required');if(entry.package.manifest.vscode.compatibility.partial&&!entry.compatibilityAccepted)throw Error('Accept partial VS Code compatibility first');const profile=this.host.addons.data.profile;if(!profile.resolved.includes(id)&&!(profile.activating&&profile.requested.some(r=>(typeof r==='string'?r:r.id)===id)))throw Error('Extension is disabled');if(this.host.ws.projectReadOnly)throw Error('Node extensions are disabled in a read-only project window');if(!this.host.trust().trusted)throw Error('WORKSPACE_UNTRUSTED: Trust this folder before running extensions');return entry.package.manifest;}
 ensure(){if(this.child)return;const child=fork(path.join(__dirname,'vscode-worker.cjs'),[],{execPath:process.execPath,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});this.child=child;child.stdout.on('data',()=>{});child.stderr.on('data',chunk=>this.host.event('vscodeEvent',{type:'log',text:String(chunk).slice(0,4000)}));child.on('message',message=>{if(message.reply){const pending=this.pending.get(message.reply);if(pending){this.pending.delete(message.reply);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error)):pending.resolve(message.value);}}else this.host.event('vscodeEvent',message);});child.on('exit',(code,signal)=>{if(this.child===child)this.child=null;this.active.clear();for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(Error('Extension host stopped: '+(signal||code)));}this.pending.clear();this.host.event('vscodeEvent',{type:'hostStopped',code,signal});});}
 request(op,data={},timeout=15000){this.ensure();const id=++this.sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Extension request timed out: '+op));},timeout);this.pending.set(id,{resolve,reject,timer});this.child.send({id,op,data},error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(error);}});});}
 async handle(op,d){
  if(op==='vscodePrune'){await this.prune({force:d.bundle?[d.bundle]:[]});return true;}
  if(op==='vscodeStop'){if(this.active.has(d.id)){try{await this.request('stop',{owner:d.id},3000);}catch(error){this.host.event('vscodeEvent',{type:'error',owner:d.id,text:'Extension host did not stop cleanly: '+error.message});this.close();}finally{this.active.delete(d.id);if(!this.active.size)this.close();}}return true;}
  const manifest=this.authorize(d.id),owner=manifest.id;
  if(op==='vscodeStart'){const bundle=manifest.vscode.bundle;if(!/^[a-f0-9]{64}$/.test(bundle||''))throw Error('VSIX bundle is unavailable');const folder=path.join(this.storage,bundle),ready=JSON.parse(await fs.readFile(path.join(folder,'ready.json'),'utf8'));if(ready.id!==owner||ready.version!==manifest.version)throw Error('VSIX bundle identity mismatch');this.active.add(owner);try{return await this.request('start',{owner,folder,root:this.host.ws.root,stateFolder:path.join(this.host.ws.data,'extension-state',owner),manifest,documents:d.documents||[],configuration:d.configuration||{}},30000);}catch(error){await this.handle('vscodeStop',{id:owner}).catch(()=>{});throw error;}}
  if(!this.active.has(owner))throw Error('Extension is not running');
  if(op==='vscodeReply')return this.request('uiReply',{owner,request:d.request,value:d.value,error:d.error});
  if(op==='vscodeInvoke')return this.request('invoke',{owner,handle:d.handle,method:d.method,args:d.args,documents:d.documents,configuration:d.configuration},30000);
  if(op==='vscodeUpdate')return this.request('update',{owner,documents:d.documents,configuration:d.configuration});
  throw Error('Unsupported extension operation');
 }
 async prune({force=[]}={}){const keep=new Set(this.host.addons.data.packages.map(e=>e.package.manifest.vscode?.bundle).filter(Boolean));if(!await exists(this.storage))return;for(const name of await fs.readdir(this.storage)){if(!/^[a-f0-9]{64}$/.test(name)||keep.has(name))continue;const target=path.resolve(this.storage,name),ready=path.join(target,'ready.json');let recent=false;try{recent=Date.now()-(await fs.stat(ready)).mtimeMs<86400000;}catch{}if(recent&&!force.includes(name))continue;if(inside(target,this.storage)&&!(await fs.lstat(target)).isSymbolicLink())await fs.rm(target,{recursive:true,force:true});}}
 close(){const child=this.child;if(child){this.child=null;child.removeAllListeners('message');child.removeAllListeners('exit');if(this.host.tools?.terminate)this.host.tools.terminate(child);else child.kill();}for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(Error('Extension host stopped'));}this.pending.clear();this.active.clear();if(child)this.host.event('vscodeEvent',{type:'hostStopped'});}
}
module.exports={VSCodeRuntime};
