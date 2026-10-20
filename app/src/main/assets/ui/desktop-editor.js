'use strict';
if(window.StudioDesktop){
  document.body.classList.add('desktop-host');
  Object.assign(NativeEditing,{
    attach(editor,id){
      const container=document.querySelector(id==='primary'?'#editor':'#secondaryEditor'),api={editor,id,container,opening:Promise.resolve()};this.panes.set(id,api);
      const original=editor.setModel.bind(editor);editor.setModel=model=>{original(model);this.track(model);if(model)this.configureIndent(editor,model).catch(console.warn);};
      const dispose=editor.dispose.bind(editor);editor.dispose=()=>{this.panes.delete(id);dispose();};
      editor.updateOptions({automaticLayout:false,autoIndent:'full',autoClosingBrackets:'languageDefined',autoClosingQuotes:'languageDefined',formatOnType:false});
      editor.onDidType(text=>{if(text!=='}'||!window.forge?.settings.smartFormatOnClose||!window.forge?.toolPackState?.packs.find(p=>p.id==='analysis')?.installed)return;const model=editor.getModel();if(!model||!['c','cpp'].includes(model.getLanguageId()))return;const version=model.getVersionId(),cursor=model.getOffsetAt(editor.getPosition()),line=editor.getPosition().lineNumber;
        clearTimeout(api.formatTimer);api.formatTimer=setTimeout(async()=>{try{const r=await native('formatterOnType',{path:model.uri.fsPath,text:model.getValue(),cursor,firstLine:Math.max(1,line-1),lastLine:line});if(r.code||model.isDisposed()||model.getVersionId()!==version||editor.getModel()!==model)return;model.pushEditOperations([],[{range:model.getFullModelRange(),text:r.text}],()=>null);editor.setPosition(model.getPositionAt(r.cursor));}catch(e){console.warn('Format on close',e);}},180);
      });
      new ResizeObserver(()=>editor.layout()).observe(container);
      return editor;
    },
    track(model){if(!model||model.__desktopTracked)return;model.__desktopTracked=true;const uri=model.uri.toString();this.revisions.set(uri,model.getVersionId());model.onDidChangeContent(()=>this.revisions.set(uri,model.getVersionId()));model.onWillDispose(()=>this.revisions.delete(uri));},
    async configureIndent(editor,model){const options=await this.typingOptions(model);if(model.isDisposed()||editor.getModel()!==model)return;model.updateOptions({tabSize:options.tab||4,indentSize:options.indent||4,insertSpaces:!options.tabs});editor.updateOptions({detectIndentation:false});},
    async refreshTypingOptions(){await Promise.all([...this.panes.values()].map(p=>p.editor.getModel()?this.configureIndent(p.editor,p.editor.getModel()):null));},
    sync(){return Promise.resolve();},waitEdits(){return Promise.resolve(true);},invalidate(){},scheduleAnalysis(){},decorations(){},publishDiagnostics(){},
    queueLayout(){},layout(){},
    action(id){const editor=window.forge?.editor;return editor?.getAction(id)?.run();}
  });
  // Native menu/IME geometry belongs to Android. Monaco handles desktop pointer,
  // keyboard, clipboard, selection, hover, completion and accessibility itself.
  document.addEventListener('DOMContentLoaded',()=>$('#keyboardButton')?.classList.add('hidden'));
}
