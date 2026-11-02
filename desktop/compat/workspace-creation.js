// The upstream browser host cannot enter an untitled desktop workspace. Keep
// its folder update API but let the native host persist/own the new workspace.
import {isCancellationError} from '@codingame/monaco-vscode-api/vscode/vs/base/common/errors';
export function installWorkspaceCreation({editing,context,configuration,properties,windowScope,create}){
 const original=editing.createAndEnterWorkspace;
 delete editing.createAndEnterWorkspace;
 editing.createAndEnterWorkspace=async(folders,target)=>{
  const settings={};if(context.getWorkbenchState()===2){for(const key of configuration.keys().workspace){if(properties()[key]?.scope!==windowScope)continue;const value=configuration.inspect(key).workspaceValue;if(value!==undefined)settings[key]=value;}}
  return create(folders,{target,settings});
 };
 return{dispose(){delete editing.createAndEnterWorkspace;editing.createAndEnterWorkspace=original;}};
}

// A starting manager can create RPC customers after dispose(). Wait for its
// existing startup, but never force an idle lazy host to start just to stop it.
export async function stopExtensionHosts(service,kinds){
 const managers=kinds.flatMap(kind=>service._extensionHostManagers.getByKind(kind));
 await Promise.all(managers.map(manager=>{const actual=Object.hasOwn(manager,'_actual')?manager._actual:manager;return actual?.ready();}));
 // Ready means RPC customers exist, not that their initial configuration and
 // workspace messages have finished. Let in-flight requests settle before
 // disposing the transport, with a bound for an unresponsive extension.
 await Promise.all(managers.map(async manager=>{const actual=Object.hasOwn(manager,'_actual')?manager._actual:manager,deadline=Date.now()+1500;while(actual?._rpcProtocol){const pending=Object.values(actual._rpcProtocol._pendingRPCReplies||{}).map(reply=>reply._promise),remaining=deadline-Date.now();if(!pending.length||remaining<=0)break;let timer;try{await Promise.race([Promise.allSettled(pending),new Promise(resolve=>{timer=setTimeout(resolve,remaining);})]);}finally{clearTimeout(timer);}}}));
 // Startup activates remembered events without awaiting their RPCs. Intentional
 // shutdown cancels those requests; observe only these owned promises so their
 // expected cancellation cannot become an unhandled rejection.
 for(const manager of managers){const actual=Object.hasOwn(manager,'_actual')?manager._actual:manager;for(const pending of actual?._cachedActivationEvents?.values()||[])pending.catch(error=>{if(!isCancellationError(error))console.error(error);});}
 for(const manager of managers)await service._extensionHostManagers.stopOne(manager);
}
