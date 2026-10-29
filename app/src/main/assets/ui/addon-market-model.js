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
 function search(entries,{query='',platform,showOtherPlatforms=false,kind='all',status='all',category='all',publisher='all',capability='all',sort='enabled',locale='en',active=[],installed=[]}={}){
  const enabled=new Set(active),present=new Set(installed),tokens=normalize(query).match(/"[^"]+"|\S+/g)||[];
  const matches=entries.filter(e=>{
   const m=e.manifest,pack=m.kind==='pack',on=enabled.has(m.id),has=e.installed??(e.builtin||present.has(m.id));
   if(category!=='all'&&(m.installationGroup||m.category||m.kind||'extensions')!==category||publisher!=='all'&&(e.official?'DevForge':m.publisher||'Other')!==publisher||capability!=='all'&&!m.capabilities?.includes(capability)||status==='disabled'&&(!has||on)||status==='incompatible'&&compatible(m,platform))return false;
   if(!showOtherPlatforms&&!compatible(m,platform)||kind==='packs'&&!pack||kind==='extensions'&&pack||!['all','packs','extensions'].includes(kind)&&m.kind!==kind||status==='enabled'&&!on||status==='installed'&&!has||status==='available'&&has)return false;
   const haystack=normalize([m.id,local(m.name,locale),local(m.description,locale),...(m.tags||[]),...Object.keys(m.dependencies||{}),m.category].join(' '));
   return tokens.every(token=>token==='@installed'?has:token==='@enabled'?on:token==='@disabled'?has&&!on:token==='@pack'?pack:token==='@builtin'?e.builtin:token.startsWith('@category:')?normalize(m.installationGroup||m.category||m.kind).includes(token.slice(10)):token.startsWith('@publisher:')?normalize(m.publisher||'DevForge').includes(token.slice(11)):token.startsWith('@capability:')?m.capabilities?.some(c=>normalize(c).includes(token.slice(12))):token.startsWith('@platform:')?compatible(m,token.slice(10)):token.startsWith('-')?!haystack.includes(token.slice(1)):haystack.includes(token.replace(/^"|"$/g,'')));
  });
  return matches.sort((a,b)=>(sort==='enabled'?Number(enabled.has(b.manifest.id))-Number(enabled.has(a.manifest.id)):sort==='publisher'?String(a.manifest.publisher||'DevForge').localeCompare(b.manifest.publisher||'DevForge'):sort==='version'?b.manifest.version.localeCompare(a.manifest.version,undefined,{numeric:true}):0)||local(a.manifest.name,locale).localeCompare(local(b.manifest.name,locale)));
 }
 function screenshot(value){return typeof value==='string'&&(/^(?:addons\/previews\/[a-zA-Z0-9._-]+\.(?:png|jpg|webp))$/.test(value)||value.length<=131072&&/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/]+=*$/.test(value));}
 return Object.freeze({entries,search,compatible,screenshot,local});
});
