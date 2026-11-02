'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {atomic,exists,inside,portable}=require('./workspace.cjs');
class ProjectItems {
 constructor(ws){this.ws=ws;this.queue=Promise.resolve();}
 handle(op,data){const task=this.queue.catch(()=>{}).then(()=>this.run(op,data));this.queue=task;return task;}
 async safe(input,{internal=false}={}){
  const absolute=path.resolve(this.ws.root,input),owner=internal?this.ws.root:await this.ws.containingRoot(absolute),root=owner&&path.resolve(owner);if(!root||!inside(absolute,root)||absolute===root)throw Error('Path outside project');
  const parts=path.relative(root,absolute).split(path.sep);if(!internal&&parts[0].toLowerCase()==='.forge')throw Error('The project trash and internal files are managed separately');
  let current=root;for(const part of parts){current=path.join(current,part);try{if((await fs.lstat(current)).isSymbolicLink())throw Error('File operations do not follow symbolic links or junctions');}catch(error){if(error.code!=='ENOENT')throw error;}}
  return path.resolve(await this.ws.writable(absolute,{internal}));
 }
 async roots(values){if(!Array.isArray(values)||!values.length||values.length>512||values.some(v=>typeof v!=='string'))throw Error('Choose 1 to 512 project items');const files=[...new Set(await Promise.all(values.map(v=>this.safe(v))))].sort((a,b)=>a.length-b.length),roots=[];for(const file of files){await fs.lstat(file);if(!roots.some(parent=>inside(file,parent)))roots.push(file);}return roots;}
 async storage(create=true){const root=await this.safe('.forge',{internal:true}),folder=await this.safe('.forge/trash',{internal:true}),index=await this.safe('.forge/trash-index.json',{internal:true});if(create){await fs.mkdir(root,{recursive:true});await fs.mkdir(folder,{recursive:true});}return{folder,index};}
 async index(storage){try{const value=JSON.parse(await fs.readFile(storage.index,'utf8'));if(!Array.isArray(value)||value.length>10000)throw Error('Invalid project trash index');const ids=new Set();for(const r of value){if(!/^[a-f0-9-]{36}$/.test(r.id)||ids.has(r.id)||typeof r.path!=='string'||r.root!==undefined&&(typeof r.root!=='string'||!path.isAbsolute(r.root))||r.path.split(/[\\/]/).includes('..')||path.isAbsolute(r.path))throw Error('Invalid project trash record');ids.add(r.id);}return value;}catch(error){if(error.code==='ENOENT')return[];throw error;}}
 async scan(file,budget={count:0}){if(++budget.count>100000)throw Error('Too many items in one file operation');const s=await fs.lstat(file);if(s.isSymbolicLink())throw Error('Copy does not follow symbolic links or junctions');if(s.isDirectory())for(const child of await fs.readdir(file))await this.scan(path.join(file,child),budget);return budget;}
 async run(op,d={}){
  if(op==='projectTrashList'){const storage=await this.storage(false);return this.index(storage);}
  this.ws.assertEditable();
  if(op==='projectItemsTrashEmpty'){
   const storage=await this.storage(false),records=await this.index(storage);if(d.confirm!==true)throw Error('Confirm permanent trash deletion');let removed=0;for(const record of [...records]){const target=await this.safe(path.join('.forge','trash',record.id),{internal:true}),folder=path.resolve(storage.folder);if(path.dirname(target)!==folder||!inside(target,folder))throw Error('Trash deletion escaped storage');await fs.rm(target,{recursive:!!record.dir,force:true});records.splice(records.indexOf(record),1);await atomic(storage.index,JSON.stringify(records));removed++;}return{removed};
  }
  if(op==='projectTrashItems'){
   const files=await this.roots(d.paths),storage=await this.storage(),records=await this.index(storage),moved=[];
   return this.ws.withFileOperation('delete',files.map(target=>({target})),async()=>{try{for(const file of files){await this.safe(file);const id=crypto.randomUUID(),target=path.join(storage.folder,id),stat=await fs.lstat(file),record={id,path:portable(path.relative(this.ws.workspaceFile?await this.ws.containingRoot(file):this.ws.root,file)),...this.ws.workspaceFile?{root:await this.ws.containingRoot(file)}:{},dir:stat.isDirectory(),deletedAt:Date.now()};await fs.rename(file,target);moved.push({file,target,record});}await atomic(storage.index,JSON.stringify([...records,...moved.map(e=>e.record)]));return moved.map(e=>e.record);}
   catch(error){for(const item of moved.reverse())await fs.rename(item.target,item.file);throw error;}});
  }
  if(op==='projectTrashRestore'){
   if(!Array.isArray(d.ids)||!d.ids.length||d.ids.length>512||new Set(d.ids).size!==d.ids.length)throw Error('Choose trash items to restore');const storage=await this.storage(),records=await this.index(storage),chosen=d.ids.map(id=>{const record=records.find(r=>r.id===id);if(!record)throw Error('Trash entry unavailable');return record;}),planned=[];
   for(const record of chosen){if(record.root&&!this.ws.folders.some(folder=>inside(folder.path,record.root)&&inside(record.root,folder.path)))throw Error('Restore the workspace folder before restoring its trash');const target=await this.safe(record.root?path.join(record.root,record.path):record.path),source=await this.safe(path.join('.forge','trash',record.id),{internal:true});if(await exists(target))throw Error('Restore destination exists: '+record.path);await fs.lstat(source);planned.push({record,target,source});}
   return this.ws.withFileOperation('create',planned.map(item=>({target:item.target})),async()=>{const restored=[];try{for(const item of planned){await this.safe(item.target);await this.safe(item.source,{internal:true});if(await exists(item.target))throw Error('Restore destination exists: '+item.record.path);await fs.mkdir(path.dirname(item.target),{recursive:true});await fs.rename(item.source,item.target);restored.push(item);}await atomic(storage.index,JSON.stringify(records.filter(r=>!d.ids.includes(r.id))));return restored.map(e=>({path:portable(e.target),dir:e.record.dir}));}catch(error){for(const item of restored.reverse())await fs.rename(item.target,item.source);throw error;}});
  }
  if(op==='projectTransferItems'){
   if(!['copy','move'].includes(d.mode))throw Error('Invalid file operation');const files=await this.roots(d.paths),destination=await this.ws.writable(d.destination,{allowRoot:true});if(!(await fs.stat(destination)).isDirectory())throw Error('Destination is not a folder');const targets=new Set(),planned=[];
   for(const source of files){let target=path.join(destination,path.basename(source));if(d.mode==='copy'&&source.toLowerCase()===target.toLowerCase()){const extension=(await fs.stat(source)).isDirectory()?'':path.extname(source),stem=path.basename(source,extension);let count=1;do{target=path.join(destination,stem+'-copy'+(count===1?'':count)+extension);count++;}while(targets.has(target.toLowerCase())||await exists(target));}if(inside(target,source))throw Error('Cannot paste a folder inside itself');if(targets.has(target.toLowerCase())||await exists(target))throw Error('Destination exists: '+path.basename(target));targets.add(target.toLowerCase());if(d.mode==='copy')await this.scan(source);planned.push({source,target});}
   return this.ws.withFileOperation(d.mode==='move'?'move':'copy',planned.map(item=>({source:item.source,target:item.target})),async()=>{const completed=[];try{for(const item of planned){await this.safe(item.source);await this.safe(item.target);if(await exists(item.target))throw Error('Destination exists: '+path.basename(item.target));if(d.mode==='move'){await this.ws.move(item.source,item.target,true);completed.push(item);}else if((await fs.lstat(item.source)).isDirectory()){await this.scan(item.source);await fs.mkdir(item.target);completed.push(item);await fs.cp(item.source,item.target,{recursive:true,errorOnExist:true,force:false,preserveTimestamps:true,dereference:false});}else{await fs.copyFile(item.source,item.target,require('node:fs').constants.COPYFILE_EXCL);completed.push(item);}}return completed.map(item=>({from:portable(item.source),path:portable(item.target)}));}
   catch(error){for(const item of completed.reverse())if(d.mode==='move')await this.ws.move(item.target,item.source,true);else await this.discardCopy(item.target,destination);throw error;}});
  }
  throw Error('Unknown project file operation');
 }
 async discardCopy(target,parent){const actual=path.resolve(target),root=path.resolve(parent);if(!inside(actual,root)||actual===root)throw Error('Copy rollback escaped destination');await fs.rm(actual,{recursive:true,force:false});}
}
module.exports={ProjectItems};
