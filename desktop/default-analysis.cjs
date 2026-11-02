'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const ID='vscode.llvm-vs-code-extensions.vscode-clangd';
// A pinned, unmodified upstream extension is part of the Windows distribution.
// Provision once; an explicit disable or uninstall must survive future starts.
async function provision(host){
 const library=host.addons.base||host.addons;
 return library.mutate(async()=>{
  if(library.data.pending)throw Error('Finish the addon transaction first');
  const installed=library.data.packages.find(e=>e.package.manifest.id===ID);
  if(installed){if(!library.data.defaults?.cppAnalysis){library.data.defaults={...library.data.defaults,cppAnalysis:{id:ID,manual:true}};await library.save();}return {library:host.addons.state(),id:ID,installed:false};}
  if(library.data.defaults?.cppAnalysis)return {id:ID,disabled:true};
  const folder=path.join(__dirname,'default-extensions'),metadata=JSON.parse(await fs.readFile(path.join(folder,'manifest.json'),'utf8')),file=path.join(folder,'clangd.vsix'),bytes=await fs.readFile(file);
  if(metadata.id!==ID||crypto.createHash('sha256').update(bytes).digest('hex')!==metadata.sha256)throw Error('Bundled clangd checksum mismatch');
  const pkg=await host.vscode.prepareFile(file);
  if(pkg.manifest.id!==ID||pkg.manifest.version!==metadata.version)throw Error('Bundled clangd identity mismatch');
  library.data.packages.push({package:pkg,source:'runtime-default',accepted:true,compatibilityAccepted:true});
  library.data.defaults={...library.data.defaults,cppAnalysis:{id:ID,version:metadata.version,sha256:metadata.sha256}};
  library.data.revision++;await library.save();
  return {library:host.addons.state(),id:ID,installed:true};
 });
}
module.exports={provision,ID};
