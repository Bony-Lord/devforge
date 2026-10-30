'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), { spawn } = require('node:child_process'), readline = require('node:readline');
test('native host uses pipes without Electron and retains project sessions and addon scopes', { timeout: 150000 }, async t => {
 const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-native-'));
 // Isolate project creation as well as settings: no user project directory writes.
 await fs.writeFile(path.join(directory, 'settings.json'), JSON.stringify({ settings: {}, projects: {}, projectSelectionCleared: true, current: '', session: {} }));
 const child = spawn(process.execPath, [process.env.DEVFORGE_NATIVE_BACKEND||path.join(__dirname, 'backend.cjs'), '--data-dir=' + directory, '--projects-dir=' + path.join(directory, 'projects')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
 const pending = new Map(),events=[]; let sequence = 0, errors = ''; child.stderr.on('data', b => errors += b); readline.createInterface({ input: child.stdout }).on('line', line => { const value = JSON.parse(line);if(value.event)events.push(value); const item = pending.get(value.id); if (item) { pending.delete(value.id); value.error ? item.reject(Error(item.op + ": " + value.error)) : item.resolve(value.value); } });
 const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({code,signal})));
 const call = (op, data = {}, window = 'main') => new Promise((resolve, reject) => { const id = String(++sequence); const timer=setTimeout(()=>{pending.delete(id);reject(Error('Native request timed out: '+op));},op==='build'?90000:25000);pending.set(id, { resolve:v=>{clearTimeout(timer);resolve(v);}, reject:e=>{clearTimeout(timer);reject(e);}, op }); child.stdin.write(JSON.stringify({ id, op, data, window }) + '\n'); });
 const wait = async(predicate, label, timeout=15000)=>{const end=Date.now()+timeout;while(!predicate()){if(Date.now()>end)throw Error(label+'\n'+errors+'\n'+JSON.stringify(events.slice(-8)));await new Promise(resolve=>setTimeout(resolve,20));}};
 try {
  const state = await call('state'); assert.equal(state.capabilities.browser, false); assert.equal(state.capabilities.editor, 'avalonedit'); assert.equal(state.root, '');
  const entries = await call('nativeAddonInit'); assert(entries.some(e => e.core && e.manifest.id === 'studio.window-manager'));
  const templates = await call('nativeTemplates'); assert(templates.some(t => t.id === 'studio.template.notebook'));
  const result = await call('nativeTemplateApply', { id: 'studio.template.notebook', name: 'native-test' }); assert(result.state.root.toLowerCase().startsWith(directory.replaceAll('\\', '/').toLowerCase()), result.state.root + ' versus ' + directory); assert(result.entryFile.endsWith('.ipynb'));
  const notebook = await call('read', { path: result.state.root + '/notebook.ipynb' }); assert.equal(JSON.parse(notebook.text).nbformat, 4);
  const conflict = await call('projectOpenWindow', { id: result.state.project }); assert.equal(conflict.conflict, true);
  const reader = await call('projectOpenWindow', { id: result.state.project, readOnly: true }); assert(reader.window);
  await call('nativeAddonToggle', { id: 'studio.library.fmt', enable: true });
  assert((await call('nativeAddonCatalog', {}, reader.window)).find(e=>e.manifest.id==='studio.library.fmt').enabled);
  assert((await call('nativeTemplates', {}, reader.window)).some(t=>t.id==='studio.library.fmt.cmake'));
  await assert.rejects(call('write', { path: result.state.root + '/notebook.ipynb', text: 'must not write' }, reader.window), /PROJECT_READ_ONLY/);
  await assert.rejects(call('nativeTemplateApply', { id: 'studio.template.editorconfig' }, reader.window), /PROJECT_READ_ONLY/);
  await call('windowClose', {}, reader.window); assert.equal((await call('state')).project, result.state.project);
  await assert.rejects(call('nativeAddonRemove', { id: 'studio.window-manager', confirm: true }), /Встроенный/);
  const snippet={format:'cppstudio.addon',formatVersion:1,manifest:{schemaVersion:1,id:'fixture.snippets',version:'1.0.0',api:{min:'0.1.1',maxExclusive:'0.2.0'},name:'Native fixture',description:'Isolated snippet lifecycle',license:'MIT',capabilities:['editor.snippets'],dependencies:{'studio.language.cpp':{}},conflicts:{},platforms:['win32']},contributions:[{point:'snippets',id:'fixture.snippets/hello',value:{language:'cpp',prefix:'dfhello',label:'Fixture hello',body:'int ${1:counter} = 42;'}}]};
  await call('nativeAddonImport',{package:snippet,accepted:true});assert((await call('nativeSnippets')).some(s=>s.prefix==='dfhello'));
  const warning=await call('nativeAddonToggle',{id:'studio.language.cpp',enable:false});assert.equal(warning.needsConfirmation,true);assert(warning.dependents.some(m=>m.id==='fixture.snippets'));assert((await call('nativeSnippets')).length>0);
  await call('nativeAddonToggle',{id:'studio.language.cpp',enable:false,confirm:true});assert(!(await call('nativeSnippets')).some(s=>s.prefix==='dfhello'));
  await call('nativeAddonToggle',{id:'fixture.snippets',enable:true});assert((await call('nativeSnippets')).some(s=>s.prefix==='dfhello'));
  await call('nativeAddonRemove',{id:'fixture.snippets',confirm:true});assert(!(await call('nativeAddonCatalog')).some(e=>e.manifest.id==='fixture.snippets'));
  const resolved=await call('nativeResolveConfiguration');assert.equal(resolved.configuration.type,'notebook');assert.equal(resolved.options.buildMode,'notebook');assert.equal(resolved.path,result.state.root+'/notebook.ipynb');
  if(process.env.DEVFORGE_NATIVE_RUNTIME==='1'){
   await call('nativeAddonToggle',{id:'studio.python',enable:true});await call('nativeAddonToggle',{id:'studio.notebooks',enable:true});
   const started=await call('notebookStart',{path:result.state.root+'/notebook.ipynb',options:{}});
   const execute=async(id,code)=>{await call('notebookExecute',{id,path:result.state.root+'/notebook.ipynb',code});const end=Date.now()+15000;while(!events.some(e=>e.event==='notebook'&&e.data.id===id&&e.data.type==='idle')){if(Date.now()>end)throw Error('Notebook timed out '+id);await new Promise(r=>setTimeout(r,20));}assert(!events.some(e=>e.event==='notebook'&&e.data.id===id&&e.data.type==='error'));};
   await execute('cell-one','native_value = 76\n!echo native-shell');await execute('cell-two','native_value + 1');assert(events.some(e=>e.event==='notebook'&&e.data.type==='result'&&e.data.text==='77'));assert(events.some(e=>e.event==='notebook'&&e.data.type==='stream'&&e.data.text.includes('native-shell')));await call('notebookStop',{session:started.session});
   const cpp=await call('nativeTemplateApply',{id:'studio.template.cmake-cpp',name:'native-cpp'});assert(cpp.state.tree.some(f=>f.dir&&f.name==='build'));
   const file=cpp.state.root+'/main.cpp';await call('read',{path:file});await call('write',{path:file,text:'#include <cstdio>\n#include <vector>\nint main() {\n    int native_counter = 42;\n    std::vector<int> native_items{1, 2, 3};\n    std::printf("native-cpp-%d\\n", native_counter);\n}\n'});
   const buildOptions={compiler:'gcc',cppStandard:'c++20',cStandard:'c17',flags:[],optimization:'debug',runtimeChecks:'off',buildDirectory:'build',target:'app'};
   const built=await call('build',{id:'native-build',mode:'cmake',path:file,options:buildOptions});assert.equal(built.code,0,events.filter(e=>e.event==='output').map(e=>e.data.text).join(''));await call('run',{id:'native-run',executable:built.executable,cwd:cpp.state.root});await wait(()=>events.some(e=>e.event==='exit'&&e.data.id==='native-run'),'Program did not finish');assert(events.some(e=>e.event==='output'&&e.data.text.includes('native-cpp-42')));
   const tools=await call('toolLocations');if(tools.gdb&&tools.gdbserver){
    t.diagnostic('Actual GDB + gdbserver: step over, stack, scalar and std::vector children');
    await call('nativeDebugStart',{id:'native-debug',executable:built.executable,options:{workingDirectory:'.'},breakpoints:{}});
    const stopped=()=>events.filter(e=>e.event==='nativeDebugStopped'&&e.data.session==='native-debug');
    await wait(()=>stopped().length>=1,'GDB initial stop');let count=stopped().length;await call('nativeDebugCommand',{action:'over'});await wait(()=>stopped().length>count,'GDB step over counter');count=stopped().length;await call('nativeDebugCommand',{action:'over'});await wait(()=>stopped().length>count,'GDB step over vector');
    const snapshot=await call('nativeDebugSnapshot');assert(snapshot.frames.some(f=>f.func==='main'));assert(snapshot.variables.some(v=>v.name==='native_counter'&&v.value==='42'));const vector=snapshot.variables.find(v=>v.name==='native_items');assert(vector);if(vector.children){const children=await call('nativeDebugChildren',{reference:vector.reference});assert(children.length>0);}await call('nativeDebugStop');
   }
   // Live source delivery is a separate opt-in; offline IDE regressions never
   // depend on a registry or CMake's network availability.
   if(process.env.DEVFORGE_NATIVE_NETWORK==='1'){
    await call('nativeTemplateApply',{id:'studio.library.fmt.cmake',parameters:{target:'app'}});
    await call('write',{path:file,text:'#include <fmt/format.h>\nint main(){fmt::print("native-fmt-42\\n");}\n'});
    const library=await call('build',{id:'native-library-build',mode:'cmake',path:file,options:buildOptions});assert.equal(library.code,0,events.filter(e=>e.event==='output').map(e=>e.data.text).join(''));
   }
  }
  await call('shutdown'); child.stdin.end();
  const exit=await exited;assert.equal(exit.code,0,'Native host exit: '+errors);
 } finally {
  if(child.exitCode===null){await call('shutdown').catch(()=>{});child.stdin.end();await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,3000))]);if(child.exitCode===null)child.kill();await exited;}
  for(const request of pending.values())request.reject(Error('Host closed'));pending.clear();
  await fs.rm(directory, { recursive: true, force: true, maxRetries: 3 });
 }
});
