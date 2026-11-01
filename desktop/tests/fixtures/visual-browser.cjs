'use strict';
const {app,BrowserWindow}=require('electron');
app.commandLine.appendSwitch('remote-debugging-port',process.argv.find(a=>a.startsWith('--cdp-port=')).split('=')[1]);
app.whenReady().then(async()=>{const window=new BrowserWindow({show:false,width:800,height:600,webPreferences:{backgroundThrottling:false}});await window.loadURL('data:text/html,<html><body>Visual audit fixture</body></html>');});
app.on('window-all-closed',()=>app.quit());
