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
  function groupState(members,resolved){const active=new Map(resolved.map(m=>[m.id,m.version])),count=members.filter(m=>active.get(m.id)===m.version).length,total=members.length;return{checked:total>0&&count===total,partial:count>0&&count<total,count,total};}
  function toggleGroup(catalog,requested,members,checked){
    if(!members.length)return requested;const selected=new Set(members.map(m=>m.id));if(checked){const next=[...requested.filter(r=>!selected.has(id(r))),...members.map(request)];core.resolve(catalog,next);return next;}
    const roots=manual(catalog,requested),resolved=new Map(core.resolve(catalog,roots).map(m=>[m.id,m])),memo=new Map();
    function depends(name){if(memo.has(name))return memo.get(name);const yes=selected.has(name)||Object.keys(resolved.get(name)?.dependencies||{}).some(depends);memo.set(name,yes);return yes;}
    return roots.filter(r=>!depends(id(r)));
  }
  function groups(catalog){
    const latest=new Map();for(const m of catalog){if(m.kind==='pack'||!core.satisfies(core.API_VERSION,m.api)||m.platforms&&!m.platforms.includes(core.currentPlatform()))continue;const old=latest.get(m.id);if(!old||core.compare(m.version,old.version)>0)latest.set(m.id,m);}
    const order=['languages','projects','editing','analysis','workspace','tools','extensions'],result=new Map(order.map(id=>[id,[]]));
    for(const m of latest.values()){const group=m.nativePack?'tools':m.kind==='language'?'languages':m.kind==='project'?'projects':m.installationGroup||((m.kind==='feature'||m.kind==='view')?'editing':'extensions');(result.get(group)||result.get('extensions')).push(m);}return [...result].filter(([,members])=>members.length).map(([id,members])=>({id,members}));
  }
  function view(saved={}){if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};const offset=value=>Math.min(10000000,Math.max(0,Number(value)||0));return {tab:saved.tab==='components'?'components':'packs',expanded:Array.isArray(saved.expanded)?saved.expanded.filter(x=>typeof x==='string'&&x.length<=140).slice(0,128):[],search:typeof saved.search==='string'?saved.search.slice(0,120):'',selectedOnly:!!saved.selectedOnly,scroll:{packs:offset(saved.scroll?.packs),components:offset(saved.scroll?.components)}};}
  function changes(catalog,before,after){const old=core.resolve(catalog,before),next=core.resolve(catalog,after),a=new Map(old.map(m=>[m.id,m])),b=new Map(next.map(m=>[m.id,m]));return {previous:old,resolved:next,added:next.filter(m=>a.get(m.id)?.version!==m.version),removed:old.filter(m=>b.get(m.id)?.version!==m.version)};}
  return Object.freeze({members,state,manual,toggle,groupState,toggleGroup,groups,view,changes});
});
