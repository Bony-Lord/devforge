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
test('Windows removes retired builtin manifests and legacy packages without touching VSX or unrelated addon data',{skip:process.platform!=='win32'},async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'df-retirement-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));const lib=await new AddonLibrary({ws:{data:folder}}).init();
 lib.data.builtins.push('studio.clangd@1.0.0');await fs.writeFile(path.join(folder,'builtin-addons','studio.clangd@1.0.0.json'),'legacy');lib.data.packages.push({source:'bundled-catalog',package:{manifest:{id:'studio.vim',version:'1.0.1'}}},{source:'local-file',package:{manifest:{id:'vscode.vscodevim.vim',version:'1.32.4'}}});lib.data.profile.requested=['studio.vim','studio.notebooks'];lib.data.profile.resolved=['studio.vim','studio.notebooks'];await lib.save();
 const next=await new AddonLibrary({ws:{data:folder}}).init();assert(!next.builtinIndex().has('studio.clangd@1.0.0'));assert(!next.catalog().some(p=>policy.retired.has(p.manifest.id)));assert.deepEqual(next.data.packages.map(e=>e.package.manifest.id),['vscode.vscodevim.vim']);assert(next.data.profile.requested.some(r=>r.id==='vscode.vscodevim.vim'));assert(next.data.profile.requested.includes('studio.notebooks'));await assert.rejects(fs.access(path.join(folder,'builtin-addons','studio.clangd@1.0.0.json')),/ENOENT/);
});
