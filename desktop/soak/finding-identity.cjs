'use strict';
const {createHash}=require('node:crypto');
function stable(value){return String(value??'').replace(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/[a-f0-9]{32,64}\//gi,'<app>/').replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,'<uuid>').replace(/\b\d{4}-\d\d-\d\dT\d\d[-:]\d\d[-:]\d\d(?:[-.]\d{3})?Z(?:-[a-f0-9]+)?/g,'<run>').replace(/([.](?:c?js|mjs|html)):\d+(?::\d+)?/g,'$1:<line>').replace(/\(node:\d+\)/g,'(node:<pid>)').trim();}
function identity(finding,{includeSite=true}={}){
 const detail=String(finding.signature||finding.detail||''),title=stable(finding.title);
 const frame=/^\s*at\s+(?:async\s+)?([^\n]+)/m.exec(detail)?.[1],site=frame?stable(frame).replace(/\s*\(.*/, '').replace(/^(?:[A-Z]:[\\/]|https?:\/\/)[^\s]+[\\/]([^\\/]+)$/i,'$1'):'';
 // Geometry changes are separate observations of the same clipped control.
 const cause=finding.kind==='visual'&&/^control-clipped/.test(title)?stable(finding.selector||finding.element?.selector||''):finding.kind==='resource'&&title==='Application memory budget exceeded'?'application-memory-budget':finding.kind==='resource'?stable(detail).replace(/\b\d+(?:\.\d+)?\b/g,'<n>'):stable(detail.split('\n')[0]);
 return createHash('sha256').update(JSON.stringify([finding.kind,title,cause,...includeSite&&site?[site]:[]])).digest('hex').slice(0,20);
}
function groupFindings(entries){
 const groups=new Map();for(const {finding,source}of entries){const key=identity(finding),occurrence={source,id:finding.id,count:finding.count||1,firstSeen:finding.firstSeen,lastSeen:finding.lastSeen},old=groups.get(key);if(old){old.count+=occurrence.count;old.occurrences.push(occurrence);if(finding.lastSeen>old.lastSeen)old.lastSeen=finding.lastSeen;}else groups.set(key,{...finding,id:key,count:occurrence.count,occurrences:[occurrence]});}return[...groups.values()];
}
module.exports={stable,identity,groupFindings};
