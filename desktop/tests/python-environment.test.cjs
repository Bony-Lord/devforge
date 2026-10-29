'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {PythonEnvironments}=require('../python-environment.cjs');

test('Python selection respects explicit profiles, global settings and trusted project environments',async t=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'devforge-python-env-'));t.after(()=>fs.rm(data,{recursive:true,force:true}));let trusted=true;
 const host={ws:{data,root:data,prefs:{current:'fixture',settings:{}}},trust:()=>({trusted}),tools:{env:()=>({Path:'system-path',OTHER:'retained'})}},environments=new PythonEnvironments(host);
 const local=path.join(data,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');await fs.mkdir(path.dirname(local),{recursive:true});await fs.writeFile(local,'fixture');
 assert.equal(await environments.resolve(),local);trusted=false;assert(!(await environments.candidates()).includes(local));trusted=true;
 host.ws.prefs.settings.toolPaths={python:'tool-python'};assert.equal(await environments.resolve(),'tool-python');host.ws.prefs.settings.pythonExecutable='global-python';assert.equal(await environments.resolve(),'global-python');assert.equal(await environments.resolve({pythonExecutable:'profile-python'}),'profile-python');assert.equal(await environments.resolve({pythonExecutable:'.venv/bin/custom-python'}),path.resolve(data,'.venv/bin/custom-python'));
 const env=environments.env(local,{PATH:'override-path',EXTRA:'yes'});assert.equal(Object.keys(env).filter(k=>k.toUpperCase()==='PATH').length,1);assert(env.PATH.startsWith(path.dirname(local)+path.delimiter));assert(env.PATH.endsWith('override-path'));assert.equal(env.PYTHONUTF8,'1');assert.equal(env.EXTRA,'yes');assert(!environments.env('python').PATH.startsWith('.'+path.delimiter));
});

test('Python environment metadata reports the actual selected interpreter',{skip:!process.env.DEVFORGE_TEST_PYTHON},async()=>{
 const host={ws:{data:os.tmpdir(),prefs:{settings:{}}},tools:{env:()=>process.env}},environments=new PythonEnvironments(host),info=await environments.info({pythonExecutable:process.env.DEVFORGE_TEST_PYTHON});
 assert(info.available);assert(info.version);assert(info.prefix);assert(info.sitePackages);assert(path.isAbsolute(info.path));
});


test('interpreter picker deduplicates executable aliases for the same environment',async()=>{
 const host={ws:{data:os.tmpdir(),prefs:{settings:{}}}},environments=new PythonEnvironments(host);
 environments.resolve=async()=> 'selected';environments.candidates=async()=>['selected','alias','other'];environments.info=async({pythonExecutable})=>({available:true,path:pythonExecutable,version:'3.12.6',prefix:path.join(os.tmpdir(),pythonExecutable==='other'?'venv-other':'same-prefix')});
 const items=await environments.list();assert.equal(items.length,2);assert.equal(items[0].path,'selected');assert.equal(items[1].path,'other');
});
