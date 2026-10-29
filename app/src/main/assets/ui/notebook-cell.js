'use strict';
class StudioNotebookCellInput {
  static fields=new WeakMap();
  static surfaces=new WeakMap();
  constructor(view,record){
    this.view=view;this.record=record;this.history=new StudioCellEditing.History();this.ticket=0;
    this.element=view.element('div',undefined,'notebook-source');this.paint=view.element('pre',undefined,'monaco-editor notebook-syntax');this.paint.setAttribute('aria-hidden','true');
    const input=view.element('textarea');this.input=input;StudioNotebookCellInput.fields.set(input,this);input.wrap='off';input.spellcheck=false;input.autocomplete='off';input.autocapitalize='off';input.setAttribute('autocorrect','off');
    this.element.append(this.paint,input);StudioNotebookCellInput.surfaces.set(this.element,this);this.visible=typeof IntersectionObserver==='undefined';
    if(!this.visible){view.cellObserver||=new IntersectionObserver(entries=>{for(const e of entries){const source=StudioNotebookCellInput.surfaces.get(e.target);if(source&&!source.disposed&&source.visible!==e.isIntersecting){source.visible=e.isIntersecting;source.refresh();if(source.visible)view.ide.pythonStyle?.scheduleCell(source);}}},{root:view.body,rootMargin:'240px'});view.cellObserver.observe(this.element);}
    input.addEventListener('beforeinput',event=>{
      if(input.readOnly||event.isComposing)return;
      this.before=this.snapshot();
      if(event.cancelable&&['historyUndo','historyRedo'].includes(event.inputType)){event.preventDefault();this.undo(event.inputType==='historyRedo');}
      else if(event.cancelable&&['insertLineBreak','insertParagraph'].includes(event.inputType)){event.preventDefault();this.apply(StudioCellEditing.newline(input.value,input.selectionStart,input.selectionEnd,this.view.ide.settings,this.language()==='python'),'newline');}
      else if(event.cancelable&&this.language()==='python'){const edit=event.inputType==='insertText'?StudioCellEditing.typed(input.value,input.selectionStart,input.selectionEnd,event.data,this.view.ide.settings):event.inputType==='deleteContentBackward'?StudioCellEditing.backspace(input.value,input.selectionStart,input.selectionEnd):null;if(edit){event.preventDefault();this.apply(edit,event.inputType);}}
    });
    input.addEventListener('input',event=>this.changed(this.synthetic?.kind||event.inputType||'input',this.synthetic?.remember!==false));
    input.addEventListener('scroll',()=>this.scroll());
    input.addEventListener('keydown',event=>{
      if(event.isComposing||input.readOnly)return;if(this.view.ide.pythonIntelligence?.handleCellKey(this,event))return;
      if(/^(Arrow|Home|End|Page)/.test(event.key))this.history.group=null;
      const ctrl=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
      if(ctrl&&!event.altKey&&(key==='z'||key==='y')){event.preventDefault();event.stopPropagation();this.undo(key==='y'||event.shiftKey);}
      else if(event.key==='Tab'&&!ctrl&&!event.altKey){event.preventDefault();event.stopPropagation();this.apply(StudioCellEditing.indent(input.value,input.selectionStart,input.selectionEnd,this.view.ide.settings,event.shiftKey),'indent');}
      else if(event.key==='Enter'&&(event.shiftKey||ctrl)){event.preventDefault();event.stopPropagation();if(this.record.cell.cell_type==='code')this.view.run(this.record.cell,event.shiftKey).catch(error=>this.view.status.textContent=error.message);}
    });
    input.addEventListener('pointerdown',()=>{this.history.group=null;});
    this.sync();StudioMarkdown.attach(this);this.sizeObserver=new ResizeObserver(()=>{if(!this.disposed){this.measure();this.scroll();}});this.sizeObserver.observe(this.element);
  }
  snapshot(){return{text:this.input.value,start:this.input.selectionStart,end:this.input.selectionEnd};}
  language(){return this.record.cell.cell_type==='code'?'python':this.record.cell.cell_type==='markdown'?'markdown':'plaintext';}
  sync(){
    const input=this.input,text=StudioNotebook.lines(this.record.cell.source);
    if(input.value!==text){const start=input.selectionStart,end=input.selectionEnd;input.value=text;input.setSelectionRange(Math.min(start,text.length),Math.min(end,text.length));this.history.reset();}
    input.readOnly=this.view.doc.readonly||this.view.external;input.ariaLabel=this.view.t('Исходник ячейки ','Cell source ')+(this.view.value.cells.indexOf(this.record.cell)+1);this.saved=this.snapshot();this.refresh();StudioMarkdown.refresh(this);
  }
  apply(value,kind,remember=true){
    const input=this.input;if(input.readOnly)return;
    const before=this.snapshot(),edit=StudioCellEditing.delta(before.text,value.text);if(edit)input.setRangeText(edit.text,edit.start,edit.end,'preserve');input.setSelectionRange(value.start,value.end);
    this.before=before;this.synthetic={kind,remember};try{this.input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:kind==='undo'?'historyUndo':kind==='redo'?'historyRedo':'insertReplacementText'}));}finally{this.synthetic=null;}
  }
  insert(text){const input=this.input;if(input.readOnly)return false;const start=input.selectionStart,end=input.selectionEnd,settings=this.view.ide.settings,smart=text==='\n'?StudioCellEditing.newline(input.value,start,end,settings,this.language()==='python'):this.language()==='python'?StudioCellEditing.typed(input.value,start,end,text,settings):null;this.apply(smart||{text:input.value.slice(0,start)+text+input.value.slice(end),start:start+text.length,end:start+text.length},'insertText');return true;}
  changed(kind,remember=true){
    if(this.input.readOnly)return;
    const after=this.snapshot(),before=this.before||this.saved,source=this.record.cell.source;this.before=null;this.record.cell.source=after.text;
    try{this.view.commit();}catch(error){this.record.cell.source=source;this.input.value=before.text;this.input.setSelectionRange(before.start,before.end);this.view.status.textContent=error.message;this.refresh();return;}
    if(remember)this.history.record(before,after,kind);this.saved=after;this.refresh();StudioMarkdown.refresh(this);
  }
  undo(redo=false){const value=this.history[redo?'redo':'undo'](this.snapshot());if(value)this.apply(value,redo?'redo':'undo',false);}
  refresh(){
    const input=this.input,settings=this.view.ide.settings,tab=Math.max(1,Number(settings.tabWidth)||4),language=this.language(),host=this.view.ide.addons?.host;
    const font=Math.max(10,Math.min(48,(Number(settings.fontSize)||14)*(Number(settings.codeScale)||100)/100));this.element.style.setProperty('--cell-font',font+'px');this.element.style.setProperty('--cell-tab',tab);
    input.rows=Math.max(1,Math.min(500,input.value.split('\n').length));
    this.measure();
    const enabled=this.visible&&language!=='plaintext'&&(!host?.lastFeatures||host.language('cell.'+(language==='python'?'py':'md'))===language),text=input.value,key=[text,enabled,tab,settings.theme].join('\u0000');
    if(key===this.paintKey)return;this.paintKey=key;const ticket=++this.ticket;this.paint.textContent=this.visible?text+'\n':'';this.scroll();
    const colorize=window.monaco?.editor.colorize;if(!enabled||text.length>100000||input.rows===500&&text.split('\n').length>2000||!colorize){this.element.classList.remove('has-syntax');return;}
    // Only token HTML produced by Monaco is inserted, never notebook HTML output.
    this.element.classList.add('has-syntax');
    Promise.resolve(colorize(text,language,{tabSize:tab})).then(html=>{if(this.disposed||ticket!==this.ticket)return;this.paint.innerHTML=html;this.scroll();this.view.ide.pythonStyle?.paintCell(this);}).catch(()=>{if(ticket===this.ticket)this.element.classList.remove('has-syntax');});
  }
  measure(){const input=this.input;if(!input.isConnected||!input.clientWidth)return;const style=getComputedStyle(input),bar=input.scrollWidth>input.clientWidth+1?input.offsetHeight-input.clientHeight:0,height=input.rows*(parseFloat(style.lineHeight)||21)+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+bar;if(Math.abs(parseFloat(input.style.height||0)-height)>.5)input.style.height=height+'px';}
  scroll(){this.paint.style.height=this.input.clientHeight+'px';this.paint.style.width=this.input.clientWidth+'px';this.paint.scrollTop=this.input.scrollTop;this.paint.scrollLeft=this.input.scrollLeft;}
  dispose(){this.sizeObserver?.disconnect();this.view.ide.pythonIntelligence?.forgetCell(this);this.view.ide.pythonStyle?.forgetCell(this);StudioMarkdown.dispose(this);this.disposed=true;this.ticket++;this.view.cellObserver?.unobserve(this.element);StudioNotebookCellInput.fields.delete(this.input);StudioNotebookCellInput.surfaces.delete(this.element);}
}
