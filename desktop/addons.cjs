'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {atomic,exists}=require('./workspace.cjs');
const packages=require(require('./assets.cjs').ui+'/addon-packages.js');
class AddonLibrary {
  constructor(host){this.host=host;this.file=path.join(host.ws.data,'addons.json');this.queue=Promise.resolve();}
  async init(){
    this.data={schemaVersion:1,revision:0,packages:[],profile:{schemaVersion:1,modulesVersion:0,requested:[],safeMode:false,activating:false,resolved:[]}};
    if(await exists(this.file))try{this.data=JSON.parse(await fs.readFile(this.file,'utf8'));}catch{this.data=JSON.parse(await fs.readFile(this.file+'.previous','utf8'));this.recovered=true;}
    if(this.data.pending){this.data=this.data.pending.before;this.recovered=true;await this.save();}return this;
  }
  catalog(){return require(require('./assets.cjs').ui+'/addons/catalog.json');}
  state(){return{...structuredClone(this.data),pending:!!this.data.pending,recovered:!!this.recovered};}
  enabled(id){return (this.data.profile.resolved||[]).includes(id);}
  async save(){if(await exists(this.file))await atomic(this.file+'.previous',await fs.readFile(this.file));await atomic(this.file,JSON.stringify(this.data,null,2));}
  mutate(work){const p=this.queue.catch(()=>{}).then(work);this.queue=p;return p;}
  handle(op,d){return this.mutate(async()=>{
    if(op==='addonLibrary')return this.state();if(op==='addonCatalog')return this.catalog();if(op==='addonState')return structuredClone(this.data.profile);
    if(op==='addonStateCommit'){this.profile(d);this.data.profile=structuredClone(d);this.data.revision++;await this.save();return true;}
    if(op==='addonBegin'){
      if(this.data.pending||d.revision!==this.data.revision)throw Error('Stale addon transaction');this.profile(d.profile);const before=structuredClone(this.data),next=structuredClone(this.data);const official=new Map(this.catalog().map(p=>[p.manifest.id+'@'+p.manifest.version,p]));
      for(const item of d.install||[]){let pkg=item.official?official.get(item.official):item.package;if(!pkg)throw Error('Official addon not found');pkg=packages.parse(pkg);if(!item.official&&(!d.accepted||pkg.manifest.id.startsWith('studio.')))throw Error('Accept the third-party installation notice');const key=pkg.manifest.id+'@'+pkg.manifest.version,old=next.packages.find(e=>e.package.manifest.id+'@'+e.package.manifest.version===key);if(old&&JSON.stringify(old.package)!==JSON.stringify(pkg))throw Error('Addon version content is immutable');if(!old)next.packages.push({package:pkg,source:item.official?'bundled-catalog':'local-file',accepted:!item.official});}
      if(d.remove)next.packages=next.packages.filter(e=>e.package.manifest.id+'@'+e.package.manifest.version!==d.remove);
      next.profile=structuredClone(d.profile);next.revision++;const token=crypto.randomUUID();next.pending={token,before};this.data=next;await this.save();return{token,library:this.state()};
    }
    if(op==='addonFinish'){if(this.data.pending?.token!==d.token)throw Error('Stale addon transaction');if(!d.commit)this.data=this.data.pending.before;delete this.data.pending;this.data.revision++;await this.save();return this.state();}
    throw Error('Unsupported addon operation: '+op);
  });}
  profile(value){if(!value||!Array.isArray(value.requested)||value.requested.length>128||!Array.isArray(value.resolved)||value.resolved.some(x=>typeof x!=='string'))throw Error('Invalid addon profile');}
}
module.exports={AddonLibrary};
