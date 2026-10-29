(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioNotebookResourceControls=api;})(globalThis,()=>{
 'use strict';
 const fields=[['notebookMemoryMb',64,1048576],['notebookTimeoutSeconds',1,86400],['notebookTotalSeconds',1,604800],['notebookDiskMb',64,1048576],['notebookCpuPercent',1,100]];
 function value(position,min,max){position=Math.max(0,Math.min(100,Number(position)||0));if(!position)return 0;if(max===100)return Math.round(position);const raw=min*Math.pow(max/min,(position-1)/99),step=min===64?64:1;return Math.max(min,Math.min(max,Math.round(raw/step)*step));}
 function position(input,min,max){const n=Number(input);if(!(n>0))return 0;if(max===100)return Math.min(100,n);return Math.max(1,Math.min(100,1+99*Math.log(Math.max(min,n)/min)/Math.log(max/min)));}
 return{fields,value,position};
});
