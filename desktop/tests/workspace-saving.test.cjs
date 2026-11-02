'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Workspace}=require('../workspace.cjs'),saving=require('../workspace-saving.cjs'),{CodeOSSStorage}=require('../codeoss-storage.cjs');
const {DesktopHost}=require('../host.cjs');
async function fixture(t){const data=await fs.mkdtemp(path.join(os.tmpdir(),'devforge-workspace-save-'));t.after(async()=>{assert.equal(path.dirname(await fs.realpath(data)),await fs.realpath(os.tmpdir()));await fs.rm(data,{recursive:true,force:true});});const ws=await new Workspace(data).init();await ws.newProject('original','empty');await ws.createWorkspace({folders:[{path:ws.root,name:'Original'}],settings:{'test.value':42}});const original=await fs.readFile(ws.workspaceFile,'utf8');await fs.writeFile(ws.workspaceFile,'// retained comment\n'+original);return{data,ws};}
async function request(ws,file){const current=await saving.snapshot(ws);return{project:current.project,source:current.source,sourceHash:current.hash,file,text:current.text};}

test('Save Workspace As preserves native identity, source bytes, comments, history and reload metadata',async t=>{
 const {ws,data}=await fixture(t),root=ws.root,id=ws.prefs.current,source=ws.workspaceFile,bytes=await fs.readFile(source),destination=path.join(data,'saved','new.code-workspace');await ws.write('keep.cpp','first');await ws.read(path.join(root,'keep.cpp'));await ws.write('keep.cpp','second');ws.prefs.session={project:id,tabs:[path.join(root,'keep.cpp')]};
 await saving.save(ws,await request(ws,destination));assert.equal(ws.prefs.current,id);assert.equal(ws.root,root);assert.deepEqual(await fs.readFile(source),bytes);assert.match(await fs.readFile(destination,'utf8'),/^\/\/ retained comment/);assert.equal((await ws.history(path.join(root,'keep.cpp')))[0].text,'first');
 const cold=await new Workspace(data).init();assert.equal(cold.workspaceFile,ws.workspaceFile);assert.equal(cold.root,root);await cold.openWorkspace(destination);assert.equal(cold.root,root);assert.deepEqual(cold.prefs.session,ws.prefs.session);
});

test('read-only, stale, conflicting and changed destinations are rejected before mutation',async t=>{
 const {ws,data}=await fixture(t),destination=path.join(data,'destination.code-workspace'),d=await request(ws,destination),before=JSON.stringify(ws.prefs);await fs.writeFile(destination,'retain destination');
 await assert.rejects(saving.save(ws,d),/destination changed|already exists/);const selected=await saving.target(destination);await fs.writeFile(destination,'external replacement');await assert.rejects(saving.save(ws,{...d,targetHash:selected.hash}),/destination changed/);
 ws.projectReadOnly=true;await assert.rejects(saving.save(ws,d),/READ_ONLY/);ws.projectReadOnly=false;await assert.rejects(saving.save(ws,{...d,project:'stale'}),/Workspace changed/);
 await assert.rejects(saving.save(ws,{...d,file:path.join(data,'other.code-workspace')},{inUse:()=>true}),/PROJECT_IN_USE/);
 await assert.rejects(saving.save(ws,{...d,file:path.join(data,'other.code-workspace'),text:'{"folders":[null]}'}),/Invalid workspace folder/);
 assert.equal(await fs.readFile(destination,'utf8'),'external replacement');assert.equal(JSON.stringify(ws.prefs),before);
});

test('a failed preference save restores an overwritten target and rolls transferred storage back',async t=>{
 const {ws,data}=await fixture(t),destination=path.join(data,'replace.code-workspace');await fs.writeFile(destination,'keep these original bytes');const selected=await saving.target(destination),d=await request(ws,destination),before=JSON.stringify(ws.prefs);let rolledBack=false;
 ws.persist=async()=>{throw Error('fixture persistence failure');};await assert.rejects(saving.save(ws,{...d,targetHash:selected.hash},{transfer:async()=>async()=>{rolledBack=true;}}),/persistence failure/);
 assert(rolledBack);assert.equal(await fs.readFile(destination,'utf8'),'keep these original bytes');assert.equal(JSON.stringify(ws.prefs),before);
});

