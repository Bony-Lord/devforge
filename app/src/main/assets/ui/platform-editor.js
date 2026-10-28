'use strict';
// The same document/addon UI uses Sora on Android and Monaco on desktop.
if(window.StudioDesktop){
  StudioDesktop.onResult(value=>window.__nativeResult(value));StudioDesktop.onEvent((type,value)=>window.__nativeEvent(type,value));
  Object.assign(NativeEditing,{
    attach(editor,id,container){container||=document.querySelector(id==='primary'?'#editor':'#secondaryEditor');const dom=editor.getDomNode.bind(editor);editor.getDomNode=()=>dom()||container;this.panes.set(id,{id,editor,container,opening:Promise.resolve()});editor.updateOptions({automaticLayout:true,readOnly:false});return editor;},
    sync:async()=>{},waitEdits:async()=>true,track(){},snapshot(){},invalidate(){},scheduleAnalysis(){},documentSettled(){},publishDiagnostics:async()=>{},analysis:async()=>{},inlayHints:async()=>{},decorations(){},refreshTypingOptions:async()=>{},
    layout(){for(const p of this.panes.values())if(p.container.isConnected)p.editor.layout({width:p.container.clientWidth,height:p.container.clientHeight});return Promise.resolve();}
  });
}
