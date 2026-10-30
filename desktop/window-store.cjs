'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {Workspace,atomic,exists}=require('./workspace.cjs');
const {AddonLibrary}=require('./addons.cjs');
const localKeys=new Set(['current','session','window','projectSelectionCleared','windowAddonProfile']);
/** One global library, separate editor/execution sessions. All writes share a queue. */
class WindowStore {
 constructor(data,projectsDirectory){this.data=data;this.projectsDirectory=projectsDirectory;this.queue=Promise.resolve();this.sessions=new Map();}
 async init(){const workspace=await new Workspace(this.data,this.projectsDirectory).init();this.global={projectArchive:[],trustedRoots:{},configurationSelection:{},...workspace.prefs};this.legacy=Object.fromEntries([...localKeys].map(k=>[k,workspace.prefs[k]]));for(const key of localKeys)delete this.global[key];this.file=workspace.file;return this;}
 async workspace(project,initial=false,readOnly=false){
  if(project&&!this.global.projects[project])throw Error('Project unavailable');
  const key=readOnly?'reader-'+crypto.randomUUID():initial?'main':crypto.createHash('sha256').update(project||'empty').digest('hex').slice(0,24),file=path.join(this.data,'window-sessions',key+'.json');
  let local={current:project||'',session:{}};if(await exists(file)){try{local=JSON.parse(await fs.readFile(file,'utf8'));}catch{}}else if(initial)local={...this.legacy};if(project)local.current=project;
  if(!this.global.projects[local.current]){local.current='';local.session={};}
  const ws=new Workspace(this.data,this.projectsDirectory);let prefs;
  const bind=value=>{const object={};for(const k of localKeys)if(value[k]!==undefined)object[k]=value[k];for(const k of new Set([...Object.keys(this.global),...Object.keys(value).filter(k=>!localKeys.has(k))]))Object.defineProperty(object,k,{enumerable:true,configurable:true,get:()=>this.global[k],set:v=>{this.global[k]=v;}});return object;};
  prefs=bind({...this.global,...local});Object.defineProperty(ws,'prefs',{get:()=>prefs,set:value=>{for(const k of Object.keys(value))if(!localKeys.has(k))this.global[k]=value[k];prefs=bind(value);}});
  ws.projectReadOnly=readOnly;ws.init=async()=>ws;
  ws.persist=()=>{const snapshot=Object.fromEntries([...localKeys].filter(k=>ws.prefs[k]!==undefined).map(k=>[k,structuredClone(ws.prefs[k])]));const task=this.queue.catch(()=>{}).then(async()=>{await atomic(file,JSON.stringify(snapshot,null,2));if(initial)this.legacy=snapshot;await atomic(this.file,JSON.stringify({...this.global,...this.legacy},null,2));});this.queue=task;return task;};
  return ws;
 }
 addonFacade(host){
  if(!this.addons){this.addons=new AddonLibrary(host);this.addonsReady=this.addons.init();}
  return new WindowAddons(host,this);
 }
}
class WindowAddons {
 constructor(host,store){this.host=host;this.store=store;this.base=store.addons;this.profile=null;}
 async init(){await this.store.addonsReady;this.profile=structuredClone(this.host.ws.prefs.windowAddonProfile||this.base.data.profile);return this;}
 catalog(){return this.base.catalog();}
 state(){return{...this.base.state(),profile:{...structuredClone(this.profile),defaultRequested:structuredClone(this.base.data.profile.defaultRequested||this.base.data.profile.requested||[])}};}
 enabled(id){return(this.profile.resolved||[]).includes(id);}
 async remember(){this.host.ws.prefs.windowAddonProfile=structuredClone(this.profile);await this.host.ws.persist();}
 async handle(op,d){
  if(op==='addonLibrary')return this.state();if(op==='addonCatalog')return this.catalog();if(op==='addonState')return this.state().profile;
  const defaults=d.defaultRequested||this.base.data.profile.defaultRequested||this.base.data.profile.requested||[];
  if(op==='addonStateCommit'){this.profile=structuredClone(d);await this.base.handle(op,{...d,defaultRequested:structuredClone(defaults)});await this.remember();return true;}
  if(op==='addonBegin'){this.before=structuredClone(this.profile);const result=await this.base.handle(op,{...d,profile:{...d.profile,defaultRequested:structuredClone(defaults)}});this.profile=structuredClone(d.profile);return{token:result.token,library:this.state()};}
  if(op==='addonFinish'){await this.base.handle(op,d);if(!d.commit&&this.before)this.profile=this.before;this.before=null;await this.remember();return this.state();}
  throw Error('Unsupported addon operation');
 }
}
module.exports={WindowStore};
