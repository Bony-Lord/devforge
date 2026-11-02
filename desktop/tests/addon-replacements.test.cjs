'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const assets=require('../assets.cjs'),policy=require(assets.ui+'/addon-replacements.js'),core=require(assets.ui+'/addon-core.js'),{AddonLibrary}=require('../addons.cjs');
const definitions=require(assets.ui+'/addons/modules.json');
test('retired providers become non-executing compatibility aliases and old packs still resolve',()=>{
 const defs=policy.definitions(definitions),catalog=[...defs,...policy.catalogAliases()].map(d=>d.manifest),tools=require(assets.assets+'/tool-packs.json').packs;
 for(const p of tools)catalog.push({schemaVersion:1,id:'studio.tool.'+p.id,version:'1.0.0',api:{min:'0.1.1',maxExclusive:'0.2.0'},capabilities:[],dependencies:{},conflicts:{}});
 const resolved=core.resolve(catalog,['studio.pack.cpp-full','studio.pack.notebooks-quality'],{platform:'win32'});
 assert(resolved.some(m=>m.id==='studio.project.cmake'));assert(resolved.some(m=>m.id==='studio.notebooks'));assert(resolved.every(m=>!policy.retired.has(m.id)));
 for(const d of defs.filter(d=>policy.retired.has(d.manifest.id))){assert.equal(d.manifest.kind,'core');assert.deepEqual(d.contributions,[]);}
});
test('migration preserves unrelated requirements and maps used providers only to already installed VSX packages',()=>{
 const packages=['vscode.llvm-vs-code-extensions.vscode-clangd','vscode.ms-python.autopep8'].map(id=>({package:{manifest:{id,version:'2.0.0'}}}));
 const roots=policy.migrate(['studio.pack.cpp-full','studio.python-style','studio.notebooks','studio.vim'],definitions.map(d=>d.manifest),packages);
 assert(roots.includes('studio.pack.cpp-full'));assert(roots.includes('studio.notebooks'));assert(!roots.includes('studio.vim'));assert(!roots.includes('studio.python-style'));assert.deepEqual(roots.filter(r=>typeof r==='object').map(r=>r.id).sort(),packages.map(p=>p.package.manifest.id).sort());
 assert(!roots.some(r=>(r.id||r)==='vscode.vscodevim.vim'));
});
test('Windows preserves native providers and restores migrated C++ roots once',{skip:process.platform!=='win32'},async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'df-native-restoration-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));const lib=await new AddonLibrary({ws:{data:folder}}).init();assert(lib.builtinIndex().has('studio.clangd@1.0.0'));assert(!policy.enabled());assert(!lib.data.builtins.includes('studio.project.python@1.0.0'));const automatic={source:'runtime-default',package:{manifest:{id:'vscode.llvm-vs-code-extensions.vscode-clangd',version:'0.6.0'}}},profile={requested:['studio.project.cpp',automatic.package.manifest.id],defaultRequested:['studio.project.cpp']},restored=policy.restoreNative(profile,[automatic]);assert(restored.requested.includes('studio.clangd'));assert(!restored.requested.includes(automatic.package.manifest.id));assert.equal(policy.restoreNative({...restored,requested:['studio.project.cpp']},[automatic]).requested.length,1);
});
