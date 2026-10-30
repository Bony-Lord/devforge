(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioDiagnosticStyle=api;})(globalThis,()=>{
 'use strict';
 function unused(d){const code=typeof d.code==='object'?d.code?.value:d.code;return d.tags?.includes(1)||/(?:unused|unneeded-internal|unreachable)/i.test(String(code||''))||/^(?:unused (?:variable|function|parameter|private field|type alias)|unreachable code)\b/i.test(d.message||'');}
 return Object.freeze({unused});
});
