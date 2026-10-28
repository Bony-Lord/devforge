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
