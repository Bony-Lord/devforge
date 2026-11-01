// Reuse genuine working-copy participants, including extension-provided edits.
// Only the physical commit belongs to the native project/trash implementation.
export function nativeFileOperations(service,{uri,operations,token}){
 const transactions=new Map(),nativeIds=new Set();
 for(const member of ['runFileOperationParticipants','_onWillRunWorkingCopyFileOperation','_onDidRunWorkingCopyFileOperation','_onDidFailWorkingCopyFileOperation'])if(!service[member])throw Error('Pinned working-copy operation service changed: '+member);
 const handle=async message=>{
  if(message.phase==='before'){
   if(transactions.has(message.transaction))throw Error('Duplicate native file operation');
   const operation=operations[message.operation];if(operation===undefined)throw Error('Unknown native file operation');
   const files=message.files.map(file=>({target:uri(file.target),...file.source?{source:uri(file.source)}:{}}));
   await service.runFileOperationParticipants(files,operation,undefined,token);
   const event={correlationId:service.correlationIds++,operation,files};
   nativeIds.add(event.correlationId);
   await service._onWillRunWorkingCopyFileOperation.fireAsync(event,token);
   transactions.set(message.transaction,event);
   try{
    if(['move','copy','delete'].includes(message.operation)){
     const resources=files.flatMap(file=>message.operation==='move'&&file.source?[file.source,file.target]:[file.target]);
     const dirty=new Set(resources.flatMap(resource=>service.getDirty(resource)));
     await Promise.all([...dirty].map(copy=>copy.revert({soft:true})));
    }
   }catch(error){transactions.delete(message.transaction);try{await service._onDidFailWorkingCopyFileOperation.fireAsync(event,token);}finally{nativeIds.delete(event.correlationId);}throw error;}
   return;
  }
  const event=transactions.get(message.transaction);if(!event)throw Error('Native file operation has no matching start');
  transactions.delete(message.transaction);
  try{await service[message.phase==='after'?'_onDidRunWorkingCopyFileOperation':'_onDidFailWorkingCopyFileOperation'].fireAsync(event,token);}finally{nativeIds.delete(event.correlationId);}
 };
 handle.isNativeEvent=event=>nativeIds.has(event.correlationId);return handle;
}
