'use strict';
const StudioOptionalAssets={
  loading:new Map(),
  async loadWindows(){
    if(window['dockview-core'])return;
    if(!this.loading.has('windows')){const promise=new Promise((resolve,reject)=>{
      // Once Monaco has loaded, the UMD bundle registers as AMD rather than a
      // window global. Let that loader own its anonymous module registration.
      if(typeof require==='function'&&typeof define==='function'&&define.amd){require(['vendor/dockview-core'],library=>{window['dockview-core']=library;resolve();},reject);return;}
      const script=document.createElement('script');script.src='vendor/dockview-core.js';script.onload=()=>window['dockview-core']?resolve():reject(Error('Window manager engine is unavailable'));script.onerror=()=>{script.remove();reject(Error('Download the window manager engine in Addons'));};document.head.append(script);
    }).catch(error=>{this.loading.delete('windows');throw error;});this.loading.set('windows',promise);}
    return this.loading.get('windows');
  }
};
