const test=require('node:test'),assert=require('node:assert/strict'),core=require('../app/src/main/assets/ui/addon-core.js'),selection=require('../app/src/main/assets/ui/addon-selection-model.js');
const m=(id,kind='feature',dependencies={})=>({schemaVersion:1,id,version:'1.0.0',api:{min:'0.1.1',maxExclusive:'0.2.0'},capabilities:[],dependencies,conflicts:{},kind});
const catalog=[m('example.base'),m('example.editor','feature',{'example.base':{}}),m('example.analysis','feature',{'example.base':{}}),m('example.other'),m('example.small','pack',{'example.editor':{}}),m('example.full','pack',{'example.small':{},'example.analysis':{}})];
const get=id=>catalog.find(m=>m.id===id),ids=requested=>core.resolve(catalog,requested).map(m=>m.id);
test('workload checkbox distinguishes off, partial, full and nested workloads',()=>{
 assert.equal(selection.state(catalog,[],get('example.full')).count,0);assert.equal(selection.state(catalog,['example.editor'],get('example.full')).partial,true);assert.equal(selection.state(catalog,['example.editor'],get('example.small')).checked,true);assert.equal(selection.state(catalog,['example.full'],get('example.full')).checked,true);assert.equal(selection.state(catalog,['example.editor','example.analysis'],get('example.full')).checked,true);
});
test('unchecking one component splits a workload while preserving unrelated features',()=>{
 const next=selection.toggle(catalog,['example.full','example.other'],get('example.analysis'),false);assert(ids(next).includes('example.editor'));assert(ids(next).includes('example.other'));assert(!ids(next).includes('example.analysis'));assert.equal(selection.state(catalog,next,get('example.full')).partial,true);
 const restored=selection.toggle(catalog,next,get('example.full'),true);assert(selection.state(catalog,restored,get('example.full')).checked);
});
test('required component removal prunes its dependents, retaining independent roots',()=>{
 const next=selection.toggle(catalog,['example.full','example.other'],get('example.base'),false);assert.deepEqual(ids(next),['example.other']);
});
test('disabling a workload retains independent roots and dependencies still required elsewhere',()=>{
 const next=selection.toggle(catalog,['example.full','example.other'],get('example.full'),false);assert.deepEqual(ids(next),['example.other']);
});
test('preview reports changes without mutating the active profile',()=>{
 const before=['example.editor'],after=selection.toggle(catalog,before,get('example.full'),true),changes=selection.changes(catalog,before,after);assert.deepEqual(before,['example.editor']);assert(changes.added.some(m=>m.id==='example.analysis'));assert.equal(changes.removed.length,0);
});

test('component groups have unchecked, mixed and checked states',()=>{
 const members=[get('example.editor'),get('example.analysis')];assert.deepEqual(selection.groupState(members,[]),{checked:false,partial:false,count:0,total:2});assert(selection.groupState(members,core.resolve(catalog,['example.editor'])).partial);assert(selection.groupState(members,core.resolve(catalog,['example.full'])).checked);assert.equal(selection.groupState([],[]).checked,false);
});
test('checking a group adds missing dependencies once; unchecking preserves independent groups',()=>{
 const members=[get('example.editor'),get('example.analysis')],next=selection.toggleGroup(catalog,['example.other'],members,true);assert.deepEqual(new Set(ids(next)),new Set(['example.base','example.editor','example.analysis','example.other']));assert.deepEqual(ids(selection.toggleGroup(catalog,next,members,false)),['example.other']);assert.deepEqual(ids(selection.toggleGroup(catalog,['example.full','example.other'],[get('example.analysis')],false)),['example.base','example.editor','example.other']);assert.deepEqual(selection.toggleGroup(catalog,['example.other'],[],false),['example.other']);
});
test('component grouping deduplicates versions and keeps native tools separate',()=>{
 const groups=selection.groups([...catalog,{...get('example.editor'),version:'2.0.0',installationGroup:'workspace'},{...get('example.other'),id:'example.compiler',nativePack:'compiler',kind:'runtime'}]);assert(groups.find(g=>g.id==='workspace').members.some(m=>m.version==='2.0.0'));assert(groups.find(g=>g.id==='tools').members.some(m=>m.id==='example.compiler'));assert(!groups.flatMap(g=>g.members).some(m=>m.kind==='pack'));assert.equal(groups.flatMap(g=>g.members).filter(m=>m.id==='example.editor').length,1);
});
test('saved picker view retains expanded groups and scroll while sanitizing invalid values',()=>{
 const value=selection.view({tab:'components',expanded:['tools','editing'],search:'gcc',selectedOnly:true,scroll:{components:240,packs:80}});assert.deepEqual(value,{tab:'components',expanded:['tools','editing'],search:'gcc',selectedOnly:true,scroll:{packs:80,components:240}});assert.equal(selection.view(null).tab,'packs');assert.equal(selection.view({scroll:{packs:-4}}).scroll.packs,0);
});
