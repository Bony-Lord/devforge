'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
test('extension resolution precedes text fallback and preserves virtual schemes and editor picks',async t=>{
 const {installEditorRouting}=await import('../compat/editor-routing.js');
 const originalFrame=global.requestAnimationFrame;
 global.requestAnimationFrame=fn=>setImmediate(fn);t.after(()=>{global.requestAnimationFrame=originalFrame;});
 const events=[],main={id:7},side={id:8},service={openEditor:async input=>{events.push(['native',input]);return 'native';}};
 const routing=installEditorRouting({editorService:service,resolver:{getEditorMatches:resource=>({defaultRule:{editor:{id:resource.path.endsWith('.custom')?'fixture.custom':'default'}}})},extensions:{whenInstalledExtensionsRegistered:async()=>{}},groups:{mainPart:{activeGroup:main,sideGroup:side,getGroup:id=>id===7?main:undefined}},showEditor:async()=>events.push(['mount']),openWorkbench:async(input,options,group)=>{events.push(['workbench',input,group]);return 'workbench';}});
 const file={scheme:'vscode-remote',path:'/project/file.cpp'};
 assert.equal(await routing.openResource(file),false);
 assert.equal(await service.openEditor({resource:file}),'native');
 const custom={scheme:'vscode-remote',path:'/project/file.custom'};
 assert.equal(await routing.openResource(custom),true);
 assert.equal(events.at(-1)[1].resource,custom);
 assert.equal(events.at(-2)[0],'mount');
 for(const scheme of ['untitled','fixture-memory','git']){
  const resource={scheme,path:'/virtual/file.cpp'};
  assert.equal(await service.openEditor({resource}),'workbench');
  assert.equal(events.at(-1)[1].resource,resource);
 }
 assert.equal(await service.openEditor({resource:file,options:{override:0}}),'workbench');
 assert.equal(await service.openEditor({resource:custom,options:{override:'default'}}),'native');
 assert.equal(await service.openEditor({resource:file,options:{override:1}}),'native');
 assert.equal(await service.openEditor({resource:custom,options:{override:1}}),'native');
 assert.equal(await service.openEditor({resource:file,options:{override:'fixture.custom'}},-2),'workbench');
 assert.equal(events.at(-1)[2],side);
 assert.equal(await service.openEditor({original:{resource:file},modified:{resource:custom}}),'workbench');
});
test('engine validation checks the client API rather than the newer Node server',()=>{
 const {assertCompatible}=require('../vsix-upstream.cjs');
 assert.equal(assertCompatible({publisher:'fixture',name:'supported',engines:{vscode:'^1.100.0'}}).engineCompatible,true);
 assert.throws(()=>assertCompatible({publisher:'fixture',name:'newer',engines:{vscode:'^1.143.0'}}),/VSX_ENGINE_INCOMPATIBLE.*1\.143\.0.*1\.142\.0/);
});
test('bundle activation rejects a newer engine even when stored compatibility metadata is stale',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{VSCodeRuntime}=require('../vscode-runtime.cjs');
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'devforge-engine-'));
 t.after(()=>fs.rm(data,{recursive:true,force:true}));
 const id='vscode.fixture.newer',bundle='a'.repeat(64),manifest={id,version:'1.0.0',vscode:{bundle,compatibility:{engineCompatible:true}}};
 const runtime=new VSCodeRuntime({system:{codeossEnabled:()=>true},ws:{data},addons:{data:{packages:[{accepted:true,package:{manifest}}],profile:{resolved:[id]}}}});
 const folder=path.join(runtime.storage,bundle);await fs.mkdir(folder,{recursive:true});
 await fs.writeFile(folder+'.ready.json',JSON.stringify({id,version:manifest.version}));
 await fs.writeFile(path.join(folder,'package.json'),JSON.stringify({publisher:'fixture',name:'newer',version:'1.0.0',engines:{vscode:'^1.143.0'}}));
 await assert.rejects(runtime.handle('vscodeBundle',{id,dataOnly:true}),/VSX_ENGINE_INCOMPATIBLE/);
});
