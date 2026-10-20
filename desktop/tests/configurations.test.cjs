'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {DesktopHost}=require('../host.cjs');const {validate}=require('../project-config.cjs');
test('configuration validation rejects duplicate IDs, unsupported switches and invalid environment',()=>{
  const base={version:1,profiles:[{id:'debug',name:'Debug',buildType:'Debug'}],runs:[{id:'run',name:'Demo',kind:'cmake'}]};assert.equal(validate(base).profiles[0].compiler,'');
  assert.throws(()=>validate({...base,profiles:[...base.profiles,...base.profiles]}),/Duplicate/);
  assert.throws(()=>validate({...base,profiles:[{...base.profiles[0],cmakeOptions:['-S/outside']}]}),/CMake options/);
  assert.throws(()=>validate({...base,runs:[{...base.runs[0],environment:{'NOT A KEY':'x'}}]}),/environment/);
});
test('real named CMake target, custom artifact path, separate profiles and run context',{timeout:120000},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-config-')),events=[];const host=await new DesktopHost(dir,(type,data)=>events.push({type,data})).init();
  t.after(async()=>{await host.close();await new Promise(r=>setTimeout(r,700));await fs.rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:200});});
  if(process.env.CPP_STUDIO_NINJA){host.ws.prefs.settings.toolPaths={ninja:process.env.CPP_STUDIO_NINJA};await host.tools.discover();}
  if(!host.tools.tools.cmake||!host.tools.tools.ninja||!host.tools.tools.gxx&&!host.tools.tools.clangxx)return t.skip('CMake and compiler required');
  await host.ws.newProject('named-target Кириллица');const root=host.ws.root,file=path.join(root,'main.cpp');
  await host.handle('write',{path:file,text:'#include <cstdlib>\n#include <fstream>\n#include <iostream>\nint main(int argc,char** argv){int x=0;std::ifstream("data.txt")>>x;std::cout<<x<<"|"<<(argc>1?argv[1]:"")<<"|"<<std::getenv("STUDIO_SAMPLE")<<"|"<<STUDIO_OPTION;return x==42?0:2;}\n'});
  await host.handle('write',{path:path.join(root,'CMakeLists.txt'),text:'cmake_minimum_required(VERSION 3.22)\nproject(DesktopDemo LANGUAGES C CXX)\nadd_executable(DesktopDemo main.cpp)\nset_target_properties(DesktopDemo PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/custom bin")\ntarget_compile_definitions(DesktopDemo PRIVATE STUDIO_OPTION=${STUDIO_OPTION})\nadd_executable(BrokenOther broken.cpp)\n'});
  await host.handle('newFile',{path:'broken.cpp',text:'#error This target must not be built\n'});await host.handle('newFolder',{path:'fixtures'});await host.handle('newFile',{path:'fixtures/data.txt',text:'42'});
  const configuration={version:1,profiles:[{id:'debug',name:'Debug',buildType:'Debug',compiler:host.tools.tools.gxx?'gcc':'clang',cmakeOptions:['-DSTUDIO_OPTION=77']},{id:'release',name:'Release',buildType:'Release',compiler:host.tools.tools.gxx?'gcc':'clang',cmakeOptions:['-DSTUDIO_OPTION=88']}],runs:[{id:'demo',name:'Demo',kind:'cmake',target:'DesktopDemo',args:['argument with spaces'],workingDirectory:'fixtures',environment:{STUDIO_SAMPLE:'environment value'}}]};
  await host.handle('saveConfigurations',{configuration,profile:'debug',run:'demo'});
  for(const profile of ['debug','release']){
    await host.handle('selectConfiguration',{profile});const spec=await host.handle('resolveConfiguration',{path:file}),built=await host.handle('build',{...spec,id:'build-'+profile});assert.equal(built.code,0,JSON.stringify(events));assert.match(built.executable,/custom bin\/DesktopDemo/);assert.ok(built.exists);
    const model=await host.handle('projectConfigurations');assert.ok(model.targets.some(t=>t.name==='DesktopDemo'&&t.type==='EXECUTABLE'));assert.ok((await host.tools.cmakeModel(spec.options)).files.some(f=>f.endsWith('/main.cpp')));
    await host.handle('run',{executable:built.executable,args:spec.args,cwd:spec.cwd,environment:spec.environment,id:profile});const end=Date.now()+15000;while(!events.some(e=>e.type==='exit'&&e.data.id===profile)){if(Date.now()>end)throw Error('Run timed out');await new Promise(r=>setTimeout(r,20));}
    assert.equal(events.find(e=>e.type==='exit'&&e.data.id===profile).data.code,0);assert.match(events.filter(e=>e.type==='output'&&e.data.id===profile).map(e=>e.data.text).join(''),new RegExp('42\\|argument with spaces\\|environment value\\|'+(profile==='debug'?'77':'88')));
  }
  assert.notEqual(host.tools.cmakeDir({compiler:'gcc',cmakeProfile:'debug'}),host.tools.cmakeDir({compiler:'gcc',cmakeProfile:'release'}));
  await assert.rejects(()=>host.handle('run',{executable:path.join(root,'fake'),cwd:dir,environment:{},id:'escape'}),/Working directory/);
  assert.equal(JSON.parse((await host.ws.read(path.join(root,'.cpp-studio/configurations.json'))).text).runs[0].target,'DesktopDemo');
});
