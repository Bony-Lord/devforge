'use strict';
const {spawn}=require('node:child_process'),path=require('node:path'),fs=require('node:fs/promises');
async function keepAwake(){
 if(process.platform!=='win32')return{active:false,reason:'Windows only',release:async()=>{}};
 // Invoke the fixed inline command without changing the user's execution policy.
 const command=Buffer.from(await fs.readFile(path.join(__dirname,'awake.ps1'),'utf8'),'utf16le').toString('base64');
 const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',command],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',errors='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',value=>{output=(output+value).slice(-4000);});child.stderr.on('data',value=>{errors=(errors+value).slice(-4000);});child.stdin.on('error',()=>{});
 const exited=new Promise(resolve=>{child.once('exit',(code,signal)=>resolve({code,signal}));child.once('error',error=>resolve({error:error.message}));});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.stdin.end();child.kill();reject(Error('Windows sleep guard did not start: '+errors));},15000);const ready=()=>{if(output.includes('AWAKE')){clearTimeout(timer);child.stdout.off('data',ready);resolve();}};child.stdout.on('data',ready);exited.then(result=>{clearTimeout(timer);if(!output.includes('AWAKE'))reject(Error('Windows sleep guard failed: '+(result.error||errors||result.code)));});});
 return{active:true,pid:child.pid,method:'SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)',async release(){child.stdin.end();const result=await Promise.race([exited,new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve({terminated:true});},5000);timer.unref();})]);return{...result,released:output.includes('RELEASED')||result.code===0};}};
}
module.exports={keepAwake};
