'use strict';
// One authenticated upstream remote agent per DevForge profile. Extension hosts
// remain isolated by upstream's client/session protocol, not by ad-hoc API shims.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
class CodeOSSServer{
 constructor(data,{runtime=path.join(__dirname,'compat','server'),logLevel='warn',onLog}={}){this.logLevel=logLevel;this.onLog=onLog;this.data=path.resolve(data,'codeoss');this.runtime=runtime;this.child=null;this.starting=null;this.log='';}
 async start(){if(this.info&&this.child?.exitCode===null)return this.info;if(this.starting)return this.starting;this.starting=this.launch().finally(()=>{this.starting=null;});return this.starting;}
 async launch(){
  const product=JSON.parse(await fs.readFile(path.join(this.runtime,'product.json'),'utf8')),pkg=JSON.parse(await fs.readFile(path.join(this.runtime,'package.json'),'utf8'));
  await fs.mkdir(this.data,{recursive:true});for(const name of ['user','cache','workspaces','history'])await fs.mkdir(path.join(this.data,'frontend',name),{recursive:true});const token=crypto.randomBytes(32).toString('hex'),tokenPath=path.join(this.data,'connection-token');await fs.writeFile(tokenPath,token,{mode:0o600});
  const args=[path.join(this.runtime,'out','server-main.js'),'--host','127.0.0.1','--port','0','--connection-token-file',tokenPath,'--server-data-dir',path.join(this.data,'agent'),'--user-data-dir',path.join(this.data,'user'),'--extensions-dir',path.join(this.data,'extensions'),'--telemetry-level','off','--reconnection-grace-time','15','--log',this.logLevel];
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(path.join(this.runtime,process.platform==='win32'?'node.exe':'node'),[path.join(__dirname,'codeoss-agent.cjs'),...args],{cwd:this.runtime,env,windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;
  return new Promise((resolve,reject)=>{let settled=false;const timer=setTimeout(()=>finish(Error('Code OSS agent did not start within 30 seconds')),30000);const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){child.kill();reject(error);}else resolve(value);};const output=bytes=>{const message=bytes.toString().replaceAll(token,'<redacted>');this.onLog?.(message);this.log=(this.log+message).slice(-12000);const match=this.log.match(/Extension host agent listening on (\d+)/);if(match){this.info={authority:'127.0.0.1:'+match[1],token,commit:product.commit,quality:product.quality,version:pkg.version,data:this.data};finish(null,this.info);}};child.stdout.on('data',output);child.stderr.on('data',output);child.once('error',error=>finish(error));child.once('exit',(code,signal)=>{this.info=null;finish(Error('Code OSS agent stopped ('+(code??signal)+'): '+this.log));});});
 }
 async close(){const child=this.child;this.child=null;this.info=null;if(!child||child.exitCode!==null)return;child.kill();await new Promise(resolve=>{const timer=setTimeout(resolve,4000);timer.unref();child.once('exit',()=>{clearTimeout(timer);resolve();});});}
}
module.exports={CodeOSSServer};
