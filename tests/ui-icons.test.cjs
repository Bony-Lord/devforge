'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('project, run and extension actions have defined distinct vector icons',()=>{
 const root=path.join(__dirname,'../app/src/main/assets/ui'),context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'icons.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(root,'tool-icons.js'),'utf8'),context);
 const icons=vm.runInContext('STUDIO_ICONS',context);for(const name of ['folder-cog','studio-run-settings','settings','blocks','list-minus','shield','file-plus','lightbulb','sliders-horizontal','panels-top-left'])assert(icons[name]?.includes('<svg'),name+' must not fall back to the generic file icon');assert.equal(new Set(['folder-cog','studio-run-settings','settings','blocks'].map(n=>icons[n])).size,4);
});
