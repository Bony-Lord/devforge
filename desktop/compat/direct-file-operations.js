// workspace.fs operations use IFileService directly. Reconcile their native
// editors without inventing will/did file events (unlike WorkspaceEdit).
export function installDirectFileOperations({fileService,workingCopies,managed,notify}){
 const working=new Map(),subscriptions=[];let sequence=0;
 subscriptions.push(workingCopies.onWillRunWorkingCopyFileOperation(event=>working.set(event.correlationId,event.files)));
 for(const name of ['onDidRunWorkingCopyFileOperation','onDidFailWorkingCopyFileOperation'])subscriptions.push(workingCopies[name](event=>working.delete(event.correlationId)));
 const same=(a,b)=>a?.toString().toLowerCase()===b?.toString().toLowerCase(),active=new Map();
 const covered=resource=>[...working.values(),...active.values()].some(files=>files.some(file=>same(file.source,resource)||same(file.target,resource)));
 const originals=new Map();
 const run=async(operation,args,commit)=>{const source=args[0],target=operation==='move'?args[1]:source;
  if(!managed(source)||!managed(target)||covered(source))return commit();
  const message={transaction:'direct-fs-'+(++sequence),direct:true,operation,files:[operation==='move'?{source,target}:{target}]};active.set(message.transaction,message.files);
  try{await notify({...message,phase:'before'});let value;try{value=await commit();}catch(error){await notify({...message,phase:'failed'});throw error;}await notify({...message,phase:'after'});return value;}finally{active.delete(message.transaction);}
 };
 for(const [method,operation]of [['move','move'],['del','delete']]){
  const original=fileService[method];originals.set(method,original);delete fileService[method];
  fileService[method]=function(...args){return run(operation,args,()=>original.apply(this,args));};
 }
 const providers=new WeakSet();return{wrapProvider(provider){if(!provider||providers.has(provider))return;providers.add(provider);for(const[method,operation]of [['rename','move'],['delete','delete']]){const original=provider[method];if(typeof original!=='function')continue;provider[method]=function(...args){return run(operation,args,()=>original.apply(this,args));};}},dispose(){for(const subscription of subscriptions)subscription.dispose();for(const[method,original]of originals){delete fileService[method];fileService[method]=original;}}};
}
