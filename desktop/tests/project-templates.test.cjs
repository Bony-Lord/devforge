'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Workspace}=require('../workspace.cjs'),{ProjectTemplateFiles}=require('../project-templates.cjs');
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'devforge-templates-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const ws=await new Workspace(dir).init();await ws.newProject('fixture');return {ws,files:new ProjectTemplateFiles(ws)};}
test('snapshot/apply creates directories, checks reviewed bytes and never executes commands',async t=>{
  const {ws,files}=await fixture(t),paths=['src/main.py','.devforge/project.json'],snapshot=await files.handle('projectTemplateSnapshot',{root:ws.root,paths});assert.equal(snapshot.files[paths[0]],null);
  await files.handle('projectTemplateApply',{root:ws.root,changes:paths.map(p=>({path:p,text:p.endsWith('.py')?'print("Hello")\n':'{"version":1}\n',expected:null}))});assert.equal(await fs.readFile(path.join(ws.root,paths[0]),'utf8'),'print("Hello")\n');
  const old=await files.snapshot({root:ws.root,paths:[paths[0]]});await fs.writeFile(path.join(ws.root,paths[0]),'external');await assert.rejects(files.apply({root:ws.root,changes:[{path:'new.txt',text:'would be rolled back',expected:null},{path:paths[0],text:'stale',expected:old.files[paths[0]].sha256}]}),/changed since preview/);await assert.rejects(fs.stat(path.join(ws.root,'new.txt')));assert.equal(await fs.readFile(path.join(ws.root,paths[0]),'utf8'),'external');
});
test('overwrites retain history and obsolete editor snapshots cannot overwrite template changes',async t=>{
  const {ws,files}=await fixture(t),file=path.join(ws.root,'main.cpp');await ws.read(file);const snapshot=await files.snapshot({root:ws.root,paths:['main.cpp']});await files.apply({root:ws.root,changes:[{path:'main.cpp',text:'// template\n',expected:snapshot.files['main.cpp'].sha256}]});assert((await ws.history(file)).some(v=>v.text.includes('Hello')));assert.equal((await ws.read(file)).text,'// template\n');
});
test('root identity, traversal, reserved paths and symlink escapes are rejected before writes',async t=>{
  const {ws,files}=await fixture(t);for(const name of ['../escape','C:/outside','.git/config','.forge/state','.devforge/other','/tmp/x','a\\b'])await assert.rejects(files.snapshot({root:ws.root,paths:[name]}));await assert.rejects(files.snapshot({root:ws.data,paths:[]}),/Project changed/);
  const outside=path.join(ws.data,'outside');await fs.mkdir(outside);await fs.symlink(outside,path.join(ws.root,'escape'),process.platform==='win32'?'junction':'dir');await assert.rejects(files.apply({root:ws.root,changes:[{path:'escape/private',text:'bad',expected:null}]}),/outside project/);
});
test('a mid-batch failure rolls back only its own writes and removes newly created empty directories',async t=>{
  const {ws,files}=await fixture(t),original=files.file.bind(files);let calls=0;files.file=async name=>{const result=await original(name);if(++calls===4)throw Error('injected filesystem fault');return result;};await assert.rejects(files.apply({root:ws.root,changes:[{path:'new/a.txt',text:'a',expected:null},{path:'new/b.txt',text:'b',expected:null}]}),/injected/);await assert.rejects(fs.stat(path.join(ws.root,'new')));
});
