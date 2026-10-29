'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {DesktopHost}=require('../host.cjs'),{Workspace}=require('../workspace.cjs');
async function fixture(t){const data=await fs.mkdtemp(path.join(os.tmpdir(),'devforge-project-library-')),host=await new DesktopHost(data).init();await host.ws.newProject('project');t.after(async()=>{await host.close();await fs.rm(data,{recursive:true,force:true,maxRetries:10,retryDelay:100});});return host;}
test('permanent deletion requires the name and removes only the confirmed project',async t=>{const host=await fixture(t),id=host.ws.prefs.current,project=await host.handle('projectDescribe',{id});await assert.rejects(host.handle('projectDelete',{id,path:project.path,confirmName:'wrong'}),/project name/);assert((await fs.stat(project.path)).isDirectory());const sibling=path.join(path.dirname(project.path),'keep-this');await fs.mkdir(sibling);await fs.writeFile(path.join(sibling,'file.txt'),'retain');const result=await host.handle('projectDelete',{id,path:project.path,confirmName:project.label});assert(result.deleted);await assert.rejects(fs.access(project.path));assert.equal((await host.handle('projectArchive')).length,0);assert.equal(await fs.readFile(path.join(sibling,'file.txt'),'utf8'),'retain');});
test('remove from list retains files, remains removed after restart and can be restored',async t=>{
 const host=await fixture(t),id=host.ws.prefs.current,description=await host.handle('projectDescribe',{id}),file=path.join(description.path,'main.cpp'),original=await fs.readFile(file);
 const result=await host.handle('projectRemove',{id,path:description.path,mode:'forget'});assert.equal(result.state.project,'');assert(!result.state.projects.includes(id));assert.deepEqual(await fs.readFile(file),original);
 const cold=await new Workspace(host.ws.data).init();assert.equal(cold.prefs.current,'');assert(!cold.prefs.projects[id]);assert.equal((await host.handle('projectArchive'))[0].mode,'forget');
 const restored=await host.handle('projectRestore',{id:result.removed});assert(restored.projects.includes(id));assert.equal(restored.project,'');assert.deepEqual(await fs.readFile(file),original);
});
test('project trash moves and restores exact bytes, rejects occupied destinations',async t=>{
 const host=await fixture(t),id=host.ws.prefs.current,project=await host.handle('projectDescribe',{id});await host.ws.write('binary.dat','preserve me');const result=await host.handle('projectRemove',{id,path:project.path,mode:'trash'});
 await assert.rejects(fs.access(project.path));const record=host.ws.prefs.projectArchive[0];assert.equal(await fs.readFile(path.join(record.stored,'binary.dat'),'utf8'),'preserve me');await fs.mkdir(project.path);await fs.writeFile(path.join(project.path,'retain.txt'),'other folder');
 await assert.rejects(host.handle('projectRestore',{id:result.removed}),/occupied/);assert.equal(await fs.readFile(path.join(project.path,'retain.txt'),'utf8'),'other folder');await fs.unlink(path.join(project.path,'retain.txt'));await fs.rmdir(project.path);
 await host.handle('projectRestore',{id:result.removed});assert.equal(await fs.readFile(path.join(project.path,'binary.dat'),'utf8'),'preserve me');assert.equal((await host.handle('projectArchive')).length,0);
});
test('project removal rejects stale paths, busy tools and ancestors of registered projects',async t=>{
 const host=await fixture(t),id=host.ws.prefs.current,project=await host.handle('projectDescribe',{id});await assert.rejects(host.handle('projectRemove',{id,path:project.path+'/other',mode:'trash'}),/changed/);
 host.python.busy=true;await assert.rejects(host.handle('projectRemove',{id,path:project.path,mode:'forget'}),/Stop/);host.python.busy=false;
 await fs.mkdir(path.join(project.path,'nested'));await host.ws.open(path.join(project.path,'nested'));assert.equal((await host.handle('projectDescribe',{id})).canTrash,false);await assert.rejects(host.handle('projectRemove',{id,path:project.path,mode:'trash'}),/another registered/);assert((await fs.stat(project.path)).isDirectory());
 const protectedProject=await host.ws.open(host.ws.data);assert.equal((await host.handle('projectDescribe',{id:protectedProject.project})).canTrash,false);
});
test('a failed metadata save rolls a folder move back',async t=>{
 const host=await fixture(t),id=host.ws.prefs.current,project=await host.handle('projectDescribe',{id}),persist=host.ws.persist.bind(host.ws);host.ws.persist=async()=>{throw Error('simulated disk failure');};
 await assert.rejects(host.handle('projectRemove',{id,path:project.path,mode:'trash'}),/disk failure/);host.ws.persist=persist;assert((await fs.stat(project.path)).isDirectory());assert(host.ws.prefs.projects[id]);assert.equal(host.ws.prefs.current,id);assert.equal((await host.handle('projectArchive')).length,0);
});