test('an already-open confirmed destination can be saved again against its newly committed bytes',async t=>{
 const {ws}=await fixture(t),file=path.join(ws.root,'previous.code-workspace');await ws.write(file,'{"folders":[]}','UTF-16LE');await ws.read(file,'UTF-16LE');const selection=await saving.target(file),d=await request(ws,file);await saving.save(ws,{...d,targetHash:selection.hash});await ws.write(file,'// saved again\n'+d.text);assert.match(await fs.readFile(file,'utf8'),/^\/\/ saved again/);assert.equal(ws.prefs.encodings[ws.workspaceFile],'UTF-8');
});

test('a source change while storage is copied aborts without replacing external bytes',async t=>{
 const {ws,data}=await fixture(t),file=path.join(data,'new.code-workspace'),d=await request(ws,file);let rolledBack=false;
 await assert.rejects(saving.save(ws,d,{transfer:async()=>{await fs.writeFile(ws.workspaceFile,'// external edit\n'+d.text);return async()=>{rolledBack=true;};}}),/changed during saving/);
 assert(rolledBack);assert.match(await fs.readFile(ws.workspaceFile,'utf8'),/^\/\/ external edit/);assert.equal(await fs.stat(file).then(()=>true,()=>false),false);
});

test('workspace storage transfer copies mementos and real files, backs up the destination, and can roll back',async t=>{
 const {data}=await fixture(t),store=new CodeOSSStorage(data),home=path.join(data,'codeoss','user','User','workspaceStorage'),source=path.join(home,'devforge-a'),destination=path.join(home,'devforge-b');await fs.mkdir(path.join(source,'fixture.extension'),{recursive:true});await fs.mkdir(path.join(destination,'fixture.extension'),{recursive:true});
 await fs.writeFile(path.join(source,'meta.json'),JSON.stringify({id:'devforge-a',configuration:'file:///old'}));await fs.writeFile(path.join(source,'fixture.extension','state.bin'),Buffer.from([0,255,31]));await fs.writeFile(path.join(destination,'fixture.extension','state.bin'),'previous target');
 await store.handle({scope:'workspace:source',insert:[['fixture','source-state']]});await store.handle({scope:'workspace:target',insert:[['previous','target-state']]});
 const rollback=await store.transferWorkspace({from:'source',to:'target',fromId:'devforge-a',toId:'devforge-b'});assert.deepEqual(await store.handle({scope:'workspace:target',action:'read'}),[['fixture','source-state']]);assert.deepEqual(await fs.readFile(path.join(destination,'fixture.extension','state.bin')),Buffer.from([0,255,31]));assert.equal(JSON.parse(await fs.readFile(path.join(destination,'meta.json'),'utf8')).id,'devforge-b');
 await rollback();assert.deepEqual(await store.handle({scope:'workspace:target',action:'read'}),[['previous','target-state']]);assert.equal(await fs.readFile(path.join(destination,'fixture.extension','state.bin'),'utf8'),'previous target');assert.deepEqual(await store.handle({scope:'workspace:source',action:'read'}),[['fixture','source-state']]);assert.deepEqual(await fs.readFile(path.join(source,'fixture.extension','state.bin')),Buffer.from([0,255,31]));
});

