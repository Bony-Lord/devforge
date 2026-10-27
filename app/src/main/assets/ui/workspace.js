'use strict';
const workspaceMethods={
  initWorkspace(){
    this.primaryEditor=this.editor;this.attachWorkspaceEditor(this.editor);registerForgeThemes(monaco);
    this.settings.uiScale??=100;this.settings.codeScale??=100;this.settings.layout??={};
    this.scaleCSS=Promise.all(['style.css','clion.css','tools.css','project-tools.css','interaction.css','compact-ui.css'].map(p=>fetch(p).then(r=>r.ok?r.text():'')));
    this.applyUIScale();
    onNative('keyboardGeometry',geometry=>{this.keyboardGeometry=geometry;requestAnimationFrame(()=>this.updateKeyboardOcclusion());});
    window.addEventListener('resize',()=>this.updateKeyboardOcclusion());
    const layout=this.settings.layout;document.body.classList.toggle('sidebar-hidden',!!layout.sidebarHidden);document.body.classList.toggle('panel-hidden',!!layout.panelHidden);
    if(layout.split)this.splitEditor(layout.split,false);
    const persist=()=>{const scale=this.settings.uiScale/100;this.settings.layout={...this.settings.layout,sidebarWidth:$('#sidebar').getBoundingClientRect().width/scale,panelHeight:$('#panel').getBoundingClientRect().height/scale,sidebarHidden:document.body.classList.contains('sidebar-hidden'),panelHidden:document.body.classList.contains('panel-hidden')};this.saveWorkspaceSettings();};
    for(const id of ['sidebarResizer','panelResizer'])$('#'+id).addEventListener('studio-resize-end',persist);
    $('#resetLayout').onclick=()=>this.resetLayout();
    this.resizer($('#editorSplitResizer'),()=>{const direction=this.settings.layout.split,box=$('#editorArea').getBoundingClientRect(),start=this.settings.layout.splitRatio||.5;return(dx,dy)=>{this.settings.layout.splitRatio=Math.max(.15,Math.min(.85,start+(direction==='stacked'?dy/box.height:dx/box.width)));this.layoutEditors();};});
    $('#editorSplitResizer').addEventListener('studio-resize-end',()=>this.saveWorkspaceSettings());
    document.fonts.ready.then(()=>{monaco.editor.remeasureFonts();this.layoutEditors();});
  },
  toggleSide(name){const visible=innerWidth<=620?document.body.classList.contains('sidebar-mobile-open'):!document.body.classList.contains('sidebar-hidden');if(visible&&this.currentSide===name){document.body.classList.add('sidebar-hidden');document.body.classList.remove('sidebar-mobile-open');$$('.activity.active').forEach(b=>b.classList.remove('active'));this.settings.layout.sidebarHidden=true;this.layoutEditors();this.saveWorkspaceSettings();return;}if(name==='git')this.showGit().catch(safeError);else this.showSide(name);this.settings.layout.sidebarHidden=false;this.layoutEditors();this.saveWorkspaceSettings();},
  attachWorkspaceEditor(editor){
    const container=editor===this.primaryEditor?$('#editor'):$('#secondaryEditor');
    editor.onDidFocusEditorWidget(()=>{this.editor=editor;const model=editor.getModel(),doc=model&&this.docs.get(model.uri.toString());if(doc){this.active=doc;this.renderTabs();this.updateStandard();$('#breadcrumb').textContent=relative(doc.path,this.state.root).replaceAll('/','  ›  ');$('#readonlyBadge').classList.toggle('hidden',!doc.readonly);}});
    editor.onDidChangeCursorPosition(e=>{$('#cursorStatus').textContent=`Стр ${e.position.lineNumber}, стлб ${e.position.column}`;this.revealCaretAboveKeyboard(editor);});
    editor.onMouseDown(e=>{if(e.target.type===monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN&&e.target.position)this.debugger?.toggleBreakpoint(editor.getModel(),e.target.position.lineNumber);});
    container.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();e.stopImmediatePropagation();if(e.altKey)this.setUIScale(this.settings.uiScale+(e.deltaY<0?5:-5));else this.setCodeScale(this.settings.codeScale+(e.deltaY<0?10:-10));}},{passive:false,capture:true});
    const touches=new Map();let initial=null;
    container.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;touches.set(e.pointerId,[e.clientX,e.clientY]);if(touches.size===2){const[a,b]=[...touches.values()];initial={distance:Math.hypot(a[0]-b[0],a[1]-b[1]),scale:this.settings.codeScale};}});
    container.addEventListener('pointermove',e=>{if(!touches.has(e.pointerId))return;touches.set(e.pointerId,[e.clientX,e.clientY]);if(touches.size===2&&initial){const[a,b]=[...touches.values()];this.setCodeScale(Math.round(initial.scale*Math.hypot(a[0]-b[0],a[1]-b[1])/initial.distance),false);}});
    for(const name of ['pointerup','pointercancel'])container.addEventListener(name,e=>{touches.delete(e.pointerId);if(touches.size<2&&initial){initial=null;this.saveWorkspaceSettings();}});
  },
  async applyUIScale(){
    if(!this.scaleCSS)return;
    const sheets=await this.scaleCSS;let style=$('#uiScaleStyle');if(!style){style=document.createElement('style');style.id='uiScaleStyle';document.head.append(style);}
    const scale=Math.max(.65,Math.min(1.8,(this.settings.uiScale||100)/100));
    style.textContent=sheets.join('\n').replace(/(-?\d*\.?\d+)px\b/g,(_,v)=>Number((Number(v)*scale).toFixed(3))+'px');
    const layout=this.settings.layout||{},root=document.documentElement;
    if(layout.sidebarWidth)root.style.setProperty('--sidebar',layout.sidebarWidth*scale+'px');
    if(layout.panelHeight)root.style.setProperty('--panel-height',layout.panelHeight*scale+'px');
    requestAnimationFrame(()=>this.layoutEditors());
  },
  layoutEditors(){
    const ratio=this.settings.layout?.splitRatio||.5;document.documentElement.style.setProperty('--split-ratio',ratio);
    requestAnimationFrame(()=>{this.primaryEditor?.layout();this.secondaryEditor?.layout();this.updateKeyboardOcclusion();});
  },
  updateKeyboardOcclusion(){
    const geometry=this.keyboardGeometry,bottom=innerHeight-(geometry?.visible?geometry.overlap:0);
    for(const editor of [this.primaryEditor,this.secondaryEditor]){
      const box=editor?.getDomNode()?.getBoundingClientRect();if(!box)continue;
      const hidden=Math.min(box.height,Math.max(0,box.bottom-bottom));
      editor.updateOptions({padding:{top:9,bottom:16+Math.ceil(hidden)}});
    }
    requestAnimationFrame(()=>this.revealCaretAboveKeyboard(this.editor));
  },
  revealCaretAboveKeyboard(editor){
    if(!this.keyboardGeometry?.visible||!editor?.getModel())return;
    const box=editor.getDomNode()?.getBoundingClientRect(),caret=editor.getScrolledVisiblePosition(editor.getPosition());
    if(!box||!caret)return;
    const bottom=Math.min(box.bottom,innerHeight-this.keyboardGeometry.overlap)-12;
    if(box.top+caret.top+caret.height>bottom)editor.setScrollTop(editor.getScrollTop()+box.top+caret.top+caret.height-bottom);
  },
  setUIScale(value,persist=true){this.settings.uiScale=Math.max(65,Math.min(180,Math.round(value)));this.applyUIScale();if(persist)this.saveWorkspaceSettings();},
  setCodeScale(value,persist=true){this.settings.codeScale=Math.max(50,Math.min(250,Number.isFinite(Number(value))?Number(value):100));const size=this.settings.fontSize*this.settings.codeScale/100;for(const editor of [this.primaryEditor,this.secondaryEditor])editor?.updateOptions({fontSize:size,lineHeight:Math.round(size*1.6)});$('#fontStatus').textContent=Math.round(this.settings.codeScale)+'%';$('#fontStatus').title=`Код: ${Math.round(this.settings.codeScale)}% · ${size.toFixed(1)} px`;if(persist)this.saveWorkspaceSettings();},
  saveWorkspaceSettings(){clearTimeout(this.workspaceSaveTimer);this.workspaceSaveTimer=setTimeout(()=>native('settings',this.settings).catch(safeError),220);},
  splitEditor(direction,persist=true){
    const model=this.editor.getModel();
    if(!this.secondaryEditor){this.secondaryEditor=attachNativeEditor(monaco.editor.create($('#secondaryEditor'),{...this.editorOptions(),automaticLayout:false,model:null}),'secondary');this.attachWorkspaceEditor(this.secondaryEditor);}
    $('#secondaryEditor').classList.remove('hidden');$('#editorSplitResizer').classList.remove('hidden');$('#editorArea').classList.add('split-editor');$('#editorArea').classList.toggle('split-stacked',direction==='stacked');
    this.settings.layout={...this.settings.layout,split:direction,splitRatio:this.settings.layout?.splitRatio||.5};
    if(!this.secondaryEditor.getModel()&&model){this.secondaryEditor.setModel(model);this.secondaryEditor.updateOptions({readOnly:!!this.docs.get(model.uri.toString())?.readonly});}this.layoutEditors();if(persist)this.saveWorkspaceSettings();
  },
  unsplitEditor(){
    const model=this.editor.getModel();this.editor=this.primaryEditor;if(model)this.primaryEditor.setModel(model);
    this.secondaryEditor?.dispose();this.secondaryEditor=null;$('#secondaryEditor').classList.add('hidden');$('#editorSplitResizer').classList.add('hidden');$('#editorArea').classList.remove('split-editor','split-stacked');this.settings.layout.split=null;this.layoutEditors();this.saveWorkspaceSettings();this.editor.focus();
  },
  resetLayout(){this.unsplitEditor();this.settings.layout={};document.documentElement.style.removeProperty('--sidebar');document.documentElement.style.removeProperty('--panel-height');document.body.classList.remove('sidebar-hidden','panel-hidden','sidebar-mobile-open');this.applyUIScale();this.saveWorkspaceSettings();this.toast('Размеры и расположение окон сброшены');},
  applyUnused(model,diagnostics){
    const doc=this.docs.get(model.uri.toString());if(!doc)return;
    const unused=(diagnostics||[]).filter(d=>d.tags?.includes(1)||/unused|unneeded-internal|unreachable/.test(String(d.code||'')));
    doc.unusedDecorations=model.deltaDecorations(doc.unusedDecorations||[],unused.map(d=>({range:this.lsp.range(d.range),options:{inlineClassName:'forge-unused-symbol',inlineClassNameAffectsLetterSpacing:false,hoverMessage:{value:d.message,isTrusted:false}}})));
  },
  workspaceKeydown(e){
    if($('dialog[open]'))return false;const ctrl=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();let fn;
    if(ctrl&&e.altKey&&e.shiftKey&&k==='l')fn=()=>this.openFormatter();
    else if(ctrl&&e.altKey&&k==='o')fn=()=>this.openDeviceFolder();
    else if(ctrl&&e.altKey&&(k==='+'||k==='='||k==='-'))fn=()=>this.setUIScale(this.settings.uiScale+(k==='-'?-5:5));
    else if(ctrl&&e.altKey&&k==='0')fn=()=>this.setUIScale(100);
    else if(ctrl&&k==='0')fn=()=>this.setCodeScale(100);
    else if(ctrl&&(k==='+'||k==='='||k==='-'))fn=()=>this.setCodeScale(this.settings.codeScale+(k==='-'?-10:10));
    else if(ctrl&&k==='\\')fn=()=>this.splitEditor('side');
    else if(ctrl&&e.altKey&&k==='s')fn=()=>this.openSettings();
    else if(ctrl&&e.shiftKey&&k==='a')fn=()=>this.quick('commands');
    else if(e.altKey&&e.key==='F12')fn=()=>this.showPanel('terminal');
    else if(e.shiftKey&&e.key==='F10')fn=()=>this.build(true);
    else if(ctrl&&e.key==='F9')fn=()=>this.build(false);
    else if(ctrl&&k==='d')fn=()=>this.action('editor.action.copyLinesDownAction');
    else if(ctrl&&k==='y')fn=()=>this.action('editor.action.deleteLines');
    else if(e.key==='Escape'&&!this.editor.hasTextFocus())fn=()=>this.editor.focus();
    else if(ctrl&&k==='1')fn=()=>this.primaryEditor.focus();
    else if(ctrl&&k==='2'&&this.secondaryEditor)fn=()=>this.secondaryEditor.focus();
    if(fn){e.preventDefault();e.stopImmediatePropagation();Promise.resolve(fn()).catch(safeError);return true;}return false;
  },
  workspaceCommands(){return[
    {label:'Разделить редактор справа',key:'Ctrl+\\',run:()=>this.splitEditor('side')},{label:'Разделить редактор снизу',run:()=>this.splitEditor('stacked')},{label:'Один редактор',run:()=>this.unsplitEditor()},
    {label:'Увеличить масштаб интерфейса',key:'Ctrl+Alt++',run:()=>this.setUIScale(this.settings.uiScale+5)},{label:'Уменьшить масштаб интерфейса',key:'Ctrl+Alt+-',run:()=>this.setUIScale(this.settings.uiScale-5)},
    {label:'Увеличить масштаб кода',key:'Ctrl++',run:()=>this.setCodeScale(this.settings.codeScale+10)},{label:'Уменьшить масштаб кода',key:'Ctrl+-',run:()=>this.setCodeScale(this.settings.codeScale-10)},
    {label:'Сбросить масштабы',run:()=>{this.setUIScale(100);this.setCodeScale(100);}},{label:'Сбросить расположение окон',run:()=>this.resetLayout()}
  ];}
};
