'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const file='out/vs/workbench/api/node/extensionHostProcess.js',originalSha256='37bf2d9b37c2894356c1ee48491f77efe8de160d7942b48faf1a462cc1311ee8';
const before='return s&&!s.isReadonly&&!i?.useTrash?',after='return s&&!s.isReadonly&&!i?.useTrash&&o.scheme!=="file"?';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function transform(bytes){const source=bytes.toString('utf8'),original=source.includes(after)?source.replace(after,before):source;if(hash(original)!==originalSha256||original.split(before).length!==2)throw Error('Pinned remote filesystem consumer changed; review the patch before building');return Buffer.from(original.replace(before,after));}
async function apply(directory){const target=path.join(directory,file),original=await fs.readFile(target),patched=transform(original);if(!original.equals(patched)){const temporary=target+'.devforge-tmp';await fs.writeFile(temporary,patched);await fs.rename(temporary,target);}await fs.writeFile(path.join(directory,'DEVFORGE-PATCHES.json'),JSON.stringify({format:'devforge.codeoss.patches/1',upstream:'VSCodium 1.143.17232',patches:[{file,originalSha256,patchedSha256:hash(patched),before,after,reason:'Route local-file workspace.fs.delete through the genuine main-thread filesystem RPC so native editors can reconcile deletion. Reads and unrelated providers keep their fast paths.'}]},null,2));}
module.exports={transform,apply,originalSha256};
