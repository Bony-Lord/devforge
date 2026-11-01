'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const {sleep}=require('./core.cjs'),{killOwned,resourceUse}=require('./cdp.cjs');
async function runSuite({store,config,index=0,name,shouldStop,onFailure}){
 const available=[{name:'VSX file operations',file:'stability-regressions.cjs',args:['--codeoss','--file-operations-codeoss','--offline-gallery']},{name:'Editors and windows',file:'stability-regressions.cjs',args:['--codeoss','--multiwindow-codeoss','--offline-gallery']}];
 const cache=config.toolCache||path.resolve(__dirname,'../../work/windows-python-061-20261029/ui-data-final');
 let cached=true;for(const name of ['style','intelligence']){const manifest=require(path.resolve(__dirname,'../../app/src/main/assets/python/'+name+'-manifest.json'));for(const pkg of manifest.packages)if(!await fs.stat(path.join(cache,manifest.id,pkg.filename)).then(s=>s.size===pkg.bytes,()=>false))cached=false;}
 if(cached)available.push({name:'Full UI offline',file:'ui-regressions.cjs',args:['--codeoss','--offline-gallery'],cache});
 const suite=name?available.find(s=>s.name===name):available[index%available.length];if(!suite){const result={name,passed:false,unavailable:true,reason:'Suite is unknown or its offline cache is unavailable'};await onFailure('Regression suite unavailable',result.reason,'adapter',result);return result;}
 const relative='suites/'+index+'-'+suite.file.replace('.cjs','.json'),reportFile=path.join(store.run,relative),profile=await store.profile('suite-'+index),temporary=path.join(profile,'tmp');await fs.mkdir(temporary,{recursive:true});await fs.mkdir(path.dirname(reportFile),{recursive:true});
 const env={...process.env,TEMP:temporary,TMP:temporary,DEVFORGE_REPAIR_REPORT:reportFile,DEVFORGE_UI_REPORT:reportFile};if(suite.cache)env.DEVFORGE_TEST_TOOL_CACHE=suite.cache;
 const child=spawn(process.execPath,[path.resolve(__dirname,'..',suite.file),'--app='+config.app,...suite.args],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='',reason;for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{log=(log+b).slice(-100000);});child.on('error',e=>{reason=e.message;});
 const started=Date.now();let lastResource=0;
 try{while(child.exitCode===null&&!reason){if(await shouldStop()){reason='Stopped';break;}if(Date.now()-started>12*60000){reason='Suite timed out after 12 minutes';break;}if(Date.now()-lastResource>30000){lastResource=Date.now();const usage=await resourceUse(child.pid);if(usage?.rssMb>config.maxMemoryMb){reason='Suite exceeded memory budget';break;}await store.checkSpace();}await sleep(500);}
  if(reason)await killOwned(child);
  const report=await fs.readFile(reportFile,'utf8').then(JSON.parse,()=>null),checks=report?.checks||[];
  const result={name:suite.name,report:relative,passed:!reason&&child.exitCode===0&&!!report&&!report.error&&checks.every(c=>c.passed),checks:checks.length,reason:reason||report?.error,seconds:Math.round((Date.now()-started)/1000),availableSuites:available.map(s=>s.name),fullUiCacheAvailable:cached,externalGallery:'Not exercised; offline fixtures only'};
  await store.write(relative+'.runner.log',log);if(!report){result.partialPassed=(log.match(/^PASS .+$/gm)||[]).length;await store.write(relative,{format:'devforge.soak.suite-interrupted/1',...result,runnerLog:relative+'.runner.log'});}if(!result.passed&&reason!=='Stopped')await onFailure('Regression suite · '+suite.name,result.reason||'Failed checks; see '+relative,/memory budget/.test(reason||'')?'resource':reason||/Object reference chain is too long|could not be cloned|CDP (?:timeout|disconnected|is not connected)/i.test(result.reason||'')?'infrastructure':'bug',result);return result;
 }finally{await killOwned(child);await store.removeProfile(profile);}
}
module.exports={runSuite};
