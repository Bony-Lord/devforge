'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {atomic}=require('./workspace.cjs');
class CodeOSSStorage{
 constructor(data,event=()=>{},encryption){this.data=path.resolve(data);this.root=path.resolve(data,'codeoss','storage');this.event=event;this.encryption=encryption;this.states=new Map();this.tail=Promise.resolve();}
 handle(d){const task=this.tail.catch(()=>{}).then(()=>this.perform(d));this.tail=task;return task;}
 async transferWorkspace(d){const transfer=require('./workspace-storage-transfer.cjs');await transfer.waitForLocks(this,d);const task=this.tail.catch(()=>{}).then(()=>transfer(this,d));this.tail=task;return task;}
 async perform(d){
  if(typeof d.scope!=='string'||d.scope.length>4096||!d.scope)throw Error('Invalid extension storage scope');this.root=await require('./codeoss-paths.cjs').profileDirectory(this.data,'codeoss','storage');const id=crypto.createHash('sha256').update(d.scope).digest('hex'),file=path.join(this.root,id+'.json');let items=this.states.get(id);if(!items){try{items=new Map(JSON.parse(await fs.readFile(file,'utf8')).items);}catch(error){if(error.code!=='ENOENT')throw error;items=new Map();}this.states.set(id,items);}
  if(d.action==='read')return[...items];
  const inserted=d.insert||[],deleted=d.delete||[];if(!Array.isArray(inserted)||!Array.isArray(deleted)||inserted.length+deleted.length>100000||inserted.some(e=>!Array.isArray(e)||e.length!==2||typeof e[0]!=='string'||typeof e[1]!=='string')||deleted.some(e=>typeof e!=='string'))throw Error('Invalid extension storage update');
  const next=new Map(items);for(const[key,value]of inserted)next.set(key,value);for(const key of deleted)next.delete(key);await fs.mkdir(this.root,{recursive:true});await atomic(file,JSON.stringify({schemaVersion:1,scope:d.scope,items:[...next]}));this.states.set(id,next);this.event({scope:d.scope,insert:inserted,delete:deleted});return true;
 }
 async secret(d){
  if(typeof d.key!=='string'||d.key.length>8192)throw Error('Invalid extension secret key');const scope='encrypted-secrets';if(d.action==='keys')return(await this.handle({scope,action:'read'})).map(([key])=>key);
  if(d.action==='get'){const stored=new Map(await this.handle({scope,action:'read'})).get(d.key);if(stored===undefined)return null;if(!this.encryption?.isEncryptionAvailable())throw Error('Windows credential encryption is unavailable');return this.encryption.decryptString(Buffer.from(stored,'base64'));}
  if(d.action==='delete')return this.handle({scope,delete:[d.key]});
  if(d.action!=='set'||typeof d.value!=='string')throw Error('Invalid extension secret operation');if(!this.encryption?.isEncryptionAvailable())throw Error('Windows credential encryption is unavailable');return this.handle({scope,insert:[[d.key,this.encryption.encryptString(d.value).toString('base64')]]});
 }
}
module.exports={CodeOSSStorage};
