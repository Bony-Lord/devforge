(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioNotebookResourceControls=api;})(globalThis,()=>{
 'use strict';
 const fields=[['notebookMemoryMb',64,1048576],['notebookTimeoutSeconds',1,86400],['notebookTotalSeconds',1,604800],['notebookDiskMb',64,1048576],['notebookCpuPercent',1,100]];
 function value(position,min,max){position=Math.max(0,Math.min(100,Number(position)||0));if(position===100)return 0;max=Math.max(min,max);const raw=max===100?min+(max-min)*position/99:min*Math.pow(max/min,position/99),step=min===64?64:1;return Math.max(min,Math.min(max,Math.round(raw/step)*step));}
 function position(input,min,max){const n=Number(input);if(!(n>0))return 100;if(max<=min)return 0;return Math.max(0,Math.min(99,max===100?(n-min)*99/(max-min):99*Math.log(Math.max(min,n)/min)/Math.log(max/min)));}
 function parse(input){const text=String(input).trim();if(/^(?:∞|inf(?:inity)?|unlimited)$/i.test(text))return 0;if(!/^\d+$/.test(text))return NaN;return Number(text);}
 return{fields,value,position,parse};
});