test('switching projects during storage transfer cannot steal the new current project',async t=>{
 const {ws,data}=await fixture(t),d=await request(ws,path.join(data,'not-adopted.code-workspace')),second=(await ws.newProject('second','empty',false)).project;let rolledBack=false;
 await assert.rejects(saving.save(ws,d,{transfer:async()=>{ws.prefs.current=second;return async()=>{rolledBack=true;};}}),/Workspace changed during saving/);assert(rolledBack);assert.equal(ws.prefs.current,second);assert.equal(ws.workspaceFile,'');assert.equal(await fs.stat(d.file).then(()=>true,()=>false),false);
});

test('workspace storage migration rejects junctions and unrelated scopes without touching their contents',async t=>{
 const {data}=await fixture(t),store=new CodeOSSStorage(data),home=path.join(data,'codeoss','user','User','workspaceStorage'),outside=path.join(data,'outside');await fs.mkdir(home,{recursive:true});await fs.mkdir(outside);await fs.writeFile(path.join(outside,'keep'),'unique');await fs.symlink(outside,path.join(home,'devforge-a'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(store.transferWorkspace({from:'source',to:'target',fromId:'devforge-a',toId:'devforge-b'}),/follow links/);await assert.rejects(store.transferWorkspace({from:'source',to:'target',fromId:'devforge-a',toId:'devforge-b',fromScope:'encrypted-secrets'}),/scope/);assert.equal(await fs.readFile(path.join(outside,'keep'),'utf8'),'unique');
});

test('waiting for a previous host lock leaves the storage queue available for its final state update',async t=>{
 const {data}=await fixture(t),store=new CodeOSSStorage(data),directory=path.join(data,'codeoss','user','User','workspaceStorage','devforge-a');await fs.mkdir(directory,{recursive:true});const lock=path.join(directory,'vscode.lock');await fs.writeFile(lock,JSON.stringify({pid:process.pid}));
 const moving=store.transferWorkspace({from:'source',to:'target',fromId:'devforge-a',toId:'devforge-b'}),finishing=store.handle({scope:'workspace:source',insert:[['last','saved before exit']]}).then(async()=>{await fs.unlink(lock);});await finishing;await moving;assert.deepEqual(await store.handle({scope:'workspace:target',action:'read'}),[['last','saved before exit']]);
});

test('the workspace save adapter uses the host picker, preserves same-file saves and restores its methods',async()=>{
 const {installWorkspaceSaving}=await import('../compat/workspace-creation.js'),calls=[],originalPick=async()=>null,originalSave=async value=>calls.push(['same',value]),editing={pickNewWorkspacePath:originalPick,saveAndEnterWorkspace:originalSave};
 const adapter=installWorkspaceSaving({editing,context:{getWorkspace:()=>({configuration:'old'})},pick:async()=> 'new',save:async value=>calls.push(['save',value]),equals:(a,b)=>a===b});assert.equal(await editing.pickNewWorkspacePath(),'new');await editing.saveAndEnterWorkspace('old');await editing.saveAndEnterWorkspace('new');assert.deepEqual(calls,[['same','old'],['save','new']]);adapter.dispose();assert.equal(editing.pickNewWorkspacePath,originalPick);assert.equal(editing.saveAndEnterWorkspace,originalSave);
});

test('the native picker retains overwrite confirmation and does not grant it to an auto-appended filename',async t=>{
 const {data}=await fixture(t),file=path.join(data,'selected.code-workspace');await fs.writeFile(file,'keep original');let selection=file;
 const host=await new DesktopHost(path.join(data,'picker'),()=>{},{chooseWorkspaceSave:async()=>selection}).init();t.after(()=>host.close());const selected=await host.handle('workspaceSaveTarget');assert.equal(selected.path,file.replaceAll('\\','/').replace(/^[A-Z]:/,m=>m.toLowerCase()));assert.equal(typeof selected.hash,'string');
 selection=file.slice(0,-'.code-workspace'.length);await assert.rejects(host.handle('workspaceSaveTarget'),/full filename/);selection=null;assert.equal(await host.handle('workspaceSaveTarget'),null);assert.equal(await fs.readFile(file,'utf8'),'keep original');
});
