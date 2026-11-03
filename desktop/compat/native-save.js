// Keep genuine save participants, dirty-state transitions and didSave events.
// Native commits retain DevForge encoding, local history and external-edit guards.
export function installNativeSave({textFiles,fileService,commit}){
 const original=textFiles.write.bind(textFiles),failures=new Map();
 // Delayed DI proxies cache bound methods on their target; evict that old binding.
 delete textFiles.write;
 textFiles.write=async(resource,value,options)=>{
  const key=resource.toString();failures.delete(key);
  try{
   const owned=await commit(resource,value,options);
   if(!owned)return original(resource,value,options);
   return fileService.resolve(resource,{resolveMetadata:true});
  }catch(error){failures.set(key,error);throw error;}
 };
 return async(resource,reason)=>{
  const key=resource.toString();failures.delete(key);
  const model=textFiles.files.get(resource);if(!model)throw Error('Text-file model is not registered for '+key);
  // Upstream may coalesce this request with an older in-flight auto-save.
  // A completed older version must not satisfy Save All for a newer notebook edit.
  for(let attempt=0;attempt<4;attempt++){
   const saved=await model.save({force:true,reason,ignoreErrorHandler:false});
   if(failures.has(key)){const error=failures.get(key);failures.delete(key);throw error;}
   if(!saved)throw Error('File save did not complete: '+key);
   if(!model.isDirty())return true;
  }
  throw Error('Document kept changing while saving: '+key);
 };
}
