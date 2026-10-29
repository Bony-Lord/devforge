'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {canonical,inside,exists}=require('./workspace.cjs');
class ProjectLibrary {
 constructor(host){this.host=host;this.ws=host.ws;this.queue=Promise.resolve();}
 async describe(id){const item=this.ws.prefs.projects[id];if(!item)throw Error('Project unavailable');const root=await canonical(item.path);let canTrash=true;try{await this.checkTrash(id,root);}catch{canTrash=false;}return{id,label:item.label,path:root,canTrash};}
 async checkTrash(id,root){
  for(const protectedPath of [os.homedir(),this.ws.data,this.ws.projectsDirectory,path.parse(root).root])if(inside(await canonical(protectedPath),root))throw Error('Protected folder cannot be moved to project trash');
  for(const [other,p]of Object.entries(this.ws.prefs.projects))if(other!==id&&inside(await canonical(p.path),root))throw Error('Folder contains another registered project');
  if((await fs.lstat(root)).isSymbolicLink()||!(await fs.stat(root)).isDirectory())throw Error('Select a regular project folder');
 }
 handle(action,d){const task=this.queue.catch(()=>{}).then(()=>action==='restore'?this.restore(d.id):this.remove(d));this.queue=task;return task;}
 busy(){const t=this.host.tools;return t.building||t.execution||t.gdb||t.dap||this.host.python.busy;}
 async remove(d){
  if(this.busy())throw Error('Stop the running program or notebook cell first');const item=this.ws.prefs.projects[d.id];if(!item)throw Error('Project unavailable');const root=await canonical(item.path);if(d.path!==root||!['forget','trash'].includes(d.mode))throw Error('Project changed; reopen its menu');
  const before=structuredClone(this.ws.prefs);const record={id:crypto.randomUUID(),projectId:d.id,project:structuredClone(item),path:root,mode:d.mode,time:Date.now()};
  if(d.mode==='trash'){
   await this.checkTrash(d.id,root);const parent=path.dirname(root),base=path.join(parent,'.devforge-project-trash');await fs.mkdir(base,{recursive:true});if(await canonical(base)!==await canonical(parent)+'/.devforge-project-trash')throw Error('Project trash must not be a symbolic link');
   const folder=path.join(base,record.id);await fs.mkdir(folder);record.stored=path.join(folder,path.basename(root));const resolved=await canonical(record.stored);if(!inside(resolved,await canonical(base)))throw Error('Project trash escaped its folder');await fs.rename(root,resolved);record.stored=resolved;
  }
  if(this.ws.prefs.current===d.id){await this.host.python.stop();this.host.pythonStyle.stop();await this.host.pythonIntelligence.stop();this.host.tools.stopLsp();this.ws.prefs.current='';this.ws.prefs.projectSelectionCleared=true;this.ws.prefs.session={};}
  try{delete this.ws.prefs.projects[d.id];if(this.ws.prefs.trustedRoots)delete this.ws.prefs.trustedRoots[root];this.ws.prefs.projectArchive??=[];this.ws.prefs.projectArchive.unshift(record);await this.ws.persist();return{removed:record.id,state:await this.host.state()};}catch(error){this.ws.prefs=before;if(record.stored&&!await exists(root)&&await exists(record.stored))await fs.rename(record.stored,root);throw error;}
 }
 list(){return(this.ws.prefs.projectArchive||[]).map(r=>({id:r.id,label:r.project.label,path:r.path,mode:r.mode,time:r.time}));}
 async restore(id){
  if(this.busy())throw Error('Stop the running program or notebook cell first');const archive=this.ws.prefs.projectArchive||[],record=archive.find(r=>r.id===id);if(!record)throw Error('Project archive entry unavailable');if(this.ws.prefs.projects[record.projectId])throw Error('Project is already registered');
  if(record.mode==='trash'){
   const base=await canonical(path.join(path.dirname(record.path),'.devforge-project-trash')),stored=await canonical(record.stored);if(!inside(stored,base)||stored===base)throw Error('Invalid project trash path');if(await exists(record.path))throw Error('Original project folder is occupied; preserve both folders');await fs.rename(stored,record.path);
  }else if(!await exists(record.path))throw Error('Project folder is unavailable');
  this.ws.prefs.projects[record.projectId]=record.project;this.ws.prefs.projectArchive=archive.filter(r=>r!==record);await this.ws.persist();return this.host.state();
 }
}
module.exports={ProjectLibrary};
