(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioPythonIntelligenceModel=api;})(globalThis,()=>{
  'use strict';
  function signature(value){
    const source=value.parameters||[],active=Math.max(0,Math.min(source.length-1,value.activeParameter||0)),start=Math.max(0,active-2),end=Math.min(source.length,Math.max(8,active+4)),parameters=[];let label=(value.name||value.label?.split('(')[0]||'')+'(';
    if(start)label+='…, ';
    for(let i=start;i<end;i++){if(i>start)label+=', ';const name=source[i].split(':')[0].split('=')[0].trim(),at=label.length;label+=name;parameters.push({label:[at,label.length],documentation:source[i]});}
    if(end<source.length)label+=', …';label+=')';
    return{label,parameters,activeParameter:Math.max(0,active-start),documentation:{value:value.documentation||'',isTrusted:false,supportHtml:false},activeDetail:source[active]||''};
  }
  function cellContext(cells,current,text,cursor){let prefix='';for(const cell of cells){if(cell===current)break;if(cell.cell_type==='code'){const source=Array.isArray(cell.source)?cell.source.join(''):cell.source||'';prefix+=source+'\n\n';}}const before=text.slice(0,cursor);return{text:prefix+text,line:prefix.split('\n').length+before.split('\n').length-1,column:[...before.slice(before.lastIndexOf('\n')+1)].length};}
  return {signature,cellContext};
});
