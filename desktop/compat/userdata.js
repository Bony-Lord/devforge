import {Emitter,Event} from '@codingame/monaco-vscode-api/vscode/vs/base/common/event';
import {URI} from '@codingame/monaco-vscode-api/vscode/vs/base/common/uri';
import {FileSystemProviderError,FileSystemProviderErrorCode,FileSystemProviderCapabilities,registerCustomProvider} from '@codingame/monaco-vscode-files-service-override';
class NativeUserDataProvider{
 capabilities=FileSystemProviderCapabilities.FileReadWrite|FileSystemProviderCapabilities.PathCaseSensitive;
 events=new Emitter();onDidChangeFile=this.events.event;onDidChangeCapabilities=Event.None;
 constructor(){this.off=globalThis.onNative('codeossUserDataChanged',event=>this.events.fire([{resource:URI.from({scheme:'vscode-userdata',path:event.path}),type:event.type}]));}
 async request(action,resource,extra={}){try{return await globalThis.native('codeossUserData',{action,path:resource.path,...extra});}catch(error){const code=error.message.startsWith('ENOENT:')?FileSystemProviderErrorCode.FileNotFound:error.message.startsWith('EEXIST:')?FileSystemProviderErrorCode.FileExists:error.message.startsWith('EACCES:')?FileSystemProviderErrorCode.NoPermissions:FileSystemProviderErrorCode.Unknown;throw new FileSystemProviderError(error.message,code);}}
 watch(){return{dispose(){}};}
 stat(resource){return this.request('stat',resource);}
 mkdir(resource){return this.request('mkdir',resource);}
 readdir(resource){return this.request('readdir',resource);}
 delete(resource,options){return this.request('delete',resource,{options});}
 rename(resource,to,options){return this.request('rename',resource,{to:to.path,options});}
 async readFile(resource){return Uint8Array.from(atob(await this.request('read',resource)),c=>c.charCodeAt(0));}
 writeFile(resource,bytes,options){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return this.request('write',resource,{bytes:btoa(binary),options});}
 dispose(){this.off();this.events.dispose();}
}
export async function registerUserData(){if(!globalThis.StudioDesktop)return;await globalThis.native('codeossUserData',{action:'mkdir',path:'/User'});registerCustomProvider('vscode-userdata',new NativeUserDataProvider());}
