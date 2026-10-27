'use strict';
const assert=require('node:assert/strict'),keys=require('../app/src/main/assets/ui/completion-keys.js');
const event=(key,alt=false,shift=false)=>({key,ctrlKey:true,altKey:alt,shiftKey:shift,metaKey:false,preventDefault(){},stopImmediatePropagation(){}});
assert.ok(keys.matches(event(' ',true),keys.defaults.completionShortcut));assert.ok(keys.matches(event('p',true),keys.defaults.parameterShortcut));
for(const e of [event(' '),event(' ',false,true),event('Enter',true),event('Enter',true,true),event('p'),event('p',false,true)])for(const binding of Object.values(keys.defaults))assert.equal(keys.matches(e,binding),false);
assert.ok(keys.matches(event(' ',false,true),'Ctrl+Shift+Space'));assert.ok(keys.matches(event(' ',true),'Ctrl+Alt+Space'));assert.equal(keys.conflict({}),false);assert.equal(keys.conflict({completionShortcut:'Ctrl+Alt+P'}),true);
const calls=[],ide={settings:{},action:name=>calls.push(name)};assert.ok(keys.handle(ide,event('p',true)));assert.deepEqual(calls,['editor.action.triggerParameterHints']);assert.equal(keys.handle(ide,event(' ')),false);
console.log('Completion shortcuts: default routing, exact modifiers, legacy options and conflicts passed');
