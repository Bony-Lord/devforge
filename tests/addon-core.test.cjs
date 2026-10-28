const {test}=require('node:test'),assert=require('node:assert/strict');
const sdk=require('../app/src/main/assets/ui/addon-core.js');
const m=(id,extra={})=>({schemaVersion:1,id,version:'1.0.0',api:{min:'0.1.0',maxExclusive:'0.2.0'},capabilities:['ui.commands'],dependencies:{},conflicts:{},...extra});
test('strict versions, ranges, API and manifest validation; preserves unknown fields',()=>{
  assert(sdk.satisfies('1.2.0',{min:'1.1.0',maxExclusive:'2.0.0'}));assert(!sdk.satisfies('2.0.0',{maxExclusive:'2.0.0'}));assert(sdk.satisfies('1.0.0','1.0.0'));assert(!sdk.satisfies('1.0.1','1.0.0'));
  for(const bad of ['01.0.0','1.0','1.0.0-beta','9007199254740992.0.0'])assert.throws(()=>sdk.version(bad));
  for(const bad of [{min:0},{min:'2.0.0',maxExclusive:'1.0.0'},{wat:'1.0.0'}])assert.throws(()=>sdk.satisfies('1.0.0',bad));
  assert.throws(()=>sdk.manifest(m('bad')));assert.throws(()=>sdk.manifest(m('test.one',{api:null})));assert.throws(()=>sdk.manifest(m('test.one',{schemaVersion:2})));
  const parsed=sdk.manifest(m('test.one',{future:{data:42}}));assert.equal(parsed.future.data,42);assert(Object.isFrozen(parsed.future));
});
test('resolver backtracks across versions, orders dependencies, filters platform and API',()=>{
  const catalog=[m('test.app',{dependencies:{'test.lib':{maxExclusive:'2.0.0'}}}),m('test.lib',{version:'2.0.0'}),m('test.lib'),m('test.lib',{version:'1.9.0',platforms:['windows']}),m('test.lib',{version:'1.8.0',api:{min:'0.2.0'}})];
  assert.deepEqual(sdk.resolve(catalog,['test.app']).map(x=>x.id+'@'+x.version),['test.lib@1.0.0','test.app@1.0.0']);
  const cycle=[m('test.one',{version:'2.0.0',dependencies:{'test.two':{}}}),m('test.one'),m('test.two',{dependencies:{'test.one':{}}})];assert.equal(sdk.resolve(cycle,['test.one'])[0].version,'1.0.0');
});
test('rejects missing dependencies, symmetric conflicts, cycles, duplicates and bounded searches',()=>{
  assert.throws(()=>sdk.resolve([m('test.app',{dependencies:{'test.missing':{}}})],['test.app']));
  assert.throws(()=>sdk.resolve([m('test.one',{conflicts:{'test.two':{}}}),m('test.two')],['test.two','test.one']));
  assert.throws(()=>sdk.resolve([m('test.one',{dependencies:{'test.two':{}}}),m('test.two',{dependencies:{'test.one':{}}})],['test.one']));
  assert.throws(()=>sdk.resolve([m('test.one'),m('test.one')],['test.one']));assert.throws(()=>sdk.resolve([m('test.one')],['test.one'],{maxSteps:1}));
});
function setup(catalog,activate,extra={}){const errors=[],registry=new sdk.Registry({commands:'ui.commands',themes:'ui.theme'}),factories=new Map(catalog.map(manifest=>[manifest.id+'@'+manifest.version,ctx=>activate(ctx)]));return {registry,errors,manager:new sdk.Manager({catalog,factories,registry,report:(e,id)=>errors.push([id,e.message]),...extra})};}
test('dependency lifecycle; activation failure removes only new contributions',async()=>{
  const events=[],a=m('test.base'),b=m('test.ok',{dependencies:{'test.base':{}}}),bad=m('test.bad',{dependencies:{'test.base':{}}});
  const {registry,manager}=setup([a,b,bad],ctx=>{const id=ctx.manifest.id;events.push('start '+id);ctx.contribute('commands',id+'/action',{label:id});ctx.use(()=>events.push('stop '+id));if(id==='test.bad')throw Error('activation failed');});
  await manager.setProfile(['test.ok']);assert.equal(registry.list('commands').length,2);await assert.rejects(manager.setProfile(['test.ok','test.bad']));assert.equal(registry.list('commands').length,2);assert.deepEqual(manager.status().requested,['test.ok']);
  await manager.setProfile([]);assert.equal(registry.list('commands').length,0);assert.deepEqual(events.slice(-2),['stop test.ok','stop test.base']);
});
test('capabilities, contribution namespaces and duplicate IDs enforced with rollback',async()=>{
  for(const activate of [ctx=>ctx.contribute('themes','test.one/x',{}),ctx=>ctx.contribute('commands','test.other/x',{}),ctx=>{ctx.contribute('commands','test.one/x',{});ctx.contribute('commands','test.one/x',{});}]){
    const {registry,manager}=setup([m('test.one')],activate);await assert.rejects(manager.setProfile(['test.one']));assert.equal(registry.entries.size,0);
  }
});
test('serialized changes, safe mode, abort and cleanup survive disposal errors',async()=>{
  let context;const {manager,registry,errors}=setup([m('test.one')],async ctx=>{context=ctx;await new Promise(r=>setTimeout(r,5));ctx.contribute('commands','test.one/x',{});ctx.use(()=>{throw Error('dispose failed');});});
  const first=manager.setProfile(['test.one']),second=manager.setProfile(['test.one'],{safeMode:true});await Promise.all([first,second]);assert.equal(registry.entries.size,0);assert(context.signal.aborted);assert.throws(()=>context.contribute('commands','test.one/late',{}));assert.equal(errors.length,1);assert(manager.status().safeMode);assert.deepEqual(manager.status().requested,['test.one']);
  await manager.setProfile(['test.one']);assert.equal(registry.entries.size,1);await manager.dispose();
});
test('activation timeout closes scope and blocks late registration',async()=>{
  let ctx;const {manager,registry}=setup([m('test.one')],context=>{ctx=context;return new Promise(()=>{});},{timeout:10});await assert.rejects(manager.setProfile(['test.one']),/timed out/);assert(ctx.signal.aborted);assert.throws(()=>ctx.contribute('commands','test.one/late',{}));assert.equal(registry.entries.size,0);
});
test('active version upgrades publish once; old disposer cannot remove new contributions',async()=>{
  let notifications=0,oldContext,newContext;const registry=new sdk.Registry({commands:'ui.commands'},()=>notifications++),catalog=[m('test.one'),m('test.one',{version:'2.0.0'})];
  const manager=new sdk.Manager({catalog,registry,factories:new Map(catalog.map(manifest=>[manifest.id+'@'+manifest.version,ctx=>{if(ctx.manifest.version==='1.0.0')oldContext=ctx;else newContext=ctx;ctx.contribute('commands','test.one/x',{version:ctx.manifest.version});}]))});
  await manager.setProfile([{id:'test.one',version:'1.0.0'}]);const before=notifications;await manager.setProfile(['test.one']);assert.equal(notifications,before+1);assert(oldContext.signal.aborted);assert.equal(registry.list('commands')[0].value.version,'2.0.0');newContext.contribute('commands','test.one/late',{});assert.equal(registry.entries.size,2);await manager.dispose();assert.equal(registry.entries.size,0);
});
test('failed upgrade keeps the original version and registry unchanged',async()=>{
  const {manager,registry}=setup([m('test.one'),m('test.one',{version:'2.0.0'})],ctx=>{ctx.contribute('commands','test.one/x',{version:ctx.manifest.version});if(ctx.manifest.version==='2.0.0')throw Error('broken version');});
  await manager.setProfile([{id:'test.one',version:'1.0.0'}]);const before=registry.revision;await assert.rejects(manager.setProfile(['test.one']));assert.equal(registry.revision,before);assert.equal(registry.list('commands')[0].value.version,'1.0.0');assert.equal(manager.status().active[0].version,'1.0.0');
  await manager.dispose();manager.factories.clear();await assert.rejects(manager.setProfile(['test.one']),/trusted loader/);
});
test('late live contributions during asynchronous activation are preserved and abort stale transaction',async()=>{
  let first;const {manager,registry}=setup([m('test.one'),m('test.two')],async ctx=>{if(ctx.manifest.id==='test.one')first=ctx;else{first.contribute('commands','test.one/late',{});await Promise.resolve();}ctx.contribute('commands',ctx.manifest.id+'/x',{});});
  await manager.setProfile(['test.one']);await assert.rejects(manager.setProfile(['test.one','test.two']),/changed during activation/);assert.equal(registry.list('commands').length,2);assert.equal(manager.status().active.length,1);await manager.dispose();assert.equal(registry.entries.size,0);
});
