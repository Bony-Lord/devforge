'use strict';
const {contextBridge,ipcRenderer}=require('electron'),channel=process.argv.find(v=>v.startsWith('--translator-channel='))?.slice('--translator-channel='.length);
contextBridge.exposeInMainWorld('translationFrame',{command:(command,value)=>ipcRenderer.invoke(channel,command,value),onState:callback=>ipcRenderer.on(channel,(_event,value)=>callback(value))});
