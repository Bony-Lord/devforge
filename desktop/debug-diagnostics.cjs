'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
function redact(value){return String(value).replace(/(https?:\/\/[^\s"'<>]+)/gi,raw=>{try{const u=new URL(raw);u.username='';u.password='';u.search='';u.hash='';u.pathname=u.pathname.replace(/\b[a-f0-9]{32,}\b/gi,'<redacted>');return u.href;}catch{return '<url>';}}).replace(/((?:api[_-]?key|authorization|password|secret|token)\s*[=:]\s*["']?)[^\s,"'}]+/gi,'$1<redacted>').slice(0,8192);}
function sanitize(value,depth=0){if(typeof value==='string')return redact(value);if(value===null||typeof value==='number'||typeof value==='boolean')return value;if(depth>=5)return '<bounded>';if(Array.isArray(value))return value.slice(0,80).map(v=>sanitize(v,depth+1));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,80).map(([k,v])=>[k,/password|secret|authorization|token|api.?key/i.test(k)?'<redacted>':sanitize(v,depth+1)]));return String(value);}
class DebugLog{
 constructor(directory,{maxBytes=4*1024*1024,retained=3}={}){this.directory=directory;this.file=path.join(directory,'debug.ndjson');this.maxBytes=maxBytes;this.retained=retained;this.queue=Promise.resolve();this.pending=0;this.dropped=0;}
 write(type,data={}){
  if(this.pending>=256){this.dropped++;return this.queue;}
  const text=JSON.stringify({at:new Date().toISOString(),type,data:sanitize(data)})+'\n';this.pending++;
  this.queue=this.queue.then(async()=>{await fs.mkdir(this.directory,{recursive:true});const size=await fs.stat(this.file).then(s=>s.size,()=>0);if(size+Buffer.byteLength(text)>this.maxBytes){await fs.rm(this.file+'.'+(this.retained-1),{force:true});for(let n=this.retained-2;n>=0;n--)await fs.rename(n?this.file+'.'+n:this.file,this.file+'.'+(n+1)).catch(e=>{if(e.code!=='ENOENT')throw e;});}await fs.appendFile(this.file,text);}).catch(error=>{this.lastError=error.message;}).finally(()=>this.pending--);return this.queue;
 }
 async flush(){await this.queue;return {dropped:this.dropped,error:this.lastError||null};}
}
class DebugDiagnostics{
 constructor(electron,build,profile){this.electron=electron;this.build=build;this.directory=path.join(profile,'diagnostics');this.log=new DebugLog(this.directory);this.started=Date.now();this.tracing=false;this.traceBusy=false;this.log.write('session',{build,versions:process.versions});}
 attach(window){
  const contents=window.webContents;
  const note=(type,data)=>this.log.write(type,{window:window.id,...data});
  contents.on('console-message',event=>{const {level,message}=event;if(['warning','error',2,3].includes(level))note('renderer-console',{level,message:redact(message)});});
  contents.on('did-fail-load',(_e,code,description)=>note('load-failed',{code,description}));
  contents.on('render-process-gone',(_e,details)=>note('renderer-exit',details));
  window.on('unresponsive',()=>note('unresponsive',{}));
  contents.on('did-finish-load',()=>note('page-loaded',{elapsedMs:Date.now()-this.started}));
  contents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&(input.key==='F12'||input.control&&input.shift&&input.key.toLowerCase()==='i')){event.preventDefault();this.devtools(window);}});
 }
 start(){
  this.sample=setInterval(()=>this.log.write('resources',{processes:this.electron.app.getAppMetrics().map(({pid,type,cpu,memory})=>({pid,type,cpu,memory}))}),5000);this.sample.unref();
  process.on('uncaughtExceptionMonitor',this.onUncaught=error=>this.recordFatal(error));
 }
 recordFatal(error){const data={at:new Date().toISOString(),stack:redact(error?.stack||error)};try{const sync=require('node:fs');sync.mkdirSync(this.directory,{recursive:true});sync.writeFileSync(path.join(this.directory,'last-fatal.json'),JSON.stringify(data));}catch(failure){this.log.lastError=failure.message;}this.log.write('main-uncaught',data);}
 devtools(window){if(window.webContents.isDevToolsOpened())window.webContents.closeDevTools();else window.webContents.openDevTools({mode:'detach',activate:true});return true;}
 async report(){await this.log.flush();return {format:'devforge.debug/1',build:this.build,versions:process.versions,uptimeMs:Date.now()-this.started,processes:this.electron.app.getAppMetrics(),log:this.log.file,logDropped:this.log.dropped,logError:this.log.lastError||null,tracing:this.tracing};}
 async trace(window){
  if(this.traceBusy)throw Error('Performance recording is changing state');this.traceBusy=true;
  try{const tracing=this.electron.contentTracing;if(this.tracing){clearTimeout(this.traceTimer);const file=await tracing.stopRecording(this.traceFile);this.tracing=false;await this.log.write('trace-saved',{file});return {recording:false,file};}
   await fs.mkdir(this.directory,{recursive:true});this.traceFile=path.join(this.directory,'performance.json');
   await tracing.startRecording({recording_mode:'record-continuously',trace_buffer_size_in_kb:32768,included_categories:['devtools.timeline','v8','disabled-by-default-v8.cpu_profiler']});this.tracing=true;
   this.traceTimer=setTimeout(()=>this.trace(window).then(()=>{if(!window.isDestroyed())window.webContents.send('studio:event','toast','Debug: performance.json сохранён');}).catch(error=>this.log.write('trace-error',{message:redact(error.message)})),30000);this.traceTimer.unref();return {recording:true,maxSeconds:30};
  }finally{this.traceBusy=false;}
 }
 async action(window,data){
  switch(data.action){
   case 'status':return {...await this.report(),devToolsOpen:window.webContents.isDevToolsOpened()};
   case 'devtools':return this.devtools(window);
   case 'logs':return this.electron.shell.openPath(this.directory);
   case 'trace':return this.trace(window);
   case 'export':{const file=await this.electron.dialog.showSaveDialog(window,{defaultPath:path.join(this.electron.app.getPath('downloads'),'DevForge-Debug-report.json'),filters:[{name:'JSON',extensions:['json']}]});if(file.canceled)return null;await require('./workspace.cjs').atomic(file.filePath,JSON.stringify(await this.report(),null,2));return file.filePath;}
   case 'screenshot':{const result=await this.electron.dialog.showSaveDialog(window,{defaultPath:path.join(this.electron.app.getPath('downloads'),'DevForge-Debug.png'),filters:[{name:'PNG',extensions:['png']}]});if(result.canceled)return null;const image=await window.webContents.capturePage();await fs.writeFile(result.filePath,image.toPNG());return result.filePath;}
   case 'menu':{const en=data.language==='en',items=[{label:'DevTools (F12)',click:()=>this.devtools(window)},{label:en?'Open diagnostic logs':'Открыть журналы диагностики',click:()=>run('logs')},{label:this.tracing?(en?'Stop performance recording':'Остановить запись производительности'):(en?'Record performance (30 seconds)':'Записать производительность (30 секунд)'),click:()=>run('trace')},{label:en?'Export diagnostic report…':'Экспортировать отчёт диагностики…',click:()=>run('export')},{label:en?'Save screenshot…':'Сохранить снимок интерфейса…',click:()=>run('screenshot')}];const run=action=>this.action(window,{action}).then(value=>{if(action==='trace'&&!window.isDestroyed())window.webContents.send('studio:event','toast',value.recording?'Debug: запись производительности — 30 секунд':'Debug: performance.json сохранён');}).catch(error=>{this.log.write('debug-action-failed',{action,message:redact(error.message)});if(!window.isDestroyed())window.webContents.send('studio:event','toast',error.message);});this.electron.Menu.buildFromTemplate(items).popup({window});return true;}
   default:throw Error('Unknown Debug action');
  }
 }
 async close(){clearInterval(this.sample);clearTimeout(this.traceTimer);if(this.onUncaught)process.removeListener('uncaughtExceptionMonitor',this.onUncaught);if(this.tracing&&!this.traceBusy)await this.trace({isDestroyed:()=>true});await this.log.write('session-ended',{uptimeMs:Date.now()-this.started});await this.log.flush();}
}
module.exports={DebugDiagnostics,DebugLog,redact};
