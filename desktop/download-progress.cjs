'use strict';
// Observe package bytes without reading ahead or buffering the response body.
const {syncBuiltinESMExports}=require('node:module');
function packageRequest(args){
 try{const first=args[0],options=typeof first==='object'&&!(first instanceof URL)?first:null;
 const url=options?new URL((options.protocol||'https:')+'//'+(options.hostname||options.host)+(options.path||'/')):new URL(String(first));
 if(!['open-vsx.org','www.open-vsx.org'].includes(url.hostname)||!url.pathname.endsWith('.vsix'))return null;
 const pieces=url.pathname.split('/');return {id:pieces.slice(2,4).join('.'),version:pieces[4]||''};
 }catch{return null;}
}
function install(emit){
 const restorers=[],redirects=new Map();let sequence=0;
 for(const protocol of ['node:http','node:https']){const module=require(protocol),original=module.request;
 function request(...args){let address;try{address=String(args[0] instanceof URL?args[0].href:typeof args[0]==='string'?args[0]:new URL((args[0].protocol||'https:')+'//'+(args[0].hostname||args[0].host)+(args[0].path||'/')).href);}catch{}const previous=redirects.get(address),info=packageRequest(args)||(previous?.expires>Date.now()?previous.info:null),req=Reflect.apply(original,this,args);if(!info)return req;
 const job='vsix-'+process.pid+'-'+(++sequence);let bytes=0,total=0,last=0,finished=false;
 const send=(phase,error)=>emit({job,...info,phase,bytes,total,error});
 req.prependOnceListener('response',response=>{if([301,302,303,307,308].includes(response.statusCode)){try{const next=new URL(response.headers.location,address);if(next.protocol==='https:'){if(redirects.size>=32)redirects.delete(redirects.keys().next().value);redirects.set(next.href,{info,expires:Date.now()+60000});}}catch{}return;}if(response.statusCode!==200)return;total=Number(response.headers['content-length'])||0;send('download');
 response.on('data',chunk=>{bytes+=chunk.length;const now=Date.now();if(now-last>=150){last=now;send('download');}});
 response.once('end',()=>{finished=true;send('complete');});response.once('error',()=>{finished=true;send('error','Download failed');});response.once('aborted',()=>{if(!finished){finished=true;send('error','Download interrupted');}});
 });req.once('error',()=>{if(!finished)send('error','Download failed');});return req;
 }module.request=request;restorers.push(()=>{if(module.request===request)module.request=original;});}
 syncBuiltinESMExports();return()=>{restorers.forEach(restore=>restore());syncBuiltinESMExports();};
}
module.exports={install,packageRequest};
