'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Workspace,key}=require('../workspace.cjs'),{DesktopHost}=require('../host.cjs');
async function fixture(t){const data=await fs.mkdtemp(path.join(os.tmpdir(),'devforge-workspace-create-')),ws=await new Workspace(data).init();t.after(()=>fs.rm(data,{recursive:true,force:true}));return{data,ws};}
test('promoting a folder persists a managed workspace without losing native identity, history or session',async t=>{
 const {data,ws}=await fixture(t),id=(await ws.newProject('original','empty')).project,root=ws.root,other=path.join(data,'other');await fs.mkdir(other);const file=path.join(root,'code.cpp');await ws.write(file,'original');await ws.read(file);await ws.write(file,'edited');ws.prefs.session={project:id,active:file};
 const promoted=await ws.createWorkspace({folders:[{path:root},{path:other,name:'Second'},{path:other}],settings:{'window.fixture':42}});assert.equal(promoted.project,id);assert.equal(ws.root,root);assert.equal(ws.folders.length,2);assert.equal(ws.prefs.session.active,file);assert.equal((await ws.history(file))[0].text,'original');assert.equal((await ws.read(file)).text,'edited');
 const stored=JSON.parse(await fs.readFile(ws.workspaceFile,'utf8'));assert.equal(stored.settings['window.fixture'],42);assert.equal(stored.folders[1].name,'Second');assert(ws.workspaceFile.startsWith(data.replaceAll('\\','/').replace(/^[A-Z]:/,m=>m.toLowerCase())+'/workspace-files/'));
 const reopened=await new Workspace(data).init();assert.equal(reopened.workspaceFile,ws.workspaceFile);assert.equal(reopened.root,root);await reopened.openWorkspace(ws.workspaceFile);assert.equal(reopened.root,root);assert.equal((await reopened.open(root)).project===id,false);
});
test('empty windows and removal of the only folder have persistent empty workspace identities',async t=>{
 const {ws,data}=await fixture(t);await ws.createWorkspace({folders:[]});const id=ws.prefs.current;assert(id);assert(ws.workspaceFile);assert.deepEqual(ws.folders,[]);assert.deepEqual(await ws.tree(),[]);
 const next=await new Workspace(path.join(data,'second')).init();await next.newProject('one','empty');const root=next.root;await next.createWorkspace({folders:[]});assert.equal(next.root,root);assert.deepEqual(next.folders,[]);
});
test('invalid creation, readers, occupied filenames and profile junctions cannot change the current project',async t=>{
 const {ws,data}=await fixture(t);await ws.newProject('one','empty');const before=JSON.stringify(ws.prefs),file=path.join(data,'existing.code-workspace');await fs.writeFile(file,'keep');
 for(const request of [{folders:[{path:'relative'}]},{folders:[{path:ws.root,name:''}]},{folders:[],settings:[]},{folders:[],file}])await assert.rejects(ws.createWorkspace(request));assert.equal(JSON.stringify(ws.prefs),before);assert.equal(await fs.readFile(file,'utf8'),'keep');
 ws.projectReadOnly=true;await assert.rejects(ws.createWorkspace({folders:[]}),/READ_ONLY/);ws.projectReadOnly=false;const outside=path.join(data,'outside');await fs.mkdir(outside);await fs.symlink(outside,path.join(data,'workspace-files'),process.platform==='win32'?'junction':'dir');await assert.rejects(ws.createWorkspace({folders:[]}),/cannot be a link/);assert.deepEqual(await fs.readdir(outside),[]);
});
test('native workspace creation preflights cross-window conflicts and stale project requests',async t=>{
 const {data}=await fixture(t),host=await new DesktopHost(path.join(data,'profile'),()=>{},{workspaceFoldersInUse:()=>true}).init();t.after(()=>host.close());await host.ws.newProject('one','empty');const id=host.ws.prefs.current,record=structuredClone(host.ws.prefs.projects[id]);
 await assert.rejects(host.handle('workspaceCreate',{project:id,folders:[{path:host.ws.root}]}),/PROJECT_IN_USE/);await assert.rejects(host.handle('workspaceCreate',{project:'stale',folders:[]}),/Workspace changed/);assert.deepEqual(host.ws.prefs.projects[id],record);
});
test('failed preference persistence rolls promotion back without changing source files',async t=>{
 const {ws}=await fixture(t);await ws.newProject('original','empty');const id=ws.prefs.current,record=structuredClone(ws.prefs.projects[id]),root=ws.root,file=path.join(root,'keep.txt');await ws.write(file,'keep these bytes');ws.persist=async()=>{throw Error('fixture persistence failure');};await assert.rejects(ws.createWorkspace({folders:[{path:root}]}),/persistence failure/);assert.equal(ws.prefs.current,id);assert.deepEqual(ws.prefs.projects[id],record);assert.equal(await fs.readFile(file,'utf8'),'keep these bytes');
});
test('the browser workspace adapter preserves upstream window settings and passes named roots to native creation',async()=>{
 const {installWorkspaceCreation}=await import('../compat/workspace-creation.js'),calls=[],old=async()=> 'old',editing={createAndEnterWorkspace:old},folders=[{uri:{path:'/one'},name:'One'}];
 const binding=installWorkspaceCreation({editing,context:{getWorkbenchState:()=>2},configuration:{keys:()=>({workspace:['window.key','folder.key','unknown']}),inspect:key=>({workspaceValue:key+' value'})},properties:()=>({'window.key':{scope:3},'folder.key':{scope:4}}),windowScope:3,create:async(...args)=>{calls.push(args);return true;}});
 assert.equal(await editing.createAndEnterWorkspace(folders),true);assert.deepEqual(calls,[[folders,{target:undefined,settings:{'window.key':'window.key value'}}]]);binding.dispose();assert.equal(editing.createAndEnterWorkspace,old);
});

test('workspace host shutdown waits for pending initialization without starting idle lazy hosts',async()=>{
 const {stopExtensionHosts}=await import('../compat/workspace-creation.js'),stopped=[];let release,ready=false,forced=false;
 let cancel,reply;const configuration=new Promise(resolve=>{reply=()=>{delete starting._rpcProtocol._pendingRPCReplies[1];resolve();};}),activation=new Promise((_,reject)=>{cancel=reject;}),starting={_rpcProtocol:{_pendingRPCReplies:{1:{_promise:configuration}}},_cachedActivationEvents:new Map([['startup',activation]]),ready:()=>new Promise(resolve=>{release=()=>{ready=true;resolve();};})},idle={_actual:null,ready:()=>{forced=true;throw Error('Idle lazy host was forced to start');}},lazy={_actual:{ready:async()=>{}}};
 const task=stopExtensionHosts({_extensionHostManagers:{getByKind:()=>[starting,idle,lazy],stopOne:async host=>{assert(ready);if(host===starting){const error=Error('Canceled');error.name='Canceled';cancel(error);}stopped.push(host);}}},[1]);
 await Promise.resolve();assert.equal(stopped.length,0);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(stopped.length,0);reply();await task;assert.equal(forced,false);assert.deepEqual(stopped,[starting,idle,lazy]);
});
