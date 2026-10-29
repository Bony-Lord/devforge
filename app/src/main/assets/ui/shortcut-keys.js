(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.StudioShortcutKeys=value;})(globalThis,()=>{
 'use strict';
 let mappings={};
 function rawMatches(event,binding){if(!binding)return false;if(event.isComposing||event.getModifierState?.('AltGraph'))return false;const literalPlus=binding.endsWith('++'),parts=(literalPlus?binding.slice(0,-1):binding).split('+'),key=literalPlus?(parts.pop(),'+'):parts.pop().toLowerCase(),actual=event.key===' '?'space':String(event.key).toLowerCase(),physical=/^Key[A-Z]$/.test(event.code||'')?event.code.slice(3).toLowerCase():actual;return !!(event.ctrlKey||event.metaKey)===parts.includes('Ctrl')&&!!event.altKey===parts.includes('Alt')&&!!event.shiftKey===(parts.includes('Shift')||key==='+'&&!!event.shiftKey)&&(key===actual||/^[a-z]$/.test(key)&&key===physical);}
 function matches(event,binding){return ((typeof mappings==='function'?mappings(binding,event):mappings[binding])||[binding]).some(value=>rawMatches(event,value));}
 return Object.freeze({matches,rawMatches,setMappings:value=>{mappings=value||{};}});
});
