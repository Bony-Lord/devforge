'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Workspace}=require('../workspace.cjs'),{FileOperationEvents}=require('../file-operation-events.cjs');
async function fixture(t,receive){
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'devforge-file-events-')),ws=await new Workspace(data).init();await ws.newProject('files','empty');
 const events=[],bridge=new FileOperationEvents(ws,(name,message)=>{events.push(message);queueMicrotask(async()=>{try{await receive?.(message,ws);bridge.reply({id:message.id});}catch(error){bridge.reply({id:message.id,error:error.message});}});});bridge.enabled=true;
 t.after(()=>{bridge.close();return fs.rm(data,{recursive:true,force:true});});return{data,ws,bridge,events};
}
test('native commit is surrounded by acknowledged before/after events with exact paths',async t=>{
 let target;const {ws,bridge,events}=await fixture(t,async message=>assert.equal(await fs.stat(target).then(()=>true,()=>false),message.phase==='after'));
 target=path.join(ws.root,'created.txt');assert.equal(await bridge.run('create',[{target}],async()=>{await fs.writeFile(target,'exact');return 42;}),42);
 assert.deepEqual(events.map(e=>e.phase),['before','after']);assert.equal(events[0].transaction,events[1].transaction);assert.notEqual(events[0].id,events[1].id);
 assert.throws(()=>bridge.reply({id:events[0].id}),/expired/);
});
test('participant rejection and late read-only changes never run the filesystem commit',async t=>{
 let reject=true;const {ws,bridge,events}=await fixture(t,async message=>{if(message.phase==='before'){if(reject)throw Error('participant rejected');ws.projectReadOnly=true;}});
 const target=path.join(ws.root,'never.txt');let commits=0;
 await assert.rejects(bridge.run('create',[{target}],async()=>commits++),/participant rejected/);
 reject=false;await assert.rejects(bridge.run('create',[{target}],async()=>commits++),/READ_ONLY/);
 assert.equal(commits,0);assert.deepEqual(events.map(e=>e.phase),['before','before','failed']);
});
test('paths are revalidated after participants, including junction substitution',async t=>{
 let outside,parent,retained;const {data,ws,bridge,events}=await fixture(t,async message=>{if(message.phase==='before'){await fs.rename(parent,retained);await fs.symlink(outside,parent,process.platform==='win32'?'junction':'dir');}});
 outside=path.join(data,'outside');parent=path.join(ws.root,'parent');retained=path.join(ws.root,'retained');await fs.mkdir(parent);await fs.mkdir(outside);await fs.writeFile(path.join(outside,'keep.txt'),'keep');
 let committed=false;await assert.rejects(bridge.run('create',[{target:path.join(parent,'new.txt')}],async()=>{committed=true;}),/outside|changed/i);
 assert.equal(committed,false);assert.equal(await fs.readFile(path.join(outside,'keep.txt'),'utf8'),'keep');assert.deepEqual(events.map(e=>e.phase),['before','failed']);
});
test('closing the owning window rejects pending participation and releases its timer',async()=>{
 const ws={root:'C:/project',assertEditable(){}},bridge=new FileOperationEvents(ws,()=>{});bridge.enabled=true;let committed=false;
 const operation=bridge.run('create',[{target:'C:/project/new.txt'}],async()=>{committed=true;});bridge.close();
 await assert.rejects(operation,/window closed/);assert.equal(committed,false);assert.equal(bridge.pending.size,0);
});
