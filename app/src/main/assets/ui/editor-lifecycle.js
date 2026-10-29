/* Compatibility adapter for the pinned Monaco word-highlighter. Its event
 * handlers start Delayer promises without observing cancellation on disposal. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioEditorLifecycle=api;})(globalThis,()=>{
  'use strict';
  const observed=new WeakSet();
  function watch(delayer,report=error=>console.error(error)){
    if(!delayer||observed.has(delayer)||typeof delayer.trigger!=='function')return;observed.add(delayer);
    const trigger=delayer.trigger;
    delayer.trigger=function(...args){const pending=trigger.apply(this,args);pending?.catch(error=>{if(error?.name!=='Canceled')report(error);});return pending;};
  }
  function attach(editor){
    const observe=()=>watch(editor.getContribution?.('editor.contrib.wordHighlighter')?.wordHighlighter?.runDelayer);
    observe();const changed=editor.onDidChangeModel(observe),disposed=editor.onDidDispose(()=>{changed.dispose();disposed.dispose();});
    return {dispose(){changed.dispose();disposed.dispose();}};
  }
  return Object.freeze({watch,attach});
});
