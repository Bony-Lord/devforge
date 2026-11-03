'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm');
test('Notebook preload serializes its original realm-independent source before build transforms',async()=>{
 const {upstreamPatches}=await import('../compat/upstream-patches.js'),file=path.resolve(__dirname,'../compat/node_modules/@codingame/monaco-vscode-api/vscode/src/vs/workbench/contrib/notebook/browser/view/renderers/webviewPreloads.js'),source=await fs.readFile(file,'utf8'),patched=upstreamPatches().transform(source,file),module={};
 vm.runInNewContext(patched.replace('export { preloadsScriptStr };','this.preload=preloadsScriptStr;'),module);const script=module.preload({}, {}, {}, [], [], false, 'nonce');assert(script.includes('async function webviewPreloads(ctx)'));assert(!script.includes('__name('));assert(!script.includes('__setFunctionName('));new vm.Script(script);assert.equal(script.match(/sourceURL=notebookWebviewPreloads/g).length,1);
});
