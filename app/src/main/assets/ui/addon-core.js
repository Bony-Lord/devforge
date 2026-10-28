/* Portable addon kernel. No DOM, Android bridge, filesystem or network access. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioAddonCore=api;})(globalThis,()=>{
  'use strict';
  const API_VERSION='0.1.1',ID=/^[a-z][a-z0-9-]*\.[a-z][a-z0-9.-]*$/;
  const fail=message=>{throw Error(message);};
  function version(value){if(typeof value!=='string'||! /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))fail('Invalid version: '+value);const parts=value.split('.').map(Number);if(parts.some(n=>!Number.isSafeInteger(n)))fail('Version is too large');return parts;}
  function compare(a,b){const x=version(a),y=version(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]<y[i]?-1:1;return 0;}
  function range(value={}){if(typeof value==='string'){version(value);return {exact:value};}if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['min','maxExclusive'].includes(k)))fail('Invalid version range');if('min'in value)version(value.min);if('maxExclusive'in value)version(value.maxExclusive);if(value.min&&value.maxExclusive&&compare(value.min,value.maxExclusive)>=0)fail('Empty version range');return value;}
  function satisfies(value,requirement={}){const r=range(requirement);return r.exact?compare(value,r.exact)===0:(!r.min||compare(value,r.min)>=0)&&(!r.maxExclusive||compare(value,r.maxExclusive)<0);}
  function frozen(value){if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;}
  function manifest(input){
    const encoded=JSON.stringify(input);if(!encoded||encoded.length>65536)fail('Manifest is too large');const m=JSON.parse(encoded);
    if(!ID.test(m.id||''))fail('Invalid addon id');version(m.version);if(m.schemaVersion!==1)fail('Unsupported manifest schema');if(!m.api)fail('Missing API compatibility');range(m.api);
    if(!Array.isArray(m.capabilities)||m.capabilities.length>64||m.capabilities.some(c=>typeof c!=='string'||!ID.test(c)))fail('Invalid capabilities');
    for(const field of ['dependencies','conflicts']){m[field]??={};if(!m[field]||typeof m[field]!=='object'||Array.isArray(m[field])||Object.keys(m[field]).length>64)fail('Invalid '+field);for(const [id,r]of Object.entries(m[field])){if(!ID.test(id)||id===m.id)fail('Invalid dependency: '+id);range(r);}}
    if(m.platforms&&(!Array.isArray(m.platforms)||!m.platforms.length||m.platforms.some(p=>typeof p!=='string')))fail('Invalid platforms');
    return frozen(m); // Unknown fields survive for future schemas and author tooling.
  }
  function order(selected){const result=[],visiting=new Set(),done=new Set();function visit(id){if(visiting.has(id))fail('Dependency cycle: '+id);if(done.has(id))return;visiting.add(id);for(const dep of Object.keys(selected.get(id).dependencies))visit(dep);visiting.delete(id);done.add(id);result.push(selected.get(id));}for(const id of selected.keys())visit(id);return result;}
  function resolve(catalog,requested,{apiVersion=API_VERSION,platform='android',maxSteps=10000,prefer={}}={}){
    version(apiVersion);if(!Array.isArray(catalog)||catalog.length>512||!Array.isArray(requested)||requested.length>128)fail('Addon resolver limit exceeded');
    const groups=new Map(),seen=new Set();for(const input of catalog){const m=manifest(input),key=m.id+'@'+m.version;if(seen.has(key))fail('Duplicate addon version: '+key);seen.add(key);if(!satisfies(apiVersion,m.api)||m.platforms&&!m.platforms.includes(platform))continue;if(!groups.has(m.id))groups.set(m.id,[]);groups.get(m.id).push(m);}for(const list of groups.values())list.sort((a,b)=>Number(b.version===prefer[b.id])-Number(a.version===prefer[a.id])||compare(b.version,a.version));
    const constraints=new Map();function require(map,id,r){if(!ID.test(id))fail('Invalid addon id');range(r);if(!map.has(id))map.set(id,[]);map.get(id).push(r);}
    for(const item of requested)require(constraints,typeof item==='string'?item:item.id,typeof item==='string'?{}:item.version??{});
    let steps=0;
    function search(selected,needs){
      if(++steps>maxSteps)fail('Addon resolver search limit exceeded');
      for(const [id,m]of selected){if(!(needs.get(id)||[]).every(r=>satisfies(m.version,r)))return null;for(const [other,r]of Object.entries(m.conflicts))if(selected.has(other)&&satisfies(selected.get(other).version,r))return null;}
      const unresolved=[...needs.keys()].filter(id=>!selected.has(id));if(!unresolved.length){try{return order(selected);}catch{return null;}}
      unresolved.sort((a,b)=>(groups.get(a)?.length||0)-(groups.get(b)?.length||0));const id=unresolved[0];
      for(const m of groups.get(id)||[]){if(!needs.get(id).every(r=>satisfies(m.version,r)))continue;const next=new Map(selected),requirements=new Map([...needs].map(([k,v])=>[k,[...v]]));next.set(id,m);for(const [dep,r]of Object.entries(m.dependencies))require(requirements,dep,r);const result=search(next,requirements);if(result)return result;}return null;
    }
    return search(new Map(),constraints)||fail('Cannot resolve addons: missing, incompatible, conflicting or cyclic dependencies');
  }
  class Registry {
    constructor(points,onChange=()=>{}){this.points=new Map(Object.entries(points));this.entries=new Map();this.onChange=onChange;this.revision=0;this.forward=null;}
    add(owner,point,id,value){if(this.forward)return this.forward.add(owner,point,id,value);if(!this.points.has(point))fail('Unknown extension point: '+point);const key=point+':'+id;if(this.entries.has(key))fail('Duplicate contribution: '+key);const entry=Object.freeze({owner,point,id,value});this.entries.set(key,entry);this.changed();return()=>this.remove(entry);}
    remove(entry){if(this.forward)return this.forward.remove(entry);const key=entry.point+':'+entry.id;if(this.entries.get(key)===entry){this.entries.delete(key);this.changed();}}
    changed(){this.revision++;try{this.onChange();}catch{/* Host observers cannot break registry cleanup. */}}
    list(point){return this.forward?this.forward.list(point):[...this.entries.values()].filter(e=>e.point===point);}
    transaction(exclude){const parent=this,revision=parent.revision,stage=new Registry(Object.fromEntries(this.points));stage.entries=new Map([...this.entries].filter(([,e])=>!exclude.has(e.owner)));stage.commit=()=>{if(parent.revision!==revision)fail('Addon contributions changed during activation; retry');parent.entries.clear();for(const [key,entry]of stage.entries)parent.entries.set(key,entry);stage.forward=parent;parent.changed();};return stage;}
  }
  class Scope {
    constructor(m,registry,report){this.manifest=m;this.registry=registry;this.report=report;this.disposers=[];this.closed=false;this.abort=new AbortController();}
    check(){if(this.closed)fail('Addon scope is disposed');}
    use(disposable){this.check();const dispose=typeof disposable==='function'?disposable:disposable?.dispose?.bind(disposable);if(!dispose)fail('Expected a disposable');this.disposers.push(dispose);return disposable;}
    contribute(point,id,value){this.check();const capability=this.registry.points.get(point);if(!capability||!this.manifest.capabilities.includes(capability))fail('Capability denied: '+point);if(typeof id!=='string'||!id.startsWith(this.manifest.id+'/')||id.length>180)fail('Contribution id must belong to the addon');return this.use(this.registry.add(this.manifest.id,point,id,value));}
    context(){return Object.freeze({manifest:this.manifest,signal:this.abort.signal,contribute:this.contribute.bind(this),use:this.use.bind(this)});}
    async dispose(){if(this.closed)return;this.closed=true;this.abort.abort();for(const dispose of this.disposers.reverse())try{await dispose();}catch(e){try{this.report(e,this.manifest.id);}catch{}}this.disposers=[];}
  }
  class Manager {
    constructor({catalog,factories,registry,platform='android',apiVersion=API_VERSION,report=()=>{},timeout=5000}){this.catalog=catalog.map(manifest);this.factories=factories;this.registry=registry;this.platform=platform;this.apiVersion=apiVersion;this.report=report;this.timeout=timeout;this.active=new Map();this.requested=[];this.safeMode=false;this.tail=Promise.resolve();}
    enqueue(work){const next=this.tail.then(work);this.tail=next.catch(()=>{});return next;}
    setProfile(requested,{safeMode=false}={}){const input=JSON.parse(JSON.stringify(requested));return this.enqueue(()=>this.reconcile(input,safeMode));}
    async reconcile(requested,safeMode){
      const roots=new Set(requested.map(r=>typeof r==='string'?r:r.id)),prefer=Object.fromEntries([...this.active].filter(([id])=>!roots.has(id)).map(([id,e])=>[id,e.manifest.version]));
      const target=safeMode?[]:resolve(this.catalog,requested,{platform:this.platform,apiVersion:this.apiVersion,prefer}),wanted=new Map(target.map(m=>[m.id,m]));
      const retiring=new Set([...this.active].filter(([id,e])=>!wanted.has(id)||wanted.get(id).version!==e.manifest.version).map(([id])=>id)),stage=this.registry.transaction(retiring);
      const added=[];try{for(const m of target){if(this.active.get(m.id)?.manifest.version===m.version)continue;const activate=this.factories.get(m.id+'@'+m.version);if(typeof activate!=='function')fail('No trusted loader: '+m.id);const scope=new Scope(m,stage,(e,id)=>this.report(e,id));added.push({manifest:m,scope});let timer;try{const result=await Promise.race([Promise.resolve().then(()=>activate(scope.context())),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Addon activation timed out: '+m.id)),this.timeout);})]);if(result)scope.use(result);}finally{clearTimeout(timer);}}stage.commit();}
      catch(error){for(const entry of added.reverse())await entry.scope.dispose();try{this.report(error,added[0]?.manifest.id);}catch{}throw error;}
      for(const [id,entry]of [...this.active].reverse())if(retiring.has(id)){await entry.scope.dispose();this.active.delete(id);}
      for(const entry of added)this.active.set(entry.manifest.id,entry);this.requested=requested;this.safeMode=safeMode;return this.status();
    }
    status(){return {requested:JSON.parse(JSON.stringify(this.requested)),safeMode:this.safeMode,active:[...this.active.values()].map(e=>({id:e.manifest.id,version:e.manifest.version}))};}
    dispose(){return this.setProfile([]);}
  }
  return Object.freeze({API_VERSION,version,compare,satisfies,manifest,resolve,Registry,Manager});
});
