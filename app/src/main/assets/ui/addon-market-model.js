(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioMarketplace=api;})(globalThis,()=>{
 'use strict';
 const normalize=s=>String(s||'').normalize('NFKC').toLocaleLowerCase();
 function local(value,locale){return typeof value==='string'?value:value?.[locale]||value?.en||'';}
 function compatible(m,platform){return !m.platforms||m.platforms.includes(platform);}
 function entries({catalog=[],available=[],installed=[]}){
  const result=new Map();
  for(const m of catalog)result.set(m.id,{manifest:m,builtin:!installed.some(e=>e.package.manifest.id===m.id),package:installed.find(e=>e.package.manifest.id===m.id&&e.package.manifest.version===m.version)?.package});
  for(const pkg of available)if(!result.has(pkg.manifest.id))result.set(pkg.manifest.id,{manifest:pkg.manifest,builtin:false,package:pkg});
  return [...result.values()];
 }
 function search(entries,{query='',platform,showOtherPlatforms=false,kind='all',status='all',locale='en',active=[],installed=[]}={}){
  const enabled=new Set(active),present=new Set(installed),tokens=normalize(query).match(/"[^"]+"|\S+/g)||[];
  const matches=entries.filter(e=>{
   const m=e.manifest,pack=m.kind==='pack',on=enabled.has(m.id),has=e.installed??(e.builtin||present.has(m.id));
   if(!showOtherPlatforms&&!compatible(m,platform)||kind==='packs'&&!pack||kind==='extensions'&&pack||status==='enabled'&&!on||status==='installed'&&!has||status==='available'&&has)return false;
   const haystack=normalize([m.id,local(m.name,locale),local(m.description,locale),...(m.tags||[]),...Object.keys(m.dependencies||{}),m.category].join(' '));
   return tokens.every(token=>token==='@installed'?has:token==='@enabled'?on:token==='@pack'?pack:token==='@builtin'?e.builtin:token.startsWith('@platform:')?compatible(m,token.slice(10)):haystack.includes(token.replace(/^"|"$/g,'')));
  });
  return matches.sort((a,b)=>Number(enabled.has(b.manifest.id))-Number(enabled.has(a.manifest.id))||local(a.manifest.name,locale).localeCompare(local(b.manifest.name,locale)));
 }
 function screenshot(value){return typeof value==='string'&&(/^(?:addons\/previews\/[a-zA-Z0-9._-]+\.(?:png|jpg|webp))$/.test(value)||value.length<=131072&&/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/]+=*$/.test(value));}
 return Object.freeze({entries,search,compatible,screenshot,local});
});
