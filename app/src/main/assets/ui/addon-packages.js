/* Declarative addons and explicitly reviewed privileged extension modules. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./addon-core.js'):root.StudioAddonCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioAddonPackages=api;})(globalThis,core=>{
  'use strict';
  const ACTIONS=Object.freeze(['editor.focus','editor.resetZoom','ui.settings','ui.focusMode']);
  const COLORS=Object.freeze(['--bg','--deep','--panel','--elev','--hover','--line','--text','--muted','--accent','--accent-bg','--green','--red','--yellow','--purple','--cyan','--surface-inset','--surface-active']);
  const fail=message=>{throw Error(message);};
  function object(value){return value&&typeof value==='object'&&!Array.isArray(value);}
  function label(value){if(typeof value==='string')return value.length>0&&value.length<=240;if(!object(value)||!Object.keys(value).length)return false;return Object.entries(value).every(([k,v])=>/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(k)&&typeof v==='string'&&v.length>0&&v.length<=240);}
  function parse(input){
    const text=typeof input==='string'?input:JSON.stringify(input);if(typeof text!=='string'||new TextEncoder().encode(text).length>262144)fail('Addon package exceeds 256 KiB');let pkg;try{pkg=JSON.parse(text);}catch{fail('Invalid addon JSON');}
    if(!object(pkg)||pkg.format!=='cppstudio.addon'||pkg.formatVersion!==1||Object.keys(pkg).some(k=>!['format','formatVersion','manifest','contributions','module'].includes(k)))fail('Unsupported data addon format');
    const m=core.manifest(pkg.manifest);if(m.id.length>100||!label(m.name)||typeof m.license!=='string'||!m.license||m.license.length>100)fail('Addon name or license is missing');
    if(m.capabilities.some(c=>!['ui.commands','ui.theme','projects.templates','editor.snippets','extensions.full-access'].includes(c)))fail('Executable or unsupported addon capability');
    if(pkg.module!==undefined&&(typeof pkg.module!=='string'||!pkg.module.trim()||pkg.module.length>131072||pkg.module.includes('\0')||!m.capabilities.includes('extensions.full-access')))fail('Executable modules require extensions.full-access');
    if(!Array.isArray(pkg.contributions)||pkg.contributions.length>128)fail('Invalid addon contributions');const ids=new Set();
    for(const c of pkg.contributions){
      if(!object(c)||Object.keys(c).some(k=>!['point','id','value'].includes(k))||typeof c.id!=='string'||!c.id.startsWith(m.id+'/')||c.id.length>180||ids.has(c.id))fail('Invalid or duplicate contribution id');ids.add(c.id);
      if(c.point==='commands'){
        if(!m.capabilities.includes('ui.commands')||!object(c.value)||Object.keys(c.value).some(k=>!['label','action'].includes(k))||!label(c.value.label)||!ACTIONS.includes(c.value.action))fail('Unsupported addon command');
      }else if(c.point==='themes'){
        if(!m.capabilities.includes('ui.theme')||!object(c.value)||!Object.keys(c.value).length)fail('Invalid addon theme');
        for(const [mode,values]of Object.entries(c.value)){if(!['dark','light'].includes(mode)||!object(values)||!Object.keys(values).length)fail('Invalid theme mode');for(const [key,color]of Object.entries(values))if(!COLORS.includes(key)||typeof color!=='string'||!/^#[a-f0-9]{6}([a-f0-9]{2})?$/i.test(color))fail('Unsupported theme color');}
      }else if(c.point==='snippets'){
        if(!m.capabilities.includes('editor.snippets')||!object(c.value)||Object.keys(c.value).some(k=>!['language','prefix','label','body','description'].includes(k))||!['language','prefix','label','body'].every(k=>typeof c.value[k]==='string'&&c.value[k].length>0)||c.value.language.length>80||c.value.prefix.length>160||c.value.label.length>160||c.value.body.length>16384||c.value.description!==undefined&&(typeof c.value.description!=='string'||c.value.description.length>240))fail('Invalid snippet contribution');
      }else if(c.point==='projectTemplates'){
        const templates=typeof module==='object'&&module.exports?require('./project-templates.js'):globalThis.StudioProjectTemplates;
        if(!m.capabilities.includes('projects.templates')||!c.value?.id?.startsWith(m.id+'.'))fail('Invalid template contribution ownership');
        templates.parse(c.value);
      }else fail('Unsupported addon extension point');
    }
    pkg.manifest=m;return freeze(pkg);
  }
  function freeze(value){if(object(value)||Array.isArray(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
  function factory(input,host={}){const pkg=parse(input);return ctx=>{for(const c of pkg.contributions)ctx.contribute(c.point,c.id,c.value);if(pkg.module){if(!host.trusted||!host.ide||!globalThis.StudioExtensionAPI)throw Error('Executable extension has not been reviewed');const activate=new Function('api','\"use strict\";\n'+pkg.module+'\n//# sourceURL=devforge-addon:'+pkg.manifest.id);return activate(StudioExtensionAPI.create(host.ide,ctx));}};}
  function plan({builtins=[],installed=[],available=[],candidate,profile=[],enable=true,safeMode=false}){
    const pack=parse(candidate),existing=installed.map(e=>parse(e.package||e)),offerings=available.map(parse),byKey=new Map();
    for(const p of [...offerings,...existing,pack])byKey.set(p.manifest.id+'@'+p.manifest.version,p);
    const requested=profile.filter(r=>(typeof r==='string'?r:r.id)!==pack.manifest.id);if(enable)requested.push({id:pack.manifest.id,version:pack.manifest.version});else requested.push(...profile.filter(r=>(typeof r==='string'?r:r.id)===pack.manifest.id));
    // Validate an inactive install too, including its dependency closure.
    const roots=enable?[...requested.filter(r=>(typeof r==='string'?r:r.id)!==pack.manifest.id),{id:pack.manifest.id,version:pack.manifest.version}]:[{id:pack.manifest.id,version:pack.manifest.version}];
    const resolved=core.resolve([...builtins,...[...byKey.values()].map(p=>p.manifest)],roots),keys=new Set(existing.map(p=>p.manifest.id+'@'+p.manifest.version));
    const packages=resolved.map(m=>byKey.get(m.id+'@'+m.version)).filter(p=>p&&!keys.has(p.manifest.id+'@'+p.manifest.version));
    return {packages,requested,safeMode:safeMode&&!enable,resolved};
  }
  return Object.freeze({parse,factory,plan,ACTIONS,COLORS});
});
