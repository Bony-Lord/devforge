(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioProjectPaths=api;})(globalThis,()=>{
  'use strict';
  function normalize(input,base=''){
    let value=String(input||'').replaceAll('\\','/'),parent=String(base||'').replaceAll('\\','/');
    if(!/^(?:[A-Za-z]:\/|\/)/.test(value))value=parent.replace(/\/$/,'')+'/'+value;
    const drive=value.match(/^\/?([A-Za-z]):\//),unc=!drive&&value.startsWith('//');
    if(drive)value=value.slice(drive[0].length);else value=value.replace(/^\/+/, '');
    const parts=[];for(const part of value.split('/'))if(part==='..'){if(parts.length)parts.pop();}else if(part&&part!=='.')parts.push(part);
    return(drive?drive[1].toLowerCase()+':/':unc?'//':'/')+parts.join('/');
  }
  function key(input,base=''){const path=normalize(input,base);return/^(?:[a-z]:\/|\/\/)/i.test(path)?path.toLowerCase():path;}
  return Object.freeze({normalize,key,equal:(a,b)=>key(a)===key(b)});
});
