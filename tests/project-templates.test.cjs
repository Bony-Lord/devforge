'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ui=path.join(__dirname,'../app/src/main/assets/ui'),templates=require(ui+'/project-templates.js'),runs=require(ui+'/run-configurations.js'),packages=require(ui+'/addon-packages.js'),core=require(ui+'/addon-core.js');
const catalog=JSON.parse(fs.readFileSync(ui+'/addons/templates.json','utf8')),byId=id=>structuredClone(catalog.find(t=>t.id==='studio.template.'+id));
test('all built-in templates instantiate and their projects have one main configuration',()=>{
  assert.equal(catalog.length,13);for(const raw of catalog){const t=templates.parse(raw),instance=templates.instantiate(t,{},'demo');assert(Object.isFrozen(t));if(t.kind==='project'){const plan=templates.plan(instance);runs.validate(plan.project);assert.equal(plan.project.configurations.length,1);assert.equal(plan.project.active,plan.project.configurations[0].id);}}
  for(const id of ['python','notebook']){const p=templates.plan(templates.instantiate(byId(id))).project;assert(!p.configurations[0].actions.build);assert(!p.configurations[0].actions.debug);assert(!p.addons.requested.some(id=>/clangd|formatter|cmake/.test(id)));}
  const cpp=templates.instantiate(byId('cmake-cpp'),{target:'my_app'});assert(cpp.files[0].text.includes('add_executable(my_app main.cpp)'));assert.equal(cpp.project.configurations[0].target,'my_app');
});
test('attachments preserve custom actions, unknown project fields, profiles and repeat safely',()=>{
  const original=runs.defaults({},'src/main.cpp');original.customField={future:'retained'};original.configurations[0].args=['hello'];original.profiles[0].environment={PATH:'custom'};
  const instance=templates.instantiate(byId('clangd')),p=templates.plan(instance,{document:original});assert.equal(p.changes[0].before,null);assert.deepEqual(p.project.customField,original.customField);assert.deepEqual(p.project.configurations,original.configurations);assert.deepEqual(original.templates,undefined);
  const again=templates.plan(instance,{document:p.project,current:{'.clangd':instance.files[0].text}});assert.equal(again.changes.length,0);assert.equal(again.project.templates.length,1);assert.deepEqual(again.unchanged,['.clangd']);
  const compiler=templates.plan(templates.instantiate(byId('clang')),{document:original});assert.equal(compiler.project.profiles[0].compiler,'clang');assert.equal(compiler.project.profiles[1].compiler,'gcc');assert.equal(original.profiles[0].compiler,'gcc');assert.deepEqual(compiler.project.configurations,original.configurations);runs.validate(compiler.project);
});
test('existing files require explicit replacement, type mismatches and project replacement fail',()=>{
  const t=templates.instantiate(byId('clang-format')),document=runs.defaults();const p=templates.plan(t,{document,current:{'.clang-format':'custom'}});assert.deepEqual(p.conflicts,['.clang-format']);assert.equal(p.changes.length,0);
  const replace=templates.plan(t,{document,current:{'.clang-format':'custom'},replace:['.clang-format']});assert.equal(replace.changes[0].before,'custom');assert.equal(replace.conflicts.length,0);
  assert.throws(()=>templates.plan(t,{document:{projectType:'python'}}),/incompatible/);assert.throws(()=>templates.plan(templates.instantiate(byId('python')),{document}),/cannot replace/);
});
test('untrusted parameters cannot escape the project; literals and JSON escaping are predictable',()=>{
  const t=byId('editorconfig');t.parameters=[{id:'directory',label:'Directory',type:'relativePath',default:'config'}];t.files=[{path:'{{directory}}/style.txt',text:'{{directory}}'}];
  for(const value of ['../outside','/tmp/escape','C:/escape','a\\b','a/../b','.git/config','CON','a/.forge/x'])assert.throws(()=>templates.instantiate(t,{directory:value}));
  const custom=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/templates/python-tool.studio-template'),'utf8')),literal='"Привет" \\ ${unexpanded}';const instance=templates.instantiate(custom,{message:literal});assert(instance.files[0].text.includes('print('+JSON.stringify(literal)+')'));assert.throws(()=>templates.instantiate(custom,{unknown:'x'}));
  for(const mutate of [t=>t.script='exec()',t=>t.files[0].path='.git/config',t=>t.files[0].path='a/../../x',t=>t.files[0].text='{{missing}}',t=>t.parameters=[{id:'projectName',label:'bad',type:'text'}],t=>t.files=[{path:'A.py',text:''},{path:'a.py',text:''}]]){const copy=byId('python');mutate(copy);assert.throws(()=>templates.instantiate(copy));}
  assert.throws(()=>templates.parse('{"format":"devforge.template","__proto__":{}}'),/Unsafe/);
});
test('addon templates use an explicit capability, ownership and normal addon lifecycle',async()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/templates/python-tool.studio-addon'),'utf8'));packages.parse(pkg);
  const registry=new core.Registry({projectTemplates:'projects.templates'}),manager=new core.Manager({catalog:[pkg.manifest],factories:new Map([[pkg.manifest.id+'@'+pkg.manifest.version,packages.factory(pkg)]]),registry});await manager.setProfile([pkg.manifest.id]);assert.equal(registry.list('projectTemplates').length,1);await manager.dispose();assert.equal(registry.list('projectTemplates').length,0);
  for(const mutate of [p=>p.manifest.capabilities=[],p=>p.contributions[0].value.id='other.owner.project',p=>p.contributions[0].value.files[0].path='../escape']){const copy=structuredClone(pkg);mutate(copy);assert.throws(()=>packages.parse(copy));}
});
