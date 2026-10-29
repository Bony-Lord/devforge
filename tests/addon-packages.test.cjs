const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),core=require('../app/src/main/assets/ui/addon-core.js'),packages=require('../app/src/main/assets/ui/addon-packages.js');
const sample=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../examples/addons/forest.studio-addon'),'utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));
test('data package roundtrip and capability-limited factory',async()=>{
  const pkg=packages.parse(JSON.stringify(sample));assert(Object.isFrozen(pkg));assert.equal(pkg.manifest.id,'example.forest');const registry=new core.Registry({themes:'ui.theme'}),manager=new core.Manager({catalog:[pkg.manifest],registry,factories:new Map([[pkg.manifest.id+'@'+pkg.manifest.version,packages.factory(pkg)]])});await manager.setProfile([pkg.manifest.id]);assert.equal(registry.list('themes').length,1);await manager.dispose();assert.equal(registry.entries.size,0);
});
test('rejects code, arbitrary actions, CSS injection and invalid namespaced contributions',()=>{
  const bad=[p=>p.script='alert(1)',p=>p.manifest.capabilities.push('process.exec'),p=>p.contributions[0].value.dark['--accent']='red;position:fixed',p=>p.contributions[0].value.dark['--arbitrary']='#123456',p=>p.contributions[0].id='other.theme/x',p=>p.contributions.push(clone(p.contributions[0])),p=>p.contributions[0].point='windows',p=>{p.manifest.capabilities=['ui.commands'];p.contributions=[{point:'commands',id:'example.forest/x',value:{label:'Bad',action:'javascript:alert(1)'}}];},p=>p.manifest.name='',p=>p.manifest.license=null];
  for(const mutate of bad){const p=clone(sample);mutate(p);assert.throws(()=>packages.parse(p));}assert.throws(()=>packages.parse('{'));assert.throws(()=>packages.parse(' '.repeat(262145)));
});
test('official data catalog validates and allowed commands stay declarative',()=>{
  const catalog=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../app/src/main/assets/ui/addons/catalog.json'),'utf8')).map(packages.parse);assert.equal(catalog.length,5);assert(catalog.every(p=>p.manifest.id.startsWith('studio.')));assert.deepEqual(packages.ACTIONS,['editor.focus','editor.resetZoom','ui.settings','ui.focusMode']);
});
test('install planning includes dependencies, pins selected version and preserves disabled profile',()=>{
  const dep=clone(sample);dep.manifest.id='example.base';dep.contributions[0].id='example.base/colors';const app=clone(sample);app.manifest.dependencies={'example.base':{min:'1.0.0'}};
  const plan=packages.plan({candidate:app,available:[dep]});assert.deepEqual(plan.packages.map(p=>p.manifest.id),['example.base','example.forest']);assert.deepEqual(plan.requested,[{id:'example.forest',version:'1.0.0'}]);assert.throws(()=>packages.plan({candidate:app}),/Cannot resolve/);
  const inactive=packages.plan({candidate:app,available:[dep],enable:false,profile:[],safeMode:true});assert.deepEqual(inactive.requested,[]);assert(inactive.safeMode);
  const installed=packages.plan({candidate:app,installed:[dep,app]});assert.equal(installed.packages.length,0);
});
