'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const ui=path.join(__dirname,'../app/src/main/assets/ui'),packages=require(ui+'/addon-packages.js'),templates=require(ui+'/project-templates.js'),runs=require(ui+'/run-configurations.js');
const libraries=require(ui+'/addons/catalog.json').filter(p=>p.manifest.id.startsWith('studio.library.'));
test('library addons attach repeatably to existing and manual projects without replacing CMake code',()=>{
 assert.equal(libraries.length,6);
 for(const pkg of libraries){packages.parse(pkg);const template=pkg.contributions.find(c=>c.point==='projectTemplates').value,instance=templates.instantiate(template,{target:'own_target'});const original='cmake_minimum_required(VERSION 3.24)\nproject(custom)\nadd_executable(own_target custom.cpp)\n# user settings\n';
  const document={...runs.defaults(),projectType:'empty'},first=templates.plan(instance,{document,current:{'CMakeLists.txt':original}});assert.equal(first.conflicts.length,0);const cmake=first.changes.find(f=>f.path==='CMakeLists.txt');assert(cmake.text.startsWith(original));assert(cmake.text.includes('include("${CMAKE_CURRENT_LIST_DIR}/cmake/devforge-libraries/'));assert(instance.files[0].text.includes('target_link_libraries(own_target PRIVATE '));assert.match(instance.files[0].text,/URL_HASH SHA256=[a-f0-9]{64}/);
  const current=Object.fromEntries(first.changes.map(f=>[f.path,f.text])),again=templates.plan(instance,{document:first.project,current});assert.equal(again.changes.length,0);assert.equal(again.project.projectType,'empty');assert(first.project.templates.some(t=>t.id===instance.id));
 }
});
test('append attachments compose and preserve a final line without newline',()=>{
 const a=templates.instantiate(libraries[0].contributions[0].value,{target:'app'}),b=templates.instantiate(libraries[1].contributions[0].value,{target:'app'});let document=runs.defaults(),current={'CMakeLists.txt':'project(kept)'};
 for(const instance of [a,b]){const p=templates.plan(instance,{document,current});document=p.project;for(const change of p.changes)current[change.path]=change.text;}
 assert(current['CMakeLists.txt'].startsWith('project(kept)\n'));assert(current['CMakeLists.txt'].includes('/fmt.cmake'));assert(current['CMakeLists.txt'].includes('/spdlog.cmake'));
});
