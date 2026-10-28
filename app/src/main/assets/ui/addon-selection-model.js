/* Portable workload/component selection shared by setup and the addon manager. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./addon-core.js'):root.StudioAddonCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioAddonSelection=api;})(globalThis,core=>{
  'use strict';
  const id=r=>typeof r==='string'?r:r.id;
  const request=m=>({id:m.id,version:m.version});
  function members(catalog,manifest){const resolved=core.resolve(catalog,[request(manifest)]);return manifest.kind==='pack'?resolved.filter(m=>m.kind!=='pack'):resolved.filter(m=>m.id===manifest.id);}
  function state(catalog,requested,manifest,resolved=core.resolve(catalog,requested),contents=members(catalog,manifest)){
    const active=new Map(resolved.map(m=>[m.id,m.version]));
    const count=contents.filter(m=>active.get(m.id)===m.version).length,total=contents.length;
    const direct=requested.some(r=>id(r)===manifest.id);
    return {checked:total>0?count===total:direct,partial:count>0&&count<total,count,total,direct};
  }
  function manual(catalog,requested){
    const resolved=core.resolve(catalog,requested),selected=new Map(resolved.map(m=>[m.id,m])),roots=new Map();
    function expand(name){const m=selected.get(name);if(!m)return;if(m.kind==='pack')for(const dependency of Object.keys(m.dependencies||{}))expand(dependency);else roots.set(name,request(m));}
    for(const r of requested)expand(id(r));return [...roots.values()];
  }
  function toggle(catalog,requested,manifest,checked){
    if(checked){const next=[...requested.filter(r=>id(r)!==manifest.id),request(manifest)];core.resolve(catalog,next);return next;}
    // Expand packs before removing a component so unrelated workload features survive.
    const roots=manual(catalog,requested);
    if(manifest.kind==='pack'){const owned=new Set(members(catalog,manifest).map(m=>m.id));return roots.filter(r=>!owned.has(id(r)));}
    return roots.filter(r=>!core.resolve(catalog,[r]).some(m=>m.id===manifest.id));
  }
  function changes(catalog,before,after){const old=core.resolve(catalog,before),next=core.resolve(catalog,after),a=new Map(old.map(m=>[m.id,m])),b=new Map(next.map(m=>[m.id,m]));return {previous:old,resolved:next,added:next.filter(m=>a.get(m.id)?.version!==m.version),removed:old.filter(m=>b.get(m.id)?.version!==m.version)};}
  return Object.freeze({members,state,manual,toggle,changes});
});
