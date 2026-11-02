'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const {Store,atomic,inside,sleep,escape,sizeOf}=require('./core.cjs'),{plan,monitor}=require('./performance.cjs'),{resourceUse,killOwned}=require('./cdp.cjs');
const suites=['VSX file operations','Editors and windows','VSX editor columns','VSX workspaces','VSX workspace creation','VSX workspace Save As','VSX gallery and IDE packs'];
async function readWorker(record){
 try{const active=await fs.readFile(path.join(record.root,'active.json'),'utf8').then(JSON.parse,error=>{if(error.code!=='ENOENT')throw error;return fs.readFile(path.join(record.root,'latest.json'),'utf8').then(JSON.parse);});if(!inside(active.run,record.root)||path.dirname(active.run)!==record.root)throw Error('Worker report escaped its root');if(active.token)record.token=active.token;record.run=active.run;record.stopFile=path.join(active.run,'STOP');record.state=JSON.parse(await fs.readFile(path.join(active.run,'status.json'),'utf8'));}catch(error){if(!['ENOENT','SyntaxError'].includes(error.code||error.name))throw error;}
 if(record.run)record.profiles=await fs.readFile(path.join(record.run,'owned-profiles.json'),'utf8').then(JSON.parse,()=>null);return record.state;
}
async function stopWorker(record){
 if(record.stopRequested)return;record.stopRequested=Date.now();
 await readWorker(record);if(record.stopFile)await fs.writeFile(record.stopFile,'adaptive scheduler stop\n');else record.child.kill('SIGINT');
}
async function cleanupWorkerProfiles(record){
 if(!record.finished||!record.profiles?.profiles?.length)return;
 const token=record.token;if(!token||record.profiles.token!==token)throw Error('Worker fixture ownership is unavailable');
 const temporary=await fs.realpath(require('node:os').tmpdir());
 for(const profile of record.profiles.profiles){
  const real=await fs.realpath(profile).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(!real)continue;
  if(real!==profile||path.dirname(real)!==temporary||!path.basename(real).startsWith('df-soak-'))throw Error('Worker fixture escaped its temporary directory');
  const marker=JSON.parse(await fs.readFile(path.join(real,'.devforge-soak-owned.json'),'utf8'));if(marker.format!=='devforge.soak.fixture/1'||marker.token!==token)throw Error('Worker fixture ownership mismatch');
  await fs.rm(real,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
 record.profiles.profiles=[];await atomic(path.join(record.run,'owned-profiles.json'),record.profiles);
}
function workerArgs(config,{seed,root,suite,boost}){
 const args=[path.join(__dirname,'run.cjs'),'--performance','normal','--app',config.app,'--report-root',root,'--seed',seed,'--minutes','12','--no-keep-awake','--max-memory-mb',String(config.workerMemoryMb),'--max-disk-mb',String(Math.max(256,Math.floor(config.maxDiskMb/Math.max(1,config.maxWorkers||4))))];
 if(suite)args.push('--suite',suite);else args.push('--no-regressions','--steps',String(config.cycleSteps),'--cycles','1','--cycle-steps',String(config.cycleSteps),'--delay',String(boost?Math.min(80,config.delay):config.delay));
 return args;
}
async function main(config){
 config={...config,maxWorkers:Math.min(config.maxWorkers||Infinity,Math.max(1,Math.floor(require('node:os').availableParallelism()/2)),Math.floor(config.maxMemoryMb/config.workerMemoryMb),Math.floor(config.maxDiskMb/256))};
 const store=await new Store(config.reportRoot,config.maxDiskMb).start(config),started=Date.now(),deadline=config.durationMs?started+config.durationMs:Infinity,workers=[],findings=new Map();let stopped=false,telemetry,awake,usage,lastUsage=0,nextSuite=0,ordinal=0,lastReport=0;
 const state={format:'devforge.soak.fleet/1',status:'running',seed:config.seed,startedAt:new Date(started).toISOString(),app:config.app,performance:config.performance,steps:0,cycles:0,workers:[],suites:[],limits:{memoryMb:config.maxMemoryMb,workerMemoryMb:config.workerMemoryMb,reserveMemoryMb:config.reserveMemoryMb,diskMb:config.maxDiskMb,maxWorkers:config.maxWorkers||'automatic'}};
 const interrupt=()=>{stopped=true;};process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
 async function collect(){
  let steps=0,cycles=0;state.suites=[];
  for(const record of workers){const child=await readWorker(record);if(record.finished&&!record.cleanupError)await cleanupWorkerProfiles(record).catch(error=>{record.cleanupError=error.message;});if(!child)continue;steps+=child.steps||0;cycles+=child.cycles||0;for(const suite of child.suites||[])state.suites.push({...suite,worker:record.ordinal});
   for(const finding of child.findings||[]){const signature=JSON.stringify([finding.kind,finding.title,finding.signature]),prefix=path.relative(store.run,record.run).split(path.sep).join('/'),existing=findings.get(signature);if(existing){existing.count=Math.max(existing.count||1,finding.count||1);existing.lastSeen=finding.lastSeen;}else findings.set(signature,{...finding,worker:record.ordinal,sourceReport:prefix+'/index.html',replay:finding.replay?prefix+'/'+finding.replay:undefined,images:finding.images?.map(file=>prefix+'/'+file)});}
  }state.cleanupErrors=workers.filter(r=>r.cleanupError).map(r=>({worker:r.ordinal,error:r.cleanupError}));state.steps=steps;state.cycles=cycles;state.findings=[...findings.values()];state.findingCounts=Object.fromEntries(['bug','visual','adapter','resource','infrastructure'].map(kind=>[kind,state.findings.filter(f=>f.kind===kind).length]));
  state.workers=workers.map(record=>({ordinal:record.ordinal,seed:record.seed,suite:record.suite||'Random UI',pid:record.child.pid,status:record.finished?'finished':record.stopRequested?'stopping':'running',result:record.state?.status,report:record.run?path.relative(store.run,path.join(record.run,'index.html')).split(path.sep).join('/'):null,steps:record.state?.steps||0,checks:(record.state?.suites||[]).reduce((sum,suite)=>sum+(suite.checks||0),0)}));
 }
 async function report(force=false){
  if(!force&&Date.now()-lastReport<2000)return;lastReport=Date.now();state.elapsedSeconds=Math.round((Date.now()-started)/1000);await collect();await store.write('status.json',state);await atomic(path.join(store.root,'latest.json'),{run:store.run,report:path.join(store.run,'index.html'),status:state.status});
  const rows=state.workers.map(w=>`<tr><td>${w.ordinal}</td><td>${escape(w.suite)}</td><td>${escape(w.status+' / '+(w.result||''))}</td><td>${w.steps}</td><td>${w.checks}</td><td>${w.report?`<a href="${escape(w.report)}">Отчёт</a>`:''}</td></tr>`).join(''),cards=state.findings.map(f=>`<article><b>${escape(f.kind+' · '+f.title)}</b><p>${escape(f.detail)}</p><a href="${escape(f.sourceReport)}">Доказательства и повтор</a></article>`).join('');
  await store.write('index.html',`<!doctype html><meta charset="utf-8"><title>DevForge — параллельная проверка</title><style>body{background:#181b21;color:#e5e9ef;font:15px system-ui;margin:24px}a{color:#9cc8ff}td,th{padding:8px;text-align:left;border-bottom:1px solid #3c4655}article{padding:14px;margin:12px 0;background:#242a33}p{overflow-wrap:anywhere}pre{white-space:pre-wrap}</style><h1>DevForge — параллельная проверка</h1><p>${escape(state.status)} · ${state.steps} действий · ${state.findings.length} находок · ${state.elapsedSeconds} с</p><p>Режим: ${escape(state.scheduler?.mode)} · активных процессов тестера: ${state.workers.filter(w=>w.status!=='finished').length} · цель: ${state.scheduler?.target??0}</p><p>Память: ${Math.round(state.memory?.rssMb||0)} / ${config.maxMemoryMb} MiB · резерв ОС: ${config.reserveMemoryMb} MiB</p><table><tr><th>Поток</th><th>Проверка</th><th>Состояние</th><th>Действия</th><th>Проверки</th><th></th></tr>${rows}</table>${cards}`);
 }
 function startWorker(boost){
  const index=ordinal++,root=path.join(store.run,'workers','task-'+index),suite=boost&&config.regressions&&index%3!==0?suites[nextSuite++%suites.length]:null,seed=config.seed+'-'+index;
  const child=spawn(process.execPath,workerArgs(config,{seed,root,suite,boost}),{env:{...process.env,DEVFORGE_SOAK_SHORT_PROFILES:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']}),record={ordinal:index,seed,root,suite,child,log:'',finished:false};workers.push(record);
  for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{record.log=(record.log+bytes).slice(-16000);});child.on('error',error=>{record.error=error.message;record.finished=true;});child.once('exit',(code,signal)=>{record.exit={code,signal};record.finished=true;});
 }
 try{
  telemetry=await monitor();if(config.keepAwake)awake=await require('./power.cjs').keepAwake();console.log('REPORT '+path.join(store.run,'index.html'));console.log('PERFORMANCE '+config.performance+'; memory '+config.maxMemoryMb+' MiB; reserve '+config.reserveMemoryMb+' MiB');
  while(!stopped&&Date.now()<deadline){
   if(await fs.stat(store.stopFile).then(()=>true,()=>false))break;await collect();if(config.steps&&state.steps>=config.steps||config.cycles&&state.cycles>=config.cycles||findings.size>=200)break;
   if(Date.now()-lastUsage>10000){lastUsage=Date.now();usage=await resourceUse(process.pid);if(usage){state.memory=usage;state.peakRssMb=Math.max(state.peakRssMb||0,usage.rssMb);}let external=0;for(const record of workers)for(const profile of record.profiles?.profiles||[])external+=await sizeOf(profile);await store.checkSpace(external);}
   const schedule=plan(config,{...telemetry.sample(),ownedMb:usage?.rssMb||0});state.scheduler=schedule;
   if(usage?.rssMb>config.maxMemoryMb)schedule.target=Math.max(0,workers.filter(w=>!w.finished).length-1);
   const active=workers.filter(w=>!w.finished),keeping=active.filter(w=>!w.stopRequested);
   for(const record of keeping.slice(schedule.target))await stopWorker(record);
   for(const record of active)if(record.stopRequested&&Date.now()-record.stopRequested>20000)await killOwned(record.child);
   // A lane is replaced only after its processes have exited and its owned
   // fixture cleanup has finished. User input immediately stops extra lanes.
   if(active.length<schedule.target)startWorker(schedule.mode==='boost');
   await report();await sleep(500);
  }state.status=stopped||await fs.stat(store.stopFile).then(()=>true,()=>false)?'stopped':'completed';
 }catch(error){state.status=error.code==='DISK_BUDGET'?'budget-reached':'failed';state.reason=error.stack||String(error);}
 finally{
  for(const record of workers.filter(w=>!w.finished))await stopWorker(record).catch(()=>{});const stopDeadline=Date.now()+20000;while(workers.some(w=>!w.finished)&&Date.now()<stopDeadline)await sleep(100);for(const record of workers.filter(w=>!w.finished))await killOwned(record.child);
  await telemetry?.close();if(awake)await awake.release();state.finishedAt=new Date().toISOString();for(const record of workers)await store.write('workers/task-'+record.ordinal+'.log',record.log);await report(true).catch(async error=>{await atomic(path.join(store.run,'final-status.json'),{...state,reportError:error.message});});await store.close();process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);
 }
 console.log('FINISHED '+state.status+'; '+state.steps+' steps; '+state.findings.length+' findings\n'+path.join(store.run,'index.html'));return state;
}
module.exports={main,workerArgs,readWorker,cleanupWorkerProfiles,suites};
