'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),lifecycle=require('../app/src/main/assets/ui/editor-lifecycle.js');
test('disposed word-highlight requests observe cancellation and preserve the original promise',async()=>{
  let reject;const pending=new Promise((_,fail)=>reject=fail),delayer={trigger(value){assert.equal(this,delayer);assert.equal(value,42);return pending;}},errors=[];
  lifecycle.watch(delayer,error=>errors.push(error));const trigger=delayer.trigger;lifecycle.watch(delayer);assert.equal(trigger,delayer.trigger);assert.equal(delayer.trigger(42),pending);reject(Object.assign(Error('Canceled'),{name:'Canceled'}));await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(errors,[]);
});
test('real provider failures are still reported, while each new model highlighter is observed',async()=>{
  const failure=Error('provider failed'),errors=[],delayer={trigger:()=>Promise.reject(failure)};lifecycle.watch(delayer,e=>errors.push(e));delayer.trigger();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(errors,[failure]);
  const listeners={},disposals=[],editor={getContribution:()=>({wordHighlighter:{runDelayer:editor.delayer}}),onDidChangeModel:fn=>(listeners.model=fn,{dispose:()=>disposals.push('model')}),onDidDispose:fn=>(listeners.dispose=fn,{dispose:()=>disposals.push('dispose')})};lifecycle.attach(editor);editor.delayer={trigger:()=>Promise.resolve(7)};const original=editor.delayer.trigger;listeners.model();assert.notEqual(editor.delayer.trigger,original);assert.equal(await editor.delayer.trigger(),7);listeners.dispose();assert.deepEqual(disposals,['model','dispose']);
});
