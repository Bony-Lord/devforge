'use strict';
class StudioNotebookEditor {
  constructor(ide,doc){this.ide=ide;this.doc=doc;this.value=StudioNotebook.parse(doc.model.getValue());this.pending=new Map();this.rows=new Map();this.session=null;this.busy=false;this.writing=false;this.external=false;}
  t(ru,en){return this.ide.settings.language==='ru'?ru:en;}
  element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
  button(icon,title,work){const b=this.element('button',undefined,'icon-button');b.type='button';b.innerHTML=svg(icon);b.title=title;b.ariaLabel=title;b.onclick=()=>Promise.resolve().then(work).catch(e=>this.status.textContent=e.message);return b;}
  open(container,editor){
    this.editor=editor;
    const dialog=this.element('section',undefined,'notebook-document');dialog.dataset.noI18n='';dialog.ariaLabel=this.doc.path;this.dialog=dialog;dialog.addEventListener('pointerdown',()=>StudioDocumentViews.activate(this.editor,this.doc));

    const toolbar=this.element('div',undefined,'notebook-toolbar');this.runAllButton=this.button('play',this.t('Выполнить все ячейки','Run all cells'),()=>this.runAll());toolbar.append(this.runAllButton,this.button('refresh',this.t('Перезапустить ядро (сбросить переменные)','Restart kernel (clear variables)'),()=>this.stop()),this.button('plus',this.t('Добавить ячейку кода','Add code cell'),()=>this.add('code')),this.button('file-text',this.t('Добавить Markdown','Add Markdown cell'),()=>this.add('markdown')),this.button('save',this.t('Сохранить','Save'),()=>this.ide.saveDoc(this.doc)));toolbar.append(this.button('braces',this.t('Исходный JSON ноутбука','Notebook JSON source'),()=>StudioDocumentViews.raw(this.editor)));dialog.append(toolbar);
    this.status=this.element('p',this.t('Python · Shift+Enter — выполнить. Код запускается только по команде.','Python · Shift+Enter to run. Code runs only on request.'),'notebook-status');this.status.setAttribute('role','status');dialog.append(this.status);
    this.body=this.element('div',undefined,'notebook-cells');this.body.addEventListener('focusin',e=>{if(e.target.matches('textarea'))this.lastFocused=e.target;});dialog.append(this.body);container.append(dialog);this.render();
    this.unsubscribe=onNative('notebook',e=>this.event(e));this.change=this.doc.model.onDidChangeContent(()=>{if(!this.writing){if(this.doc.model.getValue()===StudioNotebook.serialize(this.value))return;if(!this.busy){try{this.value=StudioNotebook.parse(this.doc.model.getValue());this.external=false;this.render();return;}catch{}}this.external=true;this.status.textContent=this.t('Исходник изменён. Переключитесь в JSON для проверки.','Source changed. Switch to JSON to review.');for(const input of this.body.querySelectorAll('textarea'))input.readOnly=true;}});
    this.disposeListener=this.doc.model.onWillDispose(()=>this.dispose());NativeEditing.queueLayout();
  }
  focus(){
    const current=()=>{const pane=StudioDocumentViews.pane(this.editor),windows=this.ide.windows;return pane?.documentView===this&&!this.dialog.hidden&&(!windows||windows.api.activePanel===windows.editorPanel(pane.id));};
    if(!current())return;
    const focus=()=>requestAnimationFrame(()=>{if(current()&&getComputedStyle(this.dialog).visibility!=='hidden')(this.lastFocused?.isConnected?this.lastFocused:this.body.querySelector('textarea'))?.focus({preventScroll:true});});
    // Android must focus the WebView before the DOM field. Otherwise its default
    // focus navigation can replace the textarea with the first toolbar button.
    if(window.StudioDesktop)focus();else native('editorWebFocus').then(focus).catch(safeError);
  }
  dispose(){this.unsubscribe?.();this.change?.dispose();this.disposeListener?.dispose();for(const row of this.rows.values())row.source.dispose();this.cellObserver?.disconnect();if(this.session)this.stop().catch(console.warn);this.dialog.remove();for(const pane of NativeEditing.panes.values()){if(pane.documentViews?.get(this.doc.model)===this)pane.documentViews.delete(this.doc.model);if(pane.documentView===this)pane.documentView=null;}}
  commit(){if(this.external||this.doc.readonly)throw Error(this.t('Изменение файла недоступно','File cannot be modified'));const model=this.doc.model,edit=StudioCellEditing.delta(model.getValue(),StudioNotebook.serialize(this.value));if(!edit)return;const start=model.getPositionAt(edit.start),end=model.getPositionAt(edit.end);this.writing=true;try{model.pushStackElement();model.pushEditOperations([],[{range:{startLineNumber:start.lineNumber,startColumn:start.column,endLineNumber:end.lineNumber,endColumn:end.column},text:edit.text}],()=>null);model.pushStackElement();}finally{this.writing=false;}}
  add(type){if(this.busy||this.external||this.doc.readonly)return;const c=StudioNotebook.cell(type);this.value.cells.push(c);this.commit();this.render();this.rows.get(c).input.focus();}
  render(){
    const previous=this.rows,prior=[...previous.values()],byId=new Map([...previous].filter(([c])=>c.id).map(([c,r])=>[c.id,r])),next=new Map(),used=new Set(),active=document.activeElement,selection=active?.matches('textarea')?{start:active.selectionStart,end:active.selectionEnd,top:active.scrollTop,left:active.scrollLeft}:null;
    for(const [index,c]of this.value.cells.entries()){
      let r=previous.get(c)||(c.id&&byId.get(c.id))||(!c.id&&!prior[index]?.cell.id&&prior[index]);if(r&&(used.has(r)||r.cell.cell_type!==c.cell_type))r=null;
      if(!r){
        const row=this.element('section',undefined,'notebook-cell'),bar=this.element('div',undefined,'notebook-cell-bar'),label=this.element('span');r={row,label,cell:c,buttons:[]};bar.append(label);
        const button=(icon,ru,en,work)=>{const b=this.button(icon,this.t(ru,en),work);r.buttons.push(b);bar.append(b);return b;};
        if(c.cell_type==='code'&&this.ide.addons.host.enabled('pythonFormatting'))r.styleFormatButton=button('format','Форматировать ячейку','Format cell',()=>this.ide.pythonStyle.formatCell(r.source));
        if(c.cell_type==='code')button('play','Выполнить ячейку','Run cell',()=>this.run(r.cell));
        button('arrow-up','Выше','Move up',()=>this.move(r.cell,-1));button('down','Ниже','Move down',()=>this.move(r.cell,1));button('trash','Удалить ячейку','Delete cell',()=>this.remove(r.cell));row.append(bar);
        r.source=new StudioNotebookCellInput(this,r);this.ide.pythonStyle?.watchCell(r.source);r.input=r.source.input;r.output=this.element('pre',undefined,'notebook-output');r.output.hidden=true;r.lastOutputs=null;row.append(r.source.element,r.output);
      }
      r.cell=c;next.set(c,r);used.add(r);r.source.sync();for(const button of r.buttons)button.disabled=this.busy||this.external||this.doc.readonly;
      const reference=this.body.children[index]||null;if(reference!==r.row){if(this.body.moveBefore&&r.row.parentElement===this.body)this.body.moveBefore(r.row,reference);else this.body.insertBefore(r.row,reference);}
    }
    for(const r of previous.values())if(!used.has(r)){r.source.dispose();r.row.remove();}
    this.rows=next;for(const c of this.value.cells)this.renderOutput(c,false);
    if(selection&&active.isConnected&&this.body.contains(active)){if(document.activeElement!==active)active.focus({preventScroll:true});active.setSelectionRange(Math.min(selection.start,active.value.length),Math.min(selection.end,active.value.length));active.scrollTop=selection.top;active.scrollLeft=selection.left;}
    this.runAllButton.disabled=this.busy||this.external||this.doc.readonly;
  }
  remove(c){if(this.busy||this.external||this.doc.readonly)return;const index=this.value.cells.indexOf(c);if(index<0)return;const focused=this.rows.get(c)?.row.contains(document.activeElement);this.value.cells.splice(index,1);this.commit();this.render();if(focused)this.rows.get(this.value.cells[Math.min(index,this.value.cells.length-1)])?.input.focus();}
  move(c,by){if(this.busy||this.external||this.doc.readonly)return;const i=this.value.cells.indexOf(c),j=i+by;if(i<0||j<0||j>=this.value.cells.length)return;this.value.cells.splice(i,1);this.value.cells.splice(j,0,c);this.commit();this.render();}
  renderOutput(c,force=true){const r=this.rows.get(c);if(!r)return;if(force||r.lastOutputs!==c.outputs||r.lastCount!==c.execution_count){r.output.textContent=(c.outputs||[]).map(StudioNotebook.textOutput).join('\n').slice(0,1024*1024);r.output.hidden=!r.output.textContent;r.lastOutputs=c.outputs;r.lastCount=c.execution_count;}r.label.textContent=(c.cell_type==='code'?'In ['+(c.execution_count??' ')+']':c.cell_type)+' · '+(this.value.cells.indexOf(c)+1);}
  optionsChanged(){for(const r of this.rows.values())r.source.refresh();}
  async run(c,next=false){
    if(this.busy)throw Error(this.t('Ядро занято','Kernel is busy'));if(this.external||this.doc.readonly)throw Error(this.t('Выполнение недоступно','Execution unavailable'));
    if(!this.ide.addons.host.enabled('notebooks')||!this.ide.addons.host.enabled('python')){this.ide.addons.open();return;}
    const kernelLanguage=this.value.metadata.kernelspec?.language||this.value.metadata.language_info?.name||'python';if(kernelLanguage.toLowerCase()!=='python')throw Error(this.t('В этой версии доступно ядро Python','This version supports the Python kernel'));
    this.busy=true;this.runAllButton.disabled=true;const id='cell-'+Date.now()+'-'+Math.random().toString(36).slice(2);let finish;
    try{
      this.commit();await this.ide.saveDoc(this.doc);const started=await native('notebookStart',{path:this.doc.path,options:this.ide.configurations.current()?.options||this.ide.settings});this.session=started.session;
      c.outputs=[];c.execution_count=null;this.renderOutput(c);this.status.textContent=this.t('Выполняется…','Running…');
      const done=new Promise((resolve,reject)=>{finish={cell:c,resolve,reject};this.pending.set(id,finish);});
      await native('notebookExecute',{id,path:this.doc.path,cell:this.value.cells.indexOf(c)+1,code:StudioNotebook.lines(c.source)});await done;
      if(next){const index=this.value.cells.indexOf(c);if(index===this.value.cells.length-1)this.addAfterRun=true;else this.rows.get(this.value.cells[index+1])?.input.focus();}
    }catch(error){if(finish){this.pending.delete(id);finish.resolve();}throw error;}
    finally{this.busy=false;this.runAllButton.disabled=this.external||this.doc.readonly;if(this.addAfterRun){this.addAfterRun=false;this.add('code');}}
  }
  async runAll(){for(const c of [...this.value.cells])if(c.cell_type==='code'){await this.run(c);if(this.lastError)break;}}
  event(e){if(e.path!==this.doc.path||e.session!==this.session)return;const item=this.pending.get(e.id);if(e.type==='stopped'){for(const p of this.pending.values())p.reject(Error(this.t('Ядро остановлено','Kernel stopped')));this.pending.clear();this.status.textContent=this.t('Ядро остановлено','Kernel stopped');return;}if(!item)return;
    if(e.type==='busy')this.lastError=false;if(e.type==='error')this.lastError=true;StudioNotebook.append(item.cell,e);this.renderOutput(item.cell);
    if(e.type==='idle'){this.pending.delete(e.id);try{this.commit();item.resolve();}catch(error){item.reject(error);}this.status.textContent=this.t('Готово · переменные сохранены в ядре','Ready · kernel variables retained');}
  }
  async stop(){for(const p of this.pending.values())p.reject(Error(this.t('Ядро перезапущено','Kernel restarted')));this.pending.clear();const session=this.session;this.session=null;await native('notebookStop',session===null?{}:{session});this.status.textContent=this.t('Ядро остановлено · переменные сброшены','Kernel stopped · variables cleared');}
}
const StudioDocumentViews={
  optionsChanged(){for(const pane of NativeEditing.panes.values())for(const view of pane.documentViews?.values()||[])view.optionsChanged();},
  attach(editor,id){
    const pane=NativeEditing.panes.get(id);pane.documentViews=new Map();pane.rawModels=new WeakSet();pane.sourceVisibility=pane.container.style.visibility;
    const set=editor.setModel.bind(editor),focus=editor.focus.bind(editor),dispose=editor.dispose.bind(editor);
    editor.setModel=model=>{this.update(editor,model);return set(model);};
    editor.focus=()=>pane.documentView?pane.documentView.focus():focus();
    editor.dispose=()=>{for(const view of pane.documentViews.values())view.dispose();pane.documentViews.clear();dispose();};
  },
  pane(editor){return [...NativeEditing.panes.values()].find(p=>p.editor===editor);},
  activate(editor,doc){const ide=window.forge;if(!ide)return;ide.editor=editor;ide.active=doc;const pane=this.pane(editor);ide.windows?.activateEditor(pane.id);ide.renderTabs();ide.updateFileOptions();document.querySelector('#breadcrumb').textContent=relative(doc.path,ide.state.root);},
  update(editor,model){
    const current=this.pane(editor);if(model&&current?.documentView?.doc.model===model&&!current.rawModels.has(model)&&window.forge?.addons.host.enabled('notebooks')){NativeEditing.queueLayout();return;}
    const pane=this.pane(editor);if(!pane)return;for(const[model,view]of pane.documentViews)if(model.isDisposed()){view.dispose();pane.documentViews.delete(model);}else view.dialog.hidden=true;pane.documentView=null;pane.container.style.visibility=pane.sourceVisibility;pane.container.classList.remove('studio-document-host');
    const ide=window.forge,doc=model&&ide?.docs.get(model.uri.toString());
    if(doc?.path.endsWith('.ipynb')&&ide.addons.host.enabled('notebooks')&&!pane.rawModels.has(model))this.show(editor,doc);
    NativeEditing.queueLayout();
  },
  show(editor,doc){
    const pane=this.pane(editor);if(!pane)return;pane.rawModels.delete(doc.model);for(const view of pane.documentViews.values())view.dialog.hidden=true;let view=pane.documentViews.get(doc.model);
    if(!view){try{view=new StudioNotebookEditor(window.forge,doc);view.open(pane.container,editor);pane.documentViews.set(doc.model,view);}catch(error){safeError(error);return;}}
    pane.documentView=view;pane.container.classList.add('studio-document-host');pane.container.style.visibility='inherit';view.dialog.hidden=false;NativeEditing.queueLayout();return view;
  },
  raw(editor){const pane=this.pane(editor);if(!pane)return;const model=editor.getModel();if(model)pane.rawModels.add(model);this.update(editor,model);editor.focus();}
};
const pythonMethods={
  async createPythonProject(type){const notebook=type==='notebook',path=this.state.root+(notebook?'/notebook.ipynb':'/main.py'),text=notebook?StudioNotebook.serialize(StudioNotebook.empty()):'def main():\n    print("Hello from DevForge!")\n\n\nif __name__ == "__main__":\n    main()\n';await native('newFile',{path,text,encoding:'UTF-8'});const document=StudioRunProfiles.defaults(this.settings,'main.py',false);document.projectType=type;document.profiles=[{id:'python',name:'Python',kind:'interpreter',environment:{}}];document.active='python';document.configurations=[{...document.configurations[0],id:'python',profile:'python',type:notebook?'notebook':'python',name:notebook?'Notebook':'Python',source:notebook?'notebook.ipynb':'main.py',buildBeforeRun:false,actions:StudioProjectPolicy.defaults({type:notebook?'notebook':'python'})}];await this.configurations.save(document);await this.refreshTree();await this.openFile(path);if(notebook)this.addons.host.openView();},
  async runPython(checkOnly=false){if(this.busy||this.running)return;const configured=this.configurations?.current(),source=configured?.path||this.active?.path;if(!source?.endsWith('.py'))return;if(!this.addons.host.enabled('python')){this.addons.open();return;}this.busy=true;this.updateRunButtons();try{await this.saveAll();if(checkOnly){this.showPanel('build');this.clearOutput('build');const r=await native('pythonCheck',{path:source,options:configured?.options||this.settings});this.appendOutput('build',r.text+r.error,r.code===0?'success':'failure');return r;}this.showPanel('console');this.clearOutput('console');this.consoleId='python-'+(++this.sequence);this.running=true;const options=configured?.options||{...this.settings,workingDirectory:'.'};await native('pythonRun',{path:source,id:this.consoleId,args:options.args||[],options});}catch(e){this.running=false;throw e;}finally{this.busy=false;this.updateRunButtons();}}
};
