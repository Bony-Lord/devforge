'use strict';
// Observe package bytes without reading ahead or buffering the response body.
const {syncBuiltinESMExports}=require('node:module');
function packageRequest(args){
 try{const first=args[0],options=typeof first==='object'&&!(first instanceof URL)?first:null;
 const url=options?new URL((options.protocol||'https:')+'//'+(options.hostname||options.host)+(options.path||'/')):new URL(String(first));
 if(!['open-vsx.org','www.open-vsx.org'].includes(url.hostname))return null;
 const pieces=url.pathname.split('/');if(/^\/vscode\/asset\//.test(url.pathname)&&pieces[6]==='Microsoft.VisualStudio.Services.VSIXPackage')return{id:pieces.slice(3,5).join('.'),version:pieces[5]||''};
 if(!url.pathname.endsWith('.vsix'))return null;return {id:pieces.slice(2,4).join('.'),version:pieces[4]||''};
 }catch{return null;}
}
function install(emit){
 const restorers=[],redirects=new Map();let sequence=0;
 // The current upstream agent downloads through fetch/Undici. Observe its
 // diagnostics instead of wrapping/buffering the body or changing backpressure.
 const requests=new WeakMap(),dc=require('node:diagnostics_channel');
 const subscribe=(name,handler)=>{const channel=dc.channel(name),safe=value=>{try{handler(value);}catch{}};channel.subscribe(safe);restorers.push(()=>channel.unsubscribe(safe));};
 const send=(record,phase,error)=>emit({job:record.job,...record.info,bytes:record.bytes,total:record.total,phase,error});
 subscribe('undici:request:create',({request})=>{if(request.method&&request.method!=='GET')return;const address=String(request.origin)+request.path,previous=redirects.get(address),info=packageRequest([address])||(previous?.expires>Date.now()?previous.info:null);if(info)requests.set(request,{info,address,job:'vsix-'+process.pid+'-'+(++sequence),bytes:0,total:0,last:0});});
 subscribe('undici:request:headers',({request,response})=>{const record=requests.get(request);if(!record)return;const headers={};for(let i=0;i<response.headers.length;i+=2)headers[String(response.headers[i]).toLowerCase()]=String(response.headers[i+1]);if([301,302,303,307,308].includes(response.statusCode)){const next=new URL(headers.location,record.address);if(next.protocol==='https:'){if(redirects.size>=32)redirects.delete(redirects.keys().next().value);redirects.set(next.href,{info:record.info,expires:Date.now()+60000});}requests.delete(request);return;}if(response.statusCode!==200){requests.delete(request);return;}record.total=Number(headers['content-length'])||0;send(record,'download');});
 subscribe('undici:request:bodyChunkReceived',({request,chunk})=>{const record=requests.get(request);if(!record)return;record.bytes+=chunk.length;const now=Date.now();if(now-record.last>=150){record.last=now;send(record,'download');}});
 subscribe('undici:request:trailers',({request})=>{const record=requests.get(request);if(record){send(record,'complete');requests.delete(request);}});
 subscribe('undici:request:error',({request})=>{const record=requests.get(request);if(record){send(record,'error','Download interrupted');requests.delete(request);}});
 for(const protocol of ['node:http','node:https']){const module=require(protocol),original=module.request;
 function request(...args){let address;try{address=String(args[0] instanceof URL?args[0].href:typeof args[0]==='string'?args[0]:new URL((args[0].protocol||'https:')+'//'+(args[0].hostname||args[0].host)+(args[0].path||'/')).href);}catch{}const previous=redirects.get(address),info=packageRequest(args)||(previous?.expires>Date.now()?previous.info:null),req=Reflect.apply(original,this,args);if(!info||req.method&&req.method!=='GET')return req;
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
