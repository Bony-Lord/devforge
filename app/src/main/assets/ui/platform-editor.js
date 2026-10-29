'use strict';
// The same document/addon UI uses Sora on Android and Monaco on desktop.
if(window.StudioDesktop){
  if(StudioDesktop.platform==='win32'&&StudioDesktop.darkTitleBar){const bar=document.createElement('div');bar.className='studio-desktop-caption';bar.innerHTML='<img src="brand/devforge.png" alt=""><span>DevForge</span>';document.body.prepend(bar);document.body.classList.add('studio-has-caption');}
  const smartPython=editor=>{
    const typed=editor.onDidType(text=>{const model=editor.getModel(),p=editor.getPosition();if(model?.getLanguageId()!=='python'||!p||text.length!==1||model.getValueLength()>200000)return;const value=model.getValue(monaco.editor.EndOfLinePreference.LF),offset=value.split('\n').slice(0,p.lineNumber-1).reduce((n,line)=>n+line.length+1,0)+p.column-1;if(value[offset-1]!==text||'()[]{}\'"'.indexOf(text)<0)return;const without=value.slice(0,offset-1)+value.slice(offset),edit=StudioCellEditing.typed(without,offset-1,offset-1,text,window.forge?.settings||{});if(!edit||edit.text.length!==value.length+1||value[offset]===edit.text[offset])return;editor.executeEdits('studio.python.pair',[{range:new monaco.Range(p.lineNumber,p.column,p.lineNumber,p.column),text:edit.text[offset]}],[new monaco.Selection(p.lineNumber,p.column,p.lineNumber,p.column)]);});
    const keys=editor.onKeyDown(event=>{const model=editor.getModel(),p=editor.getPosition();if(model?.getLanguageId()!=='python'||!p||!editor.getSelection().isEmpty()||event.ctrlKey||event.altKey||event.metaKey)return;const key=event.browserEvent.key;if(![')',']','}',"'",'"'].includes(key)||model.getLineContent(p.lineNumber)[p.column-1]!==key)return;const value=model.getValue(monaco.editor.EndOfLinePreference.LF),offset=value.split('\n').slice(0,p.lineNumber-1).reduce((n,line)=>n+line.length+1,0)+p.column-1,edit=StudioCellEditing.typed(value,offset,offset,key);if(edit?.text===value){event.preventDefault();event.stopPropagation();editor.setPosition({lineNumber:p.lineNumber,column:p.column+1});}});
    const dispose=editor.dispose.bind(editor);editor.dispose=()=>{typed.dispose();keys.dispose();dispose();};
  };
  StudioDesktop.onResult(value=>window.__nativeResult(value));StudioDesktop.onEvent((type,value)=>window.__nativeEvent(type,value));
  Object.assign(NativeEditing,{
    attach(editor,id,container){container||=document.querySelector(id==='primary'?'#editor':'#secondaryEditor');const dom=editor.getDomNode.bind(editor);editor.getDomNode=()=>dom()||container;this.panes.set(id,{id,editor,container,opening:Promise.resolve()});editor.updateOptions({automaticLayout:true,readOnly:false});smartPython(editor);return editor;},
    sync:async()=>{},waitEdits:async()=>true,track(){},snapshot(){},invalidate(){},scheduleAnalysis(){},documentSettled(){},publishDiagnostics:async()=>{},analysis:async()=>{},inlayHints:async()=>{},decorations(){},refreshTypingOptions:async()=>{},
    layout(){for(const p of this.panes.values())if(p.container.isConnected)p.editor.layout({width:p.container.clientWidth,height:p.container.clientHeight});return Promise.resolve();}
  });
}
