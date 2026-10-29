'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {DesktopHost}=require('../host.cjs');
test('manual builds honor cwd/env, fail in order and can be stopped',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'devforge-actions-')),events=[],host=await new DesktopHost(dir,(type,value)=>events.push({type,value})).init();await host.ws.newProject('fixture');
 try{
  await host.handle('workspaceTrustSet',{trusted:true});await fs.mkdir(path.join(host.ws.root,'sub'));
  const options={workingDirectory:'sub',environment:{DEVFORGE_ACTION_TEST:'ok'},buildCommands:[[process.execPath,'-e','console.log(process.cwd()); console.log(process.env.DEVFORGE_ACTION_TEST);process.exit(7)'],[process.execPath,'-e','console.log("SHOULD_NOT_RUN")']]};
  const r=await host.handle('build',{mode:'custom',id:'ordered',options});assert.equal(r.code,7);const text=events.filter(e=>e.value.id==='ordered'&&e.value.stream==='build').map(e=>e.value.text).join('');assert(text.includes(path.join('sub'))&&text.includes('ok'));assert(!text.includes('SHOULD_NOT_RUN'));
  options.buildCommands=[[process.execPath,'-e','setInterval(()=>{},1000)']];const building=host.handle('build',{mode:'custom',id:'cancel',options});const deadline=Date.now()+5000;while(!host.tools.building){assert(Date.now()<deadline);await new Promise(r=>setTimeout(r,10));}await host.handle('stop');assert.equal((await building).code,130);assert.equal(host.tools.building,null);
 }finally{await host.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:30,retryDelay:100});}
});
