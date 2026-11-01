'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {transform}=require('../compat/server-patches.cjs');
test('remote file-delete patch is pinned, idempotent and rejects unknown upstream code',async()=>{const bytes=await fs.readFile(path.resolve(__dirname,'../compat/server/out/vs/workbench/api/node/extensionHostProcess.js')),patched=transform(bytes);assert.deepEqual(transform(patched),patched);assert(patched.includes(Buffer.from('useTrash&&o.scheme!=="file"?')));assert.throws(()=>transform(Buffer.from('unexpected runtime')),/changed/);const modified=Buffer.from(bytes);modified[0]^=1;assert.throws(()=>transform(modified),/changed/);});
