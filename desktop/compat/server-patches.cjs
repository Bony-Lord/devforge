'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const file='out/vs/workbench/api/node/extensionHostProcess.js',originalSha256='37bf2d9b37c2894356c1ee48491f77efe8de160d7942b48faf1a462cc1311ee8';
const before='return s&&!s.isReadonly&&!i?.useTrash?',after='return s&&!s.isReadonly&&!i?.useTrash&&o.scheme!=="file"?';
const logFile='node_modules/@vscode/spdlog/index.js',logOriginalSha256='908932bebadaddf2aa2bf958c9c0b729ee99d40377f5ec67791f15ad942cde5a',logBefore='new spdlog.Logger(loggerType, name, filepath,',logAfter="new spdlog.Logger(loggerType, name, process.platform === 'win32' ? path.toNamespacedPath(filepath) : filepath,";
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function transform(bytes){const source=bytes.toString('utf8'),original=source.includes(after)?source.replace(after,before):source;if(hash(original)!==originalSha256||original.split(before).length!==2)throw Error('Pinned remote filesystem consumer changed; review the patch before building');return Buffer.from(original.replace(before,after));}
function transformLog(bytes){const source=bytes.toString('utf8'),original=source.includes(logAfter)?source.replace(logAfter,logBefore):source;if(hash(original)!==logOriginalSha256||original.split(logBefore).length!==2)throw Error('Pinned native logger wrapper changed; review the patch before building');return Buffer.from(original.replace(logBefore,logAfter));}
async function apply(directory){
 const recipes=[{file,originalSha256,before,after,transform,reason:'Route local-file workspace.fs.delete through the genuine main-thread filesystem RPC so native editors can reconcile deletion. Reads and unrelated providers keep their fast paths.'},{file:logFile,originalSha256:logOriginalSha256,before:logBefore,after:logAfter,transform:transformLog,reason:'Pass Windows long paths in extended-length form to the native logger. Keep existing log locations and non-Windows paths.'}],patches=[];
 // Validate every pinned input before changing any cached runtime file.
 const planned=await Promise.all(recipes.map(async recipe=>{const target=path.join(directory,recipe.file),original=await fs.readFile(target);return{recipe,target,original,patched:recipe.transform(original)};}));
 for(const {recipe,target,original,patched}of planned){if(!original.equals(patched)){const temporary=target+'.devforge-tmp';await fs.writeFile(temporary,patched);await fs.rename(temporary,target);}const {transform:unused,...metadata}=recipe;patches.push({...metadata,patchedSha256:hash(patched)});}
 await fs.writeFile(path.join(directory,'DEVFORGE-PATCHES.json'),JSON.stringify({format:'devforge.codeoss.patches/1',upstream:'VSCodium 1.143.17232',patches},null,2));
}
module.exports={transform,transformLog,apply,originalSha256};
