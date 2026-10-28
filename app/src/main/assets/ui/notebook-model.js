'use strict';
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.StudioNotebook=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const LIMIT=4*1024*1024;
  function lines(value){if(typeof value==='string')return value;if(Array.isArray(value)&&value.every(s=>typeof s==='string'))return value.join('');throw Error('Invalid notebook text');}
  function parse(text){
    if(typeof text!=='string'||text.length>LIMIT)throw Error('Notebook size limit: 4 MB');const value=JSON.parse(text);
    if(value?.nbformat!==4||!Number.isInteger(value.nbformat_minor)||!Array.isArray(value.cells)||value.cells.length>2000||!value.metadata||typeof value.metadata!=='object'||Array.isArray(value.metadata))throw Error('Expected a Jupyter notebook v4');
    const ids=new Set();for(const c of value.cells){if(!c||!['code','markdown','raw'].includes(c.cell_type)||!c.metadata||typeof c.metadata!=='object'||Array.isArray(c.metadata))throw Error('Invalid notebook cell');lines(c.source);if(c.id!==undefined){if(!/^[A-Za-z0-9_-]{1,64}$/.test(c.id)||ids.has(c.id))throw Error('Invalid or duplicate cell id');ids.add(c.id);}if(c.cell_type==='code'&&(!Array.isArray(c.outputs)||c.outputs.length>10000||c.execution_count!==null&&(!Number.isInteger(c.execution_count)||c.execution_count<0)))throw Error('Invalid code cell outputs');}
    return value;
  }
  function serialize(value){const text=JSON.stringify(value,null,2)+'\n';parse(text);return text;}
  function cell(type='code'){if(!['code','markdown','raw'].includes(type))throw Error('Invalid cell type');return{cell_type:type,id:globalThis.crypto?.randomUUID?.().replaceAll('-','')||('cell'+Date.now().toString(36)+Math.random().toString(36).slice(2)),metadata:{},source:'',...(type==='code'?{execution_count:null,outputs:[]}: {})};}
  function empty(){return{nbformat:4,nbformat_minor:5,metadata:{kernelspec:{display_name:'Python 3',language:'python',name:'python3'},language_info:{name:'python'}},cells:[cell()]};}
  function textOutput(output){
    if(!output||typeof output!=='object')return'';
    if(output.output_type==='stream')return lines(output.text);
    if(output.output_type==='error')return Array.isArray(output.traceback)?output.traceback.join('\n'):String(output.ename||'Error')+': '+String(output.evalue||'');
    if(output.data?.['text/plain']!==undefined)return lines(output.data['text/plain']);
    return '[Rich output preserved in file]';
  }
  function append(cell,event){
    if(cell.cell_type!=='code')throw Error('Only code cells execute');
    if(event.type==='stream'){const last=cell.outputs.at(-1);if(last?.output_type==='stream'&&last.name===event.name)last.text=lines(last.text)+event.text;else cell.outputs.push({output_type:'stream',name:event.name==='stderr'?'stderr':'stdout',text:String(event.text)});}
    else if(event.type==='result')cell.outputs.push({output_type:'execute_result',data:{'text/plain':String(event.text)},metadata:{},execution_count:event.count});
    else if(event.type==='error')cell.outputs.push({output_type:'error',ename:String(event.ename),evalue:String(event.evalue),traceback:Array.isArray(event.traceback)?event.traceback.map(String):[]});
    if(Number.isInteger(event.count))cell.execution_count=event.count;
  }
  return Object.freeze({parse,serialize,lines,cell,empty,textOutput,append});
});
