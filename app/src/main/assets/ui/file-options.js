'use strict';
const FILE_ENCODINGS=['UTF-8','UTF-8-BOM','UTF-16LE','UTF-16BE','windows-1251','KOI8-R','ISO-8859-1','US-ASCII','Shift_JIS'];
const fileOptionsMethods={
  initFileOptions(){
    const options=FILE_ENCODINGS.map(e=>`<option value="${e}">${e}</option>`).join('');
    document.querySelector('[name="defaultEncoding"]').innerHTML=options;
    document.querySelector('#encodingChoice').innerHTML=options;
    document.querySelector('#encodingStatus').onclick=()=>this.fileEncoding().catch(safeError);
    document.querySelector('#indentStatus').onclick=()=>this.openSettings();
  },
  updateFileOptions(){
    document.querySelector('#encodingStatus').textContent=this.active?.encoding||'UTF-8';
    const mode=this.settings.indentMode;
    const status=document.querySelector('#indentStatus');status.textContent=mode==='formatter'?'.clang-format':tr(mode==='tabs'?'Табы':'Пробелы')+': '+this.settings.indentWidth;if(mode==='formatter'&&this.active){const doc=this.active;NativeEditing.typingOptions(doc.model).then(o=>{if(this.active===doc&&this.settings.indentMode==='formatter'){status.textContent=tr(o.tabs?'Табы':'Пробелы')+': '+(o.tabs?o.tab:o.indent);status.title='.clang-format';}}).catch(console.warn);}
  },
  chooseEncoding(path,current='UTF-8',opening=false){
    const dialog=document.querySelector('#encodingDialog'),choice=document.querySelector('#encodingChoice'),reopen=document.querySelector('#encodingReopen'),convert=document.querySelector('#encodingConvert');
    document.querySelector('#encodingFile').textContent=basename(path);choice.value=current==='auto'?'UTF-8':current;
    const dirty=this.docs.get(monaco.Uri.file(path).toString());
    reopen.disabled=!!dirty&&dirty.model.getValue()!==dirty.saved;convert.disabled=opening||!!dirty?.readonly;
    document.querySelector('#encodingUnsaved').hidden=!reopen.disabled;
    return new Promise(resolve=>{let result=null;reopen.onclick=()=>{result={mode:'reopen',encoding:choice.value};dialog.close();};convert.onclick=()=>{result={mode:'convert',encoding:choice.value};dialog.close();};dialog.addEventListener('close',()=>resolve(result),{once:true});dialog.showModal();});
  },
  async fileEncoding(){
    const doc=this.active;if(!doc)return;await NativeEditing.sync(doc.model.uri.toString());
    const selected=await this.chooseEncoding(doc.path,doc.encoding);if(!selected||doc.model.isDisposed())return;
    if(selected.mode==='reopen'){
      if(doc.model.getValue()!==doc.saved){this.toast('Сначала сохраните изменения файла');return;}
      const file=await native('read',{path:doc.path,encoding:selected.encoding});doc.encoding=file.encoding;doc.saved=file.text;doc.model.setValue(file.text);await NativeEditing.sync(doc.model.uri.toString());
    }else{
      const text=doc.model.getValue(),saved=await native('convertEncoding',{path:doc.path,text,revision:NativeEditing.revisions.get(doc.model.uri.toString()),encoding:selected.encoding});
      if(!saved){this.toast('Файл изменился во время сохранения. Повторите действие.');return;}
      doc.encoding=selected.encoding;doc.saved=text;
    }
    this.updateDirty();this.updateFileOptions();await this.lsp.start();
  }
};
