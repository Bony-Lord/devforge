'use strict';
const {contextBridge,ipcRenderer}=require('electron');
// No raw ipcRenderer, filesystem, child_process, Node or Electron objects cross
// the isolated preload boundary. All messages go through the host's validation.
contextBridge.exposeInMainWorld('ForgeNative',{request:request=>{
  if(typeof request!=='string'||request.length>10*1024*1024)throw Error('Invalid request');
  ipcRenderer.send('studio:request',request);
}});
contextBridge.exposeInMainWorld('StudioDesktop',{
  platform:process.platform,darkTitleBar:process.platform==='win32',sandboxed:process.sandboxed===true,
  onResult:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('studio:result',listener);return()=>ipcRenderer.removeListener('studio:result',listener);},
  onEvent:callback=>{const listener=(_event,type,value)=>callback(type,value);ipcRenderer.on('studio:event',listener);return()=>ipcRenderer.removeListener('studio:event',listener);}
});
