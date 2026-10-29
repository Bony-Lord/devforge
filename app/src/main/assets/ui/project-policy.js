'use strict';
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.StudioProjectPolicy=api;})(globalThis,()=>{
  const kinds=['build','run','debug'];
  function defaults(c){
    if(c.type==='python')return{run:{provider:'python.run'}};
    if(c.type==='notebook')return{run:{provider:'notebook.runAll'}};
    if(c.type==='custom')return{...(c.buildCommands?.length?{build:{provider:'process.build'}}:{}),...(c.runCommand?.length?{run:{provider:'process.run'}}:{})};
    if(c.type==='executable')return{run:{provider:'cpp.executable'},debug:{provider:'cpp.debug'}};
    if(['file','project','cmake'].includes(c.type))return{build:{provider:'cpp.build'},run:{provider:'cpp.run'},debug:{provider:'cpp.debug'}};
    return{};
  }
  function validate(document){
    if(document.addons!==undefined){const a=document.addons;if(!a||typeof a!=='object'||Array.isArray(a)||!['inherit','project'].includes(a.mode)||a.mode==='project'&&(!Array.isArray(a.requested)||a.requested.length>128||a.requested.some(r=>typeof r!=='string'&&(!r||typeof r.id!=='string'))))throw Error('Invalid project addon profile');}
    if(document.interface!==undefined){const ui=document.interface;if(!ui||typeof ui!=='object'||Array.isArray(ui)||ui.mode!==undefined&&!['inherit','simple','windows'].includes(ui.mode))throw Error('Invalid project interface');}
    for(const c of document.configurations||[]){if(c.actions===undefined)continue;if(!c.actions||typeof c.actions!=='object'||Array.isArray(c.actions)||Object.keys(c.actions).some(k=>!kinds.includes(k)))throw Error('Invalid run actions');for(const a of Object.values(c.actions)){if(!a||typeof a!=='object'||Array.isArray(a)||typeof a.provider!=='string'||!/^[a-zA-Z][\w.-]{0,99}$/.test(a.provider))throw Error('Invalid action provider');if(a.argv!==undefined&&(!Array.isArray(a.argv)||!a.argv.length||a.argv.length>256||a.argv.some(v=>typeof v!=='string'||v.includes('\0'))))throw Error('Invalid action argv');if(a.label!==undefined&&typeof a.label!=='string')throw Error('Invalid action label');}}
    return document;
  }
  function action(document,kind){const c=document?.configurations?.find(c=>c.id===document.active);return c?.actions?.[kind]||null;}
  function profile(document,base){if(document?.addons?.mode!=='project')return base;const merged=new Map(base.map(r=>[typeof r==='string'?r:r.id,r]));for(const r of document.addons.requested)merged.set(typeof r==='string'?r:r.id,r);return [...merged.values()];}
  return Object.freeze({kinds,defaults,validate,action,profile});
});
