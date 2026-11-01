'use strict';
const crypto=require('node:crypto'),path=require('node:path');

// The backend still owns validation, filesystem commits, rollback and trash.
// The renderer runs the real Code OSS working-copy participants around that commit.
class FileOperationEvents {
 constructor(ws,emit,{timeout=1800000}={}){this.ws=ws;this.emit=emit;this.timeout=timeout;this.pending=new Map();this.enabled=false;this.closed=false;}
 reply({id,error}){
  const request=this.pending.get(id);if(!request)throw Error('File operation request expired');
  this.pending.delete(id);clearTimeout(request.timer);
  if(error)request.reject(Error(String(error).slice(0,8192)));else request.resolve();
  return true;
 }
 request(transaction,phase){
  if(this.closed)return Promise.reject(Error('File operation window closed'));
  return new Promise((resolve,reject)=>{
   const id=crypto.randomUUID(),timer=setTimeout(()=>{this.pending.delete(id);reject(Error('File operation participants timed out'));},this.timeout);
   this.pending.set(id,{resolve,reject,timer});
   try{this.emit('codeossFileOperation',{...transaction,id,phase});}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
  });
 }
 async run(operation,files,commit){
  if(!this.enabled||!files.length)return commit();
  this.ws.assertEditable();
  const root=this.ws.root,transaction={transaction:crypto.randomUUID(),operation,files};
  await this.request(transaction,'before');
  let result;
  try{
   if(this.ws.root!==root)throw Error('Project changed during file operation');
   this.ws.assertEditable();for(const file of files)for(const value of [file.source,file.target].filter(Boolean))if(path.resolve(await this.ws.writable(value)).toLowerCase()!==path.resolve(value).toLowerCase())throw Error('File operation path changed during participation');result=await commit();
  }catch(error){await this.request(transaction,'failed').catch(()=>{});throw error;}
  await this.request(transaction,'after');
  return result;
 }
 close(){this.closed=true;this.enabled=false;for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(Error('File operation window closed'));}this.pending.clear();}
}
module.exports={FileOperationEvents};
