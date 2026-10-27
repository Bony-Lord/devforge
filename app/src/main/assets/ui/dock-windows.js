'use strict';
class StudioWindows{
  constructor(ide){
    this.ide=ide;ide.windows=this;this.contents=new Map();this.locations={};this.restoring=true;
    this.tools={editor:{title:'Код',icon:'file-code'},project:{title:'Проект',icon:'studio-project',side:'left'},search:{title:'Поиск файлов',icon:'search',side:'left'},outline:{title:'Структура файла',icon:'studio-structure',side:'left'},git:{title:'Git',icon:'git',side:'left'},problems:{title:'Проблемы',icon:'studio-problems',side:'bottom'},console:{title:'Консоль',icon:'studio-console',side:'bottom'},build:{title:'Сборка',icon:'build',side:'bottom'},terminal:{title:'Терминал',icon:'studio-terminal',side:'bottom'},debug:{title:'Отладка',icon:'debug',side:'bottom'}};
    this.stash=document.createElement('div');this.stash.id='studioWindowStash';this.stash.hidden=true;document.body.append(this.stash);
    for(const[id,selector]of Object.entries({search:'#sideSearch',outline:'#outline',git:'#gitSide',problems:'#problems',console:'#console',build:'#build',terminal:'#terminal',debug:'#debug',editor:'.main',project:'#sidebar'})){
      const content=$(selector);this.contents.set(id,content);content.classList.remove('hidden');this.stash.append(content);
    }
    const project=this.contents.get('project');project.classList.add('studio-project-content');$('#sideTitle').textContent=tr('ПРОЕКТ');
    for(const id of ['panelResizer','sidebarResizer','panel'])this.stash.append($('#'+id));
    this.host=document.createElement('div');this.host.id='dockWorkspace';$('.work-area').append(this.host);document.body.classList.add('studio-docking');
    const library=window['dockview-core'];
    library.registerModules([library.FloatingGroupModule,library.AdvancedDnDModule]);
    this.api=library.createDockview(this.host,{
      theme:{name:'studio',className:'studio-dock-theme',gap:4,dndOverlayMounting:'absolute'},
      dndStrategy:'pointer',floatingGroupBounds:'boundedWithinViewport',floatingGroupDragHandle:'titlebar',defaultRenderer:'always',defaultTabComponent:'studio-tool',
      createComponent:({id})=>this.component(id),createTabComponent:({id})=>this.tab(id),
      createRightHeaderActionComponent:group=>this.actions(group),
      getTabContextMenuItems:({panel})=>this.menuItems(panel.id),
      // Browser popouts would lose the Android input bridge. All floats stay in-app.
      disableDnd:false,
    });
    this.rail();
    this.api.onDidLayoutChange(()=>this.changed());
    this.api.onDidAddGroup(group=>this.markEditorGroup(group));
    this.api.onDidActivePanelChange(event=>{const id=event.panel?.id;if(id&&this.tools[id]?.side==='bottom')ide.currentPanel=id;if(id&&this.tools[id]?.side==='left')ide.currentSide=id;this.indicators();});
    this.api.onWillDragPanel(()=>this.beginDrag());this.api.onWillDragGroup(()=>this.beginDrag());
    for(const name of ['pointerup','pointercancel','dragend'])document.addEventListener(name,()=>this.endDrag(),true);
    document.addEventListener('pointerdown',event=>{if(event.target.closest('#dockWorkspace .dv-sash'))this.beginDrag();},true);
    new ResizeObserver(()=>this.layout()).observe(this.host);
    // Restoring bounded floats before the workbench has dimensions clamps every
    // saved position to (0,0). Give Dockview its actual viewport first.
    this.layout();
    const saved=ide.settings.dockWindows;
    try{if(saved?.schema===1&&saved.layout){this.locations=saved.locations||{};this.api.fromJSON(saved.layout);if(!this.api.getPanel('editor'))throw Error('Missing editor');for(const p of this.api.panels)if(!this.tools[p.id])throw Error('Unknown tool');}else this.defaults();}
    catch(error){console.warn('Window layout reset',error);this.defaults();}
    for(const group of this.api.groups)this.markEditorGroup(group);
    this.restoring=false;this.layout();this.indicators();
    $('#treeToggle').onclick=()=>this.toggle('project');
    $('#hidePanel').onclick=()=>this.hide(ide.currentPanel);
  }
  component(id){
    const element=document.createElement('div');element.className='studio-dock-content tool-'+id;
    const content=this.contents.get(id);if(!content)throw Error('Unknown tool '+id);
    return{element,init:()=>{element.append(content);},layout:()=>NativeEditing.queueLayout(),dispose:()=>{if(content.parentElement===element)this.stash.append(content);}};
  }
  tab(id){
    const element=document.createElement('div');element.className='studio-tool-tab tool-'+id;element.dataset.tool=id;
    const title=tr(this.tools[id]?.title||id);element.innerHTML=svg(this.tools[id]?.icon||'files')+'<span>'+escapeHtml(title)+'</span>';
    element.title=title;element.setAttribute('aria-label',title);
    if(id!=='editor'){const close=document.createElement('button');close.className='studio-tool-close';close.title=tr('Скрыть окно');close.setAttribute('aria-label',close.title);close.innerHTML=svg('x');close.onpointerdown=e=>e.stopPropagation();close.onclick=e=>{e.stopPropagation();this.hide(id);};element.append(close);element.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();this.menu(id,element);};}
    return{element,init(){}};
  }
  actions(group){
    const element=document.createElement('div');element.className='studio-window-actions';
    const clear=document.createElement('button');clear.className='icon-button small';clear.title=tr('Очистить вывод');clear.setAttribute('aria-label',clear.title);clear.innerHTML=svg('clear');clear.onclick=()=>{const output=$('#'+group.activePanel?.id+'Output');if(output)output.textContent='';};element.append(clear);
    const button=document.createElement('button');button.className='icon-button small';button.title=tr('Размещение окна');button.setAttribute('aria-label',button.title);button.innerHTML=svg('studio-placement');button.onclick=()=>this.menu(group.activePanel?.id,button);element.append(button);
    const update=()=>{element.hidden=!group.activePanel||group.activePanel.id==='editor';clear.hidden=!['console','build','terminal'].includes(group.activePanel?.id);const actions=$('.studio-project-content .side-actions')||this.projectActions;if(actions){this.projectActions=actions;if(group.activePanel?.id==='project')element.insertBefore(actions,button);else if(actions.parentElement===element)this.stash.append(actions);}button.title=tr('Размещение окна');button.setAttribute('aria-label',button.title);};
    const subscription=group.api.onDidActivePanelChange(update);
    return{element,init:update,dispose:()=>subscription.dispose()};
  }
  markEditorGroup(group){if(group.panels.some(p=>p.id==='editor')){group.api.locked=true;group.element?.classList.add('studio-code-group');}}
  defaults(){
    const selected=this.ide.currentPanel||'problems';this.api.clear();this.locations={};
    const group=this.api.addGroup({direction:'right',id:'studio-code',hideHeader:true,locked:true});
    this.api.addPanel({id:'editor',component:'studio',position:{referenceGroup:group},minimumWidth:100,minimumHeight:90});
    const leftHidden=!!this.ide.settings.layout?.sidebarHidden,bottomHidden=!!this.ide.settings.layout?.panelHidden;
    if(!leftHidden)this.show('project');
    if(!bottomHidden){for(const id of ['problems','console','build','terminal','debug'])this.show(id);this.show(selected);this.api.getPanel(selected)?.group.api.setSize({height:this.ide.settings.layout?.panelHeight||220});}
    this.api.getPanel('editor').api.setActive();
  }
  rail(){
    const bar=$('.activitybar'),help=$('#helpButton');bar.replaceChildren();this.buttons=new Map();
    for(const id of ['project','search','outline','git','console','terminal','build','debug','problems']){
      if(id==='console'){const spacer=document.createElement('div');spacer.className='top-spacer';bar.append(spacer);}
      const tool=this.tools[id],button=document.createElement('button');button.className='activity tool-'+id;button.dataset.tool=id;button.id=id==='console'?'consoleToggle':id==='git'?'gitButton':'toolWindow-'+id;button.title=tr(tool.title);button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed','false');button.innerHTML=svg(tool.icon)+'<span class="studio-tool-badge" hidden></span>';button.onclick=()=>tool.side==='left'?this.ide.toggleSide(id):this.toggle(id);button.oncontextmenu=e=>{e.preventDefault();this.menu(id,button);};bar.append(button);this.buttons.set(id,button);
    }
    bar.append(help);
  }
  show(id){
    if(!this.tools[id])return;if(this.api.hasMaximizedGroup()&&this.api.activePanel?.id!==id)this.restoreMaximized();if(this.focusLayout){this.restoreFocus();}
    let panel=this.api.getPanel(id);if(panel){panel.api.setActive();this.indicators();return panel;}
    const tool=this.tools[id],last=this.locations[id],group=last?.group&&this.api.getGroup(last.group);
    const peer=this.api.panels.find(p=>p.id!=='editor'&&this.tools[p.id]?.side===tool.side&&p.api.location.type==='grid');
    const options={id,component:'studio',title:tr(tool.title),minimumWidth:150,minimumHeight:90,initialWidth:this.ide.settings.layout?.sidebarWidth||230,initialHeight:this.ide.settings.layout?.panelHeight||220};
    if(last?.floating)options.floating={x:last.x,y:last.y,width:last.width,height:last.height};
    else if(group)options.position={referenceGroup:group};
    else if(peer&&!last?.side)options.position={referencePanel:peer};
    else{const side=last?.side||tool.side;options.position=side==='bottom'?{direction:'below'}:{referencePanel:'editor',direction:side==='top'?'above':side};}
    panel=this.api.addPanel(options);this.indicators();return panel;
  }
  remember(panel){
    if(!panel||panel.id==='editor')return;const floating=panel.api.location.type==='floating',box=panel.group.api.boundingBox;
    this.locations[panel.id]={...this.locations[panel.id],group:panel.group.id,floating,...(floating&&box?{x:box.left,y:box.top,width:box.width,height:box.height}:{})};
  }
  hide(id){if(this.maximizedLayout)this.restoreMaximized();const panel=this.api.getPanel(id);if(!panel||id==='editor')return;this.remember(panel);panel.api.close();this.indicators();this.ide.editor.focus();}
  toggle(id){const panel=this.api.getPanel(id);if(panel?.api.isVisible&&panel.group.activePanel===panel)this.hide(id);else this.show(id);}
  place(id,side){
    if(id==='editor'||!this.tools[id])return;const panel=this.show(id);
    if(side==='float'){const b=this.host.getBoundingClientRect();this.api.addFloatingGroup(panel,{x:Math.max(8,b.width*.2),y:Math.max(8,b.height*.18),width:Math.min(520,b.width-20),height:Math.min(340,b.height-30)});}
    else{if(side==='bottom'){const group=this.api.addGroup({direction:'below',skipSetActive:true});panel.api.moveTo({group});}else panel.api.moveTo({group:this.api.getPanel('editor').group,position:side});this.locations[id]={side,floating:false};}
    this.remember(panel);this.changed();
  }
  menuItems(id){if(!id||id==='editor')return[];return[['Плавающее окно','float'],['Привязать слева','left'],['Привязать справа','right'],['Привязать сверху','top'],['Привязать снизу','bottom']].map(([label,side])=>({label:tr(label),action:()=>this.place(id,side)})).concat([{label:tr(this.api.hasMaximizedGroup()?'Восстановить размер панели':'Развернуть панель'),action:()=>this.maximize(id)},{label:tr('Скрыть окно'),action:()=>this.hide(id)}]);}
  menu(id,anchor){
    if(!id||id==='editor')return;const menu=document.createElement('div');menu.className='studio-create-menu studio-window-menu';
    const icons=['studio-float','studio-dock-left','studio-dock-right','studio-dock-top','studio-dock-bottom','studio-placement','x'];
    this.menuItems(id).forEach((item,index)=>{const button=document.createElement('button');button.innerHTML=svg(icons[index])+'<span>'+escapeHtml(item.label)+'</span>';button.onclick=()=>{StudioPopover.close();item.action();};menu.append(button);});StudioPopover.open(menu,anchor);
  }
  maximize(id=this.ide.currentPanel){
    if(this.api.hasMaximizedGroup()){this.restoreMaximized();return;}
    let panel=this.api.getPanel(id)||this.show(id);if(!panel)return;
    if(panel.api.location.type==='floating'){const layout=this.api.toJSON();this.place(id,'bottom');this.maximizedLayout=layout;panel=this.api.getPanel(id);}
    panel.api.maximize();NativeEditing.queueLayout();
  }
  restoreMaximized(){this.api.exitMaximizedGroup();if(this.maximizedLayout){const layout=this.maximizedLayout;this.maximizedLayout=null;this.restoring=true;try{this.api.fromJSON(layout,{reuseExistingPanels:true});}finally{this.restoring=false;}}this.layout();this.indicators();}
  focus(){if(this.focusLayout){this.restoreFocus();return;}if(this.api.hasMaximizedGroup())this.restoreMaximized();this.focusLayout=this.api.toJSON();this.restoring=true;for(const p of [...this.api.panels])if(p.id!=='editor')p.api.close();this.restoring=false;this.indicators();this.ide.editor.focus();}
  restoreFocus(){if(!this.focusLayout)return;const saved=this.focusLayout;this.focusLayout=null;this.restoring=true;try{this.api.fromJSON(saved,{reuseExistingPanels:true});}finally{this.restoring=false;}this.layout();this.indicators();}
  reset(){this.restoring=true;try{this.api.exitMaximizedGroup();this.maximizedLayout=null;this.ide.settings.layout={...this.ide.settings.layout,sidebarHidden:false,panelHidden:false};this.focusLayout=null;this.defaults();}finally{this.restoring=false;}this.changed();}
  layout(){const b=this.host.getBoundingClientRect();if(b.width>0&&b.height>0)this.api.layout(b.width,b.height);NativeEditing.queueLayout();}
  beginDrag(){document.body.classList.add('studio-window-dragging');native('editorResizeStart').catch(console.warn);}
  endDrag(){if(!document.body.classList.contains('studio-window-dragging'))return;document.body.classList.remove('studio-window-dragging');native('editorResizeEnd').catch(console.warn);this.changed();}
  changed(){
    NativeEditing.queueLayout();this.indicators();if(this.restoring||this.focusLayout)return;clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.persist(),500);
  }
  persist(){
    if(this.restoring||this.focusLayout)return;for(const panel of this.api.panels)this.remember(panel);this.ide.settings.dockWindows={schema:1,layout:this.maximizedLayout||this.api.toJSON(),locations:this.locations};this.ide.saveWorkspaceSettings();
  }
  indicators(){
    if(!this.buttons)return;for(const[id,button]of this.buttons){const panel=this.api.getPanel(id),active=!!panel?.api.isVisible;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}
    document.body.classList.toggle('panel-hidden',!this.api.panels.some(p=>this.tools[p.id]?.side==='bottom'&&p.api.isVisible));
    document.body.classList.toggle('sidebar-hidden',!this.api.panels.some(p=>this.tools[p.id]?.side==='left'&&p.api.isVisible));
    for(const[id,on]of [['build',this.ide.busy],['console',this.ide.running],['debug',this.ide.debugger?.active]])this.buttons.get(id)?.classList.toggle('tool-running',!!on);
    const diagnostics=[...this.ide.diagnosticMap.values()].flatMap(v=>v.diagnostics||[]),errors=diagnostics.filter(d=>d.severity===1).length,count=diagnostics.length,badge=this.buttons.get('problems')?.querySelector('.studio-tool-badge');if(badge){badge.hidden=!count;badge.textContent=count>99?'99+':String(count);badge.parentElement.classList.toggle('tool-errors',!!errors);badge.parentElement.title=tr('Проблемы')+(count?' · '+count:'');}
  }
}
const windowMethods={
 initWindows(){this.windows=new StudioWindows(this);},
 showPanel(name){if(!this.windows)return;this.currentPanel=name;return this.windows.show(name);},
 togglePanel(show){if(!this.windows)return;const id=this.currentPanel||'console';if(show===undefined)this.windows.toggle(id);else if(show)this.windows.show(id);else this.windows.hide(id);},
 showSide(name){if(!this.windows)return;this.currentSide=name;const panel=this.windows.show(name);if(name==='search'){this.searchFiles($('#fileSearch').value);$('#fileSearch').focus();}if(name==='outline')this.updateOutline();if(name==='git')this.refreshGit().catch(safeError);return panel;},
 toggleSide(name){if(!this.windows)return;this.windows.toggle(name);if(this.windows.api.getPanel(name))this.showSide(name);},
 async showGit(){if(await this.requireToolPack('git'))return this.showSide('git');},
 maximizePanel(){this.windows?.maximize();},
 updatePanelMaximize(){},
 toggleFocusMode(){this.windows?.focus();},
 resetLayout(){this.windows?.reset();},
 back(){if(StudioChoices.active){StudioChoices.close(true);return;}if(StudioPopover.current){StudioPopover.close();return;}const dialogs=$$('dialog[open]');if(dialogs.length){dialogs.at(-1).close('cancel');return;}if(!$('#menu').classList.contains('hidden')){$('#menu').classList.add('hidden');return;}if($('#mainMenuToggle').getAttribute('aria-expanded')==='true'){this.toggleMainMenu(false);return;}if(this.windows?.api.hasMaximizedGroup()){this.windows.restoreMaximized();return;}if(this.windows?.focusLayout){this.windows.restoreFocus();return;}this.editor.focus();},
};
