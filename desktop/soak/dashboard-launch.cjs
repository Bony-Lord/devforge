'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {json}=require('./dashboard-store.cjs');
async function health(record){try{const url=new URL(record.url);if(url.hostname!=='127.0.0.1')return false;return(await(await fetch(new URL('api/health',url),{signal:AbortSignal.timeout(1000)})).json()).service==='devforge.finder.dashboard/1';}catch{return false;}}
async function main(argv=process.argv.slice(2)){
 if(argv.includes('--help')){console.log('DevForge Finder Dashboard: open existing or start a local panel. Options: --no-open --shutdown');return;}
 const data=path.join(os.homedir(),'DevForgeFinderControl');await fs.mkdir(data,{recursive:true});let record=await json(path.join(data,'server.json'));
 if(argv.includes('--shutdown')){if(record&&await health(record))await fetch(new URL('api/shutdown',record.url),{method:'POST',headers:{Origin:new URL(record.url).origin,'Content-Type':'application/json'},body:'{}'});return;}
 if(!record||!await health(record)){
  const log=await fs.open(path.join(data,'server.log'),'a'),child=spawn(process.execPath,[path.join(__dirname,'dashboard.cjs'),'--data='+data],{cwd:path.resolve(__dirname,'../..'),detached:true,windowsHide:true,stdio:['ignore',log.fd,log.fd]});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();await log.close();
  for(let n=0;n<100;n++){record=await json(path.join(data,'server.json'));if(record&&await health(record))break;await new Promise(resolve=>setTimeout(resolve,100));}if(!record||!await health(record))throw Error('Dashboard did not start; see '+path.join(data,'server.log'));
 }
 if(!argv.includes('--no-open')){
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Start-Process -FilePath '"+record.url.replaceAll("'","''")+"'"],{windowsHide:true,stdio:'ignore'});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code?reject(Error('Could not open the browser')):resolve());});
 }console.log(record.url);return record;
}
module.exports={main,health};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
