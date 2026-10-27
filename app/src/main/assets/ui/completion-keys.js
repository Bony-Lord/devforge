'use strict';
const CompletionKeys={
  choices:['Ctrl+Alt+Enter','Ctrl+Alt+P','Ctrl+Alt+I','Ctrl+Shift+Space','Ctrl+Alt+Space'],
  defaults:{completionShortcut:'Ctrl+Alt+Space',parameterShortcut:'Ctrl+Alt+P'},
  value(settings,name){return this.choices.includes(settings[name])?settings[name]:this.defaults[name];},
  matches(event,binding){const parts=binding.split('+'),key=parts.at(-1).toLowerCase(),actual=event.key===' '?'space':String(event.key).toLowerCase();return !!event.ctrlKey&&!event.metaKey&&!!event.altKey===parts.includes('Alt')&&!!event.shiftKey===parts.includes('Shift')&&key===actual;},
  conflict(settings){return this.value(settings,'completionShortcut')===this.value(settings,'parameterShortcut');},
  handle(ide,event){
    if(typeof document!=='undefined'&&(document.querySelector('dialog[open]')||event.target?.closest?.('input,select,textarea,[contenteditable=true]')&&!event.target.closest('.monaco-editor')))return false;
    const name=this.matches(event,this.value(ide.settings,'completionShortcut'))?'editor.action.triggerSuggest':this.matches(event,this.value(ide.settings,'parameterShortcut'))?'editor.action.triggerParameterHints':null;
    if(!name)return false;event.preventDefault();event.stopImmediatePropagation();Promise.resolve(ide.action(name)).catch(error=>{if(typeof safeError==='function')safeError(error);else console.warn(error);});return true;
  }
};
if(typeof module!=='undefined')module.exports=CompletionKeys;
