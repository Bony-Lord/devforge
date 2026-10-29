'use strict';
async function loadLocalPage(window,page,{timeout=30000}={}){
 const contents=window.webContents;let finished=false;
 const matches=()=>!contents.isDestroyed()&&contents.getURL()===page;
 const loaded=()=>{if(matches())finished=true;};contents.on('did-finish-load',loaded);
 try{await window.loadURL(page);}
 catch(error){
  if(error.code!=='ERR_ABORTED'||error.url!==page||contents.isDestroyed())throw error;
  const current=contents.getURL();if(current&&current!==page)throw error;if(finished)return;
  await new Promise((resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timer);contents.removeListener('did-finish-load',done);contents.removeListener('did-fail-load',failed);contents.removeListener('render-process-gone',gone);};
   const done=()=>{if(!matches())return;cleanup();resolve();};
   const failed=(_event,code,description,url,isMainFrame)=>{if(code===-3||isMainFrame===false)return;cleanup();reject(Error(description+' ('+code+') loading '+url));};
   const gone=()=>{cleanup();reject(Error('Editor process stopped during startup'));};
   const timer=setTimeout(()=>{cleanup();reject(Error('Editor page did not finish loading after a reload'));},timeout);timer.unref?.();
   contents.on('did-finish-load',done);contents.on('did-fail-load',failed);contents.on('render-process-gone',gone);
  });
 }finally{contents.removeListener('did-finish-load',loaded);}
}
module.exports={loadLocalPage};
