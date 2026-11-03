'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {options,random,hash,inside,sleep,atomic,Store}=require('./core.cjs');
const {Application,resourceUse}=require('./cdp.cjs');
const {snapshot}=require('./fixtures.cjs');
const defaultScenarios=require('./scenarios.cjs');
const {sample,difference}=require('./png.cjs');
const repository=path.resolve(__dirname,'../..');
// LocalAppData can be virtualized differently by the MSIX Codex host and the
// unpackaged test EXE. A shared user-home folder has the same path in both.
const defaultRoot=()=>path.join(os.homedir(),'DevForgeTests');
function normalize(value){return String(value).replace(/(\bnode:)\d+/g,'$1#').replace(/http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{32,}\//gi,'<application>/').replace(/[A-Z]:[\\/][^\n"<>]*/gi,'<fixture-path>').replace(/soak_[a-z0-9]+/g,'<edit>').replace(/\b\d{5,}\b/g,'#');}
function bindingKey(action){return action.type+(['sidebar','panel'].includes(action.type)?':'+action.params?.name:'');}
function matchesFinding(finding,expected){return finding.kind===expected?.kind&&finding.title===expected?.title&&(!expected.signature||finding.signature===expected.signature);}
async function requestStop(root){
 root=path.resolve(root);const marker=JSON.parse(await fs.readFile(path.join(root,'.devforge-soak-root.json'),'utf8'));
 if(marker.format!=='devforge.soak.root/1')throw Error('Not a tester report folder');
 const active=JSON.parse(await fs.readFile(path.join(root,'active.json'),'utf8'));
 if(!inside(active.run,root)||path.dirname(active.run)!==root||active.stopFile!==path.join(active.run,'STOP'))throw Error('Invalid stop-file ownership');
 await fs.writeFile(active.stopFile,'stop requested\n');return active;
}
async function main(argv=process.argv.slice(2)){
 if(Number(process.versions.node.split('.')[0])<22)throw Error('DevForge tests require Node.js 22 or newer');
 const config=options(argv);config.reportRoot=path.resolve(config.reportRoot||defaultRoot());
 if(config.help){console.log('DevForge long-run tests (Node >=22)\n'+
  '  node desktop/soak/run.cjs [--hours 8] [--app path.exe] [--seed text]\n'+
  '  --minutes N --steps N --cycles N --cycle-steps 120 --delay 450\n'+
  '  --performance normal|idle|full --idle-seconds 60 --max-workers 0\n'+
  '  --worker-memory-mb 4096 --reserve-memory-mb 4096\n'+
  '  --max-memory-mb 2048 --max-disk-mb 512 --report-root directory\n'+
  '  --focus general|vsx --no-regressions --tool-cache directory --suite-every-minutes 90\n'+
  '  --replay finding/replay.json --suite "Editors and windows"\n  --self-check --no-keep-awake --list --stop\n'+
  'Default reports: '+defaultRoot());return;}
 if(config.list){console.log((config.focus==='vsx'?require('./vsx-scenarios.cjs'):defaultScenarios).names.join('\n'));return;}
 if(config.stop){try{console.log('Stop requested: '+(await requestStop(config.reportRoot)).run);}catch(error){if(error.code==='ENOENT')console.log('No active tester in '+config.reportRoot);else throw error;}return;}
 let replay;if(config.replay){replay=JSON.parse(await fs.readFile(path.resolve(config.replay),'utf8'));if(replay.format!=='devforge.soak.replay/1'||!Array.isArray(replay.actions)||replay.actions.length>10000)throw Error('Unsupported replay file');config.seed=replay.seed;config.steps=replay.actions.length;config.cycles=1;config.cycleSteps=Math.max(1,config.steps);config.regressions=false;if(replay.suiteName)config.suite=replay.suiteName;if(replay.focus)config.focus=replay.focus;}
 config.app=path.resolve(config.app||path.join(process.env.LOCALAPPDATA||'', 'Programs/DevForge/DevForge.exe'));
 if(!await fs.stat(config.app).then(()=>true,()=>false)){if(argv.some(a=>a==='--app'||a.startsWith('--app=')))throw Error('Application target does not exist: '+config.app);config.app=path.resolve(__dirname,'..');}
 if(config.toolCache)config.toolCache=path.resolve(config.toolCache);
 if(config.performance!=='normal'&&!config.suite&&!replay)return require('./fleet.cjs').main(config);
 const scenarios=config.focus==='vsx'?require('./vsx-scenarios.cjs'):defaultScenarios,{names,generate,execute}=scenarios,{prepare}=config.focus==='vsx'?require('./vsx-fixtures.cjs'):require('./fixtures.cjs');
 const store=await new Store(config.reportRoot,config.maxDiskMb).start(config),started=Date.now(),deadline=config.durationMs?started+config.durationMs:Infinity,rng=random(config.seed);
 const adapter=(await fs.readFile(path.join(__dirname,'adapter.js'),'utf8'))+(scenarios.adapter||''),visual=await fs.readFile(path.join(__dirname,'visual.js'),'utf8');
 const state={format:'devforge.soak.status/1',status:'running',seed:config.seed,startedAt:new Date(started).toISOString(),app:config.app,steps:0,cycles:0,coverage:Object.fromEntries(names.map(n=>[n,{passed:0,failed:0,unavailable:0}])),suites:[],limits:{diskMb:config.maxDiskMb,memoryMb:config.maxMemoryMb},focus:config.focus,adapterHash:hash(adapter),visualHash:hash(visual)};
 if(replay)state.replay={expectedSteps:replay.actions.length,expectedFinding:replay.finding,recordedVersion:replay.appVersion,recordedAdapterHash:replay.adapterHash,completed:false,targetObserved:false};
 let app,fixture,awake,actions=[],step=0,cycle=0,stop=false,lastResource=0,lastSuite=0,suiteIndex=0,unsupported=new Set(),lastReport=0;
 const interrupt=()=>{stop=true;};process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
 const stopping=async()=>stop||Date.now()>=deadline||!!(config.steps&&state.steps>=config.steps)||await fs.stat(store.stopFile).then(()=>true,()=>false);const shouldStop=async()=>await stopping()||!!(config.cycles&&cycle>=config.cycles);
 const report=async(force=false)=>{if(!force&&Date.now()-lastReport<5000)return;lastReport=Date.now();state.elapsedSeconds=Math.round((Date.now()-started)/1000);state.findingCounts=Object.fromEntries(['bug','visual','adapter','resource','infrastructure'].map(k=>[k,[...store.findings.values()].filter(f=>f.kind===k).length]));state.diskMb=Math.round(store.bytes/1048576*10)/10;state.temporaryProfiles=[...store.externalProfiles.keys()];await store.report(state);};
 async function control(){await require('./control.cjs').apply(store,config,state);while(state.controls.paused&&!await stopping()){state.status='paused';if(awake){await awake.release();awake=null;}await report(true);await sleep(500);await require('./control.cjs').apply(store,config,state);}if(!await stopping()){state.status='running';if(config.keepAwake&&!awake)awake=await require('./power.cjs').keepAwake();}}
 async function call(action){const result=await app.cdp.evaluate('__devforgeSoak.perform('+JSON.stringify(action)+')');if(!result?.ok){const error=Error(result?.error||'Adapter returned an invalid result');error.code=result?.adapter?'ADAPTER_MISMATCH':'APP_ASSERTION';throw error;}return result.value;}
 async function inject(){await app.ensureConnection();await app.cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});if(!app.cdp.soakPreload){await app.cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:adapter+'\n;'+visual});app.cdp.soakPreload=true;}const contract=await app.cdp.evaluate(adapter);if(contract?.schema!==1){const e=Error('Automation adapter schema changed');e.code='ADAPTER_MISMATCH';throw e;}await app.cdp.until('typeof __devforgeSoak!=="undefined"&&__devforgeSoak.ready()');await app.cdp.evaluate(visual);await app.cdp.evaluate('__devforgeSoak.initialize('+JSON.stringify(fixture.roots)+')');if(scenarios.initialize)await scenarios.initialize({cdp:app.cdp,fixture});const probe=await app.cdp.evaluate('__devforgeSoak.probe()');state.version=probe.version;state.capabilities=probe.features;await sleep(200);return probe;}
 async function fixtureFile(file){const resolved=path.resolve(path.isAbsolute(file)?file:path.join(fixture.main,file)),root=await fs.realpath(fixture.main),actual=await fs.realpath(resolved);if(!inside(actual,root))throw Error('Disk check escaped the synthetic project');return actual;}
 async function checkDisk(file,text){const actual=await fs.readFile(await fixtureFile(file),'utf8');if(typeof text==='string'&&!actual.includes(text))throw Error('Saved file is missing expected fixture bytes: '+file);return actual;}
 async function writeExternal(file,text){await fs.writeFile(await fixtureFile(file),text);}
 async function finding(kind,title,detail,extra={}){
  const result=await store.finding({kind,title,detail:String(detail).slice(0,12000),cycle,step,...extra,signature:normalize(extra.signature||scenarios.findingSignature?.(title,detail)||detail)});
  if(!result.fresh)return result.finding;
  const f=result.finding,base='findings/'+f.id;console.log('FINDING '+kind+' '+title);
  f.replay=base+'/replay.json';await store.write(f.replay,{format:'devforge.soak.replay/1',focus:config.focus,seed:config.seed,appVersion:state.version,adapterHash:state.adapterHash,suiteName:extra.suiteName,actions:extra.suiteName?[]:[...actions],finding:{kind,title,signature:f.signature}});
  if(app?.cdp){try{f.images=[base+'/screen.png'];await app.cdp.evaluate('__devforgeVisual?.clear()');await store.write(f.images[0],await app.cdp.screenshot());if(extra.issues?.length){await app.cdp.evaluate('__devforgeVisual.overlay('+JSON.stringify(extra.issues)+')');f.images.push(base+'/marked.png');await store.write(f.images[1],await app.cdp.screenshot());await app.cdp.evaluate('__devforgeVisual.clear()');}}catch(error){f.captureError=error.message;}
   try{await store.write(base+'/context.json',await app.cdp.evaluate('__devforgeSoak.context()'));}catch(error){f.contextError=error.message;}
   await store.write(base+'/renderer.json',{exceptions:app.cdp.events,console:app.cdp.logs});
  }
  if(app)await store.write(base+'/process.log',app.output);
  if(fixture)try{f.snapshot=await snapshot(fixture.profile,base+'/fixture',store);}catch(error){if(error.code==='DISK_BUDGET')throw error;f.snapshotError=error.message;}
  if(fixture&&scenarios.evidence)try{f.extensions=await scenarios.evidence({fixture,store,base});}catch(error){if(error.code==='DISK_BUDGET')throw error;f.fixtureEvidenceError=error.message;}
  if(store.findings.size>=200){stop=true;state.reason='Finding limit reached (200); evidence retained';}
  await report(true);return f;
 }
 async function inspect(){const result=await app.cdp.evaluate('__devforgeVisual.inspect()');state.visualSamples=(state.visualSamples||0)+1;if(!result.issues.length)return;await sleep(250);const confirmed=await app.cdp.evaluate('__devforgeVisual.inspect()'),key=i=>i.kind+'|'+i.selector+'|'+i.label;for(const issue of confirmed.issues.filter(i=>result.issues.some(previous=>key(previous)===key(i)))){await finding('visual',issue.kind+' · '+(issue.label||issue.selector).slice(0,100),JSON.stringify(issue.detail),{signature:key(issue),issues:[issue],stableSamples:2});}}
 async function checkpoint(view){
  const info=await call({type:'checkpoint',params:{view}});await app.cdp.send('Emulation.setDeviceMetricsOverride',{width:1360,height:900,deviceScaleFactor:1,mobile:false});await sleep(600);
  // Only the immutable reference document is used; caret, clock and animations
  // are hidden temporarily. Screenshots are suggestions, never pass/fail truth.
  await app.cdp.evaluate("(()=>{const s=document.createElement('style');s.id='soak-baseline-style';s.textContent='*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}.cursor{visibility:hidden!important}';document.head.append(s);document.activeElement?.blur();})()");
  try{const png=await app.cdp.screenshot(),grid=sample(png),key=hash([view,info,grid.width,grid.height]).slice(0,20),folder=path.join(store.root,'baselines'),metadata=path.join(folder,key+'.json');let baseline=await fs.readFile(metadata,'utf8').then(JSON.parse,e=>{if(e.code==='ENOENT')return null;throw e;});
   if(!baseline){await store.checkSpace(png.length+20000);await atomic(path.join(folder,key+'.png'),png);await atomic(metadata,{format:'devforge.soak.baseline/1',version:state.version,info,grid});state.newBaselines=(state.newBaselines||0)+1;}
   else{const diff=difference(baseline.grid,grid);if(diff.changed>.06&&diff.mean>4){const f=await finding('visual','Visual reference changed · '+view,JSON.stringify({baselineVersion:baseline.version,currentVersion:state.version,...diff}),{signature:'baseline|'+key});if(!f.reference){f.reference='findings/'+f.id+'/reference.png';await store.write(f.reference,await fs.readFile(path.join(folder,key+'.png')));f.images.push(f.reference);}}}
   state.baselineComparisons=(state.baselineComparisons||0)+1;
  }finally{await app.cdp.evaluate("document.querySelector('#soak-baseline-style')?.remove()").catch(()=>{});}
 }
 try{
  if(config.keepAwake){awake=await require('./power.cjs').keepAwake();state.power={active:awake.active,pid:awake.pid,method:awake.method};}
  await report(true);console.log('REPORT '+path.join(store.run,'index.html'));console.log('SEED '+config.seed);
  const runRegression=async(index,name)=>{const {runSuite}=require('./suites.cjs');const result=await runSuite({store,config,index,name,shouldStop:async()=>stop||Date.now()>=deadline||await fs.stat(store.stopFile).then(()=>true,()=>false),onFailure:async(title,detail,kind='bug',suite)=>finding(kind,title,detail,{suiteName:suite?.name})});state.suites.push(result);};
  if(config.suite)await runRegression(0,config.suite);
  while(!config.suite&&!await shouldStop()){
   await control();if(await shouldStop())break;cycle++;state.cycles=cycle;actions=[];step=0;unsupported=new Set();fixture=await prepare(await store.profile(cycle));app=new Application(config.app,fixture.profile);const cycleStarted=Date.now();
   try{
    await store.checkSpace(16*1048576);await app.launch();await inject();await checkpoint(config.focus==='vsx'?'addons':'editor');
    while(step<config.cycleSteps&&!stop&&Date.now()-cycleStarted<config.restartMinutes*60000){
     if(Date.now()>=deadline||(config.steps&&state.steps>=config.steps)||await fs.stat(store.stopFile).then(()=>true,()=>false))break;
     await control();if(await stopping())break;const action=replay?replay.actions[step]:config.selfCheck&&step===0?{schema:1,type:'self-check',params:{}}:generate(rng,step,state.coverage);if(!action)break;
     step++;state.steps++;actions.push(action);const entry={at:new Date().toISOString(),cycle,step,globalStep:state.steps,action};await store.append('actions.jsonl',{...entry,phase:'start'});
     if(unsupported.has(bindingKey(action))){if(state.coverage[action.type])state.coverage[action.type].unavailable++;await store.append('actions.jsonl',{...entry,phase:'unavailable',reason:'Binding failed earlier in this cycle'});continue;}
     let failed=false;
     try{
      await execute(action,{call,cdp:app.cdp,fixture,checkDisk,writeExternal,inject});await sleep(config.delay);
      const invariants=await app.cdp.evaluate('__devforgeSoak.invariant()');if(invariants.length)throw Error(invariants.join('; '));
      if(state.coverage[action.type])state.coverage[action.type].passed++;
      await store.append('actions.jsonl',{...entry,phase:'passed'});
     }catch(error){failed=true;const adapter=error.code==='ADAPTER_MISMATCH';if(state.coverage[action.type])state.coverage[action.type][adapter?'unavailable':'failed']++;if(adapter)unsupported.add(bindingKey(action));await store.append('actions.jsonl',{...entry,phase:adapter?'unavailable':'failed',error:error.message});if(!(adapter&&/Feature is disabled:/.test(error.message)))await finding(adapter?'adapter':'bug',action.type,error.stack||error.message);}
     for(const event of app.cdp.events.splice(0)){const error=event.params?.exceptionDetails?.exception?.description||event.params?.exceptionDetails?.text||event.method;await finding('bug','Unhandled renderer exception',error);}
     for(const event of app.cdp.logs.splice(0)){if(event.params.type!=='error')continue;const message=event.params.args?.map(a=>a.description||a.value||a.type).join(' '),layout=/ResizeObserver loop (?:completed|limit exceeded)/.test(message);const warning=scenarios.environmentWarning?.(message);if(warning){state.environmentWarnings??={};const item=state.environmentWarnings[warning]??={count:0,sample:normalize(message)};item.count++;continue;}await finding(layout?'visual':'bug',layout?'Layout observation warning':'Renderer console error',message);}
     if(!failed&&(step%config.visualEvery===0||['resize','settings-popup','rapid-popup','addon-search','self-check',...(scenarios.visualAfter||[])].includes(action.type)))await inspect();
     if(action.type==='self-check')await call({type:'selfCheckRemove'});
     if(Date.now()-lastResource>30000){lastResource=Date.now();const resource=await resourceUse(app.child.pid);if(resource){state.memory={...resource,cycle,at:new Date().toISOString()};state.peakRssMb=Math.max(state.peakRssMb||0,resource.rssMb);if(resource.rssMb>config.maxMemoryMb){await finding('resource','Application memory budget exceeded',JSON.stringify(resource),{signature:'application-rss-budget'});break;}}await store.checkSpace();}
     await report();
     if(failed&&['rename-roundtrip','copy-file','trash-restore','project-roundtrip','reload',...(scenarios.restartAfterFailure||[])].includes(action.type)&&!unsupported.has(bindingKey(action)))break; // Restart after an incomplete structural mutation.
     if(unsupported.size>=5){state.reason='Adapter needs updating: five scenarios are unavailable';stop=true;}
    }
   }catch(error){if(error.code==='DISK_BUDGET')throw error;await finding(error.code==='ADAPTER_MISMATCH'?'adapter':'infrastructure','Cycle could not continue',error.stack||error.message);if(!step){state.reason='Application or adapter startup failed';state.fatal=true;stop=true;}}
   finally{if(replay&&app?.cdp){try{await store.write('replay-final.png',await app.cdp.screenshot());state.replay.finalScreenshot='replay-final.png';}catch(error){state.replay.captureError=error.message;}}if(app)await app.close();app=null;await store.removeProfile(fixture.profile);fixture=null;await store.checkSpace();}
   // Existing deterministic regression suites supplement random scenarios. They
   // run sequentially and have their own isolated profiles and offline fixtures.
   if(config.regressions&&!await shouldStop()&&Date.now()-lastSuite>=config.suiteEveryMinutes*60000){
    lastSuite=Date.now();const nextIndex=suiteIndex++;await runRegression(nextIndex,scenarios.suites?.[nextIndex%scenarios.suites.length]);
   }
   await report(true);
  }
  state.status=state.fatal?'failed':state.reason?'stopped':'completed';if(!state.fatal&&(stop||await fs.stat(store.stopFile).then(()=>true,()=>false))){state.status='stopped';state.reason||='Stop requested';}
 }catch(error){state.status=error.code==='DISK_BUDGET'?'budget-reached':'failed';state.reason=error.stack||error.message;console.error(state.reason);}
 finally{
  if(app)await app.close().catch(()=>{});if(fixture)await store.removeProfile(fixture.profile).catch(e=>{state.cleanupError=e.message;});if(awake){state.power.release=await awake.release();state.power.active=false;}state.finishedAt=new Date().toISOString();
  if(replay){state.replay.completed=replay.suiteName?!!state.suites[0]?.passed:state.steps===replay.actions.length;state.replay.executedSteps=state.steps;state.replay.targetObserved=[...store.findings.values()].some(f=>matchesFinding(f,replay.finding?{...replay.finding,signature:scenarios.findingSignature?.(replay.finding.title,replay.finding.signature)||replay.finding.signature}:replay.finding));if(!state.replay.completed&&state.status==='completed'){state.status='interrupted';state.reason='Replay ended before all recorded actions were executed; the target finding has not been verified';}}
  try{await report(true);}catch(error){console.error('Final report: '+error.message);/* reserved space is for this final small status */await atomic(path.join(store.run,'final-status.json'),state);}
  await store.close();process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);
 }
 console.log('FINISHED '+state.status+'; '+state.steps+' steps; '+store.findings.size+' distinct findings\n'+path.join(store.run,'index.html'));
 return state;
}
module.exports={main,requestStop,normalize,matchesFinding,bindingKey};
if(require.main===module)main().then(state=>{process.exitCode=state?.status==='failed'?1:0;}).catch(error=>{console.error(error.stack);process.exitCode=1;});
