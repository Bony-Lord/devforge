'use strict';
const fs=require('node:fs/promises');
function limits(options={}){
 const result={};for(const[key,max]of [['notebookMemoryMb',1048576],['notebookCpuPercent',100],['notebookDiskMb',1048576],['notebookTimeoutSeconds',86400],['notebookTotalSeconds',604800]]){const value=Number(options[key]||0);if(!Number.isInteger(value)||value<0||value>max||key==='notebookMemoryMb'&&value>0&&value<64)throw Error('Invalid notebook resource limits: '+key);result[key]=value;}
 result.notebookGpuMode=options.notebookGpuMode||'allow';if(!['allow','disabled'].includes(result.notebookGpuMode))throw Error('Invalid notebook GPU mode');if(options.notebookGpuPercent!==undefined&&Number(options.notebookGpuPercent)!==100&&!(Number(options.notebookGpuPercent)===0&&result.notebookGpuMode==='disabled'))throw Error('GPU percentage quota is unsupported by the local runner');return result;
}
async function directoryBytes(root,max=Infinity){let size=0,entries=0;async function walk(folder){for(const e of await fs.readdir(folder,{withFileTypes:true})){if(++entries>200000)throw Error('Notebook disk scan exceeds 200000 entries');if(e.isSymbolicLink())continue;const file=require('node:path').join(folder,e.name);if(e.isDirectory())await walk(file);else if(e.isFile()){try{size+=(await fs.stat(file)).size;}catch(error){if(error.code!=='ENOENT')throw error;}}if(size>max)return;}}await walk(root);return size;}
class NotebookBudget {
 constructor(host,session,root,options){this.host=host;this.session=session;this.root=root;this.options=options;this.used=0;this.started=0;this.scanning=false;}
 async start(){if(this.options.notebookDiskMb){const max=this.options.notebookDiskMb*1048576;if(await directoryBytes(this.root,max)>max)throw Error('Notebook disk limit is already exceeded by the working folder');this.diskTimer=setInterval(()=>this.scan(),750);this.diskTimer.unref();}}
 cellStart(id){this.id=id;this.started=performance.now();if(this.options.notebookTotalSeconds){const remaining=this.options.notebookTotalSeconds*1000-this.used;if(remaining<=0){this.exceed('Notebook execution time limit exceeded');return false;}this.totalTimer=setTimeout(()=>this.exceed('Notebook execution time limit exceeded'),remaining);this.totalTimer.unref();}return true;}
 cellEnd(){if(this.started){this.used+=performance.now()-this.started;this.started=0;}clearTimeout(this.totalTimer);}
 async scan(){if(this.scanning)return;this.scanning=true;try{const max=this.options.notebookDiskMb*1048576;if(await directoryBytes(this.root,max)>max)this.exceed('Notebook disk budget exceeded in '+this.root+'; files were retained');}catch(error){this.exceed('Notebook disk monitor failed: '+error.message);}finally{this.scanning=false;}}
 exceed(message){if(this.stopped||this.session!==this.host.generation)return;this.host.host.event('notebook',{type:'error',ename:'ResourceLimitError',evalue:message,traceback:[],id:this.id,session:this.session,path:this.host.notebook});this.host.host.event('notebook',{type:'stopped',session:this.session,path:this.host.notebook,message});this.host.stop();}
 stop(){this.stopped=true;this.cellEnd();clearInterval(this.diskTimer);}
}
module.exports={limits,directoryBytes,NotebookBudget};
