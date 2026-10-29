(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.StudioShortcutKeys=value;})(globalThis,()=>{
 'use strict';
 function matches(event,binding){if(event.isComposing||event.getModifierState?.('AltGraph'))return false;const parts=binding.split('+'),key=parts.pop().toLowerCase(),actual=event.key===' '?'space':String(event.key).toLowerCase(),physical=/^Key[A-Z]$/.test(event.code||'')?event.code.slice(3).toLowerCase():actual;return !!(event.ctrlKey||event.metaKey)===parts.includes('Ctrl')&&!!event.altKey===parts.includes('Alt')&&!!event.shiftKey===parts.includes('Shift')&&(key===actual||/^[a-z]$/.test(key)&&key===physical);}
 return Object.freeze({matches});
});
