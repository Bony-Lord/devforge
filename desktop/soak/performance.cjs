'use strict';
const os=require('node:os'),path=require('node:path'),fs=require('node:fs/promises'),{spawn}=require('node:child_process');
function plan(config,sample){
 const cpuLimit=Math.max(1,Math.floor(sample.cpus/2)),memoryLimit=Math.max(0,Math.floor(config.maxMemoryMb/config.workerMemoryMb)),available=Math.max(0,Math.floor((sample.freeMb-config.reserveMemoryMb+(sample.ownedMb||0))/config.workerMemoryMb)),diskLimit=config.maxDiskMb?Math.floor(config.maxDiskMb/256):Infinity,maximum=Math.min(config.maxWorkers||cpuLimit,cpuLimit,memoryLimit,diskLimit,available);
 const idle=Number.isFinite(sample.idleMs)&&sample.idleMs>=config.idleSeconds*1000,boost=config.performance==='full'||config.performance==='idle'&&idle;
 return{mode:boost?'boost':'interactive',target:Math.min(boost?maximum:1,maximum),maximum,idleMs:sample.idleMs??null,cpuLimit,memoryLimit,freeMb:Math.round(sample.freeMb),reserveMb:config.reserveMemoryMb};
}
async function monitor(){
 if(process.platform!=='win32')return{sample:()=>({idleMs:null,freeMb:os.freemem()/1048576,cpus:os.availableParallelism()}),close:async()=>{}};
 const encoded=Buffer.from(await fs.readFile(path.join(__dirname,'idle.ps1'),'utf8'),'utf16le').toString('base64'),child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',encoded],{windowsHide:true,stdio:['pipe','pipe','pipe']});let buffer='',latest,errors='';child.stdin.on('error',()=>{});child.stdout.on('data',bytes=>{buffer+=bytes;let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);try{latest={...JSON.parse(line),at:Date.now()};}catch{}}});child.stderr.on('data',bytes=>{errors=(errors+bytes).slice(-1000);});let failure;child.on('error',error=>{failure=error;});
 const until=Date.now()+12000;while(!latest&&!failure&&child.exitCode===null&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,50));if(!latest){child.stdin.end();child.kill();throw failure||Error('Idle monitor did not start: '+errors);}
 return{pid:child.pid,sample:()=>({idleMs:latest&&Date.now()-latest.at<6000?latest.idleMs:null,freeMb:os.freemem()/1048576,cpus:os.availableParallelism()}),async close(){child.stdin.end();const deadline=Date.now()+2500;while(child.exitCode===null&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));if(child.exitCode===null)child.kill();}};
}
module.exports={plan,monitor};
