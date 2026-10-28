'use strict';
window.StudioWebInput=text=>{const field=document.activeElement;if(!field?.matches('input:not([type=checkbox]),textarea')||field.disabled||field.readOnly)return false;const start=field.selectionStart??field.value.length,end=field.selectionEnd??start;try{field.setRangeText(text,start,end,'end');}catch{field.value=field.value.slice(0,start)+text+field.value.slice(end);}field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));return true;};
const compactMethods={
  initCompactUI(){
    for(const id of ['buildButton','runButton','debugButton']){
      const button=$('#'+id);button.classList.add('studio-toolbar-action');button.setAttribute('aria-label',tr(button.title));
    }
    for(const[id,name]of [['formatButton','format'],['formatterSettingsButton','settings']]){
      const button=$('#'+id);button.className='icon-button small';button.innerHTML=svg(name);button.setAttribute('aria-label',tr(button.title));
    }
    const maximize=document.createElement('button');maximize.id='maximizePanel';maximize.className='icon-button small';maximize.onclick=()=>this.maximizePanel();$('#hidePanel').before(maximize);this.updatePanelMaximize();
    $('#mainMenuToggle').onclick=()=>this.toggleMainMenu();
    $('#mainMenus').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...$('#mainMenus').children],at=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length].focus();});
    document.addEventListener('pointerdown',event=>{if(!event.target.closest('#mainMenus,#mainMenuToggle,#menu'))this.toggleMainMenu(false);},true);
    onNative('editorDismissPopover',()=>{this.toggleMainMenu(false);$('#menu').classList.add('hidden');});
    $('#tabs').addEventListener('dblclick',event=>{if(event.target.closest('.tab')&&!event.target.closest('.tab-close'))this.toggleFocusMode();});
    $('.panel-heading').addEventListener('dblclick',event=>{if(!event.target.closest('button'))this.maximizePanel();});
    const keyboardRevision=e=>NativeEditing.keyboardRevision=Math.max(NativeEditing.keyboardRevision||0,e.revision||0);
    onNative('floatingKeyboardModifiers',e=>{keyboardRevision(e);this.settings.keyboardModifiers=e.mode;this.saveWorkspaceSettings();});
    onNative('floatingKeyboardMode',e=>{keyboardRevision(e);if(this.addons?.host.lastFeatures&&!this.addons.host.enabled('keyboard'))return;if(this.settings.keyboardPrimary===e.mode)return;this.settings.keyboardPrimary=e.mode;this.saveWorkspaceSettings();});
    onNative('floatingKeyboardSize',e=>{keyboardRevision(e);const prefix=e.layout==='pc'?'keyboardPc':'keyboardAndroid';this.settings[prefix+'Width']=e.width;this.settings[prefix+'Height']=e.height;this.saveWorkspaceSettings();});
    this.initDialogDismiss();
    const webInput=()=>native('editorWebInput',{focused:studioTextInput(document.activeElement)}).catch(console.warn);document.addEventListener('focusin',webInput);document.addEventListener('focusout',()=>queueMicrotask(webInput));
    this.initTouchTips();
  },
  toggleMainMenu(show=$('#mainMenus').classList.contains('hidden')){
    if(show===!$('#mainMenus').classList.contains('hidden'))return;
    StudioChoices.close();StudioPopover.close();StudioHover.hide();$('#menu').classList.add('hidden');
    $('#mainMenus').classList.toggle('hidden',!show);$('#mainToolbar').classList.toggle('hidden',show);$('#mainMenuToggle').setAttribute('aria-expanded',String(show));
    if(!show&&$('#mainMenus').contains(document.activeElement))$('#mainMenuToggle').focus();
  },
  initDialogDismiss(){
    let press=null;
    const outside=(dialog,event)=>{const b=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom);};
    document.addEventListener('pointerdown',event=>{const dialog=event.target.closest?.('dialog[open]');press=dialog&&event.button===0&&outside(dialog,event)?{dialog,id:event.pointerId,x:event.clientX,y:event.clientY}:null;},true);
    document.addEventListener('pointerup',event=>{const p=press;press=null;if(p&&p.id===event.pointerId&&p.dialog.open&&p.dialog.dataset.dismissLocked!=='true'&&outside(p.dialog,event)&&Math.hypot(event.clientX-p.x,event.clientY-p.y)<8){event.preventDefault();event.stopImmediatePropagation();p.dialog.close('cancel');}},true);
    document.addEventListener('pointercancel',()=>{press=null;},true);
  },
  initTouchTips(){
    let press=null,suppress=null;
    const clear=()=>{if(press)clearTimeout(press.timer);press=null;};
    document.addEventListener('pointerdown',event=>{clear();if(event.pointerType!=='touch')return;const target=event.target.closest('.studio-toolbar-action,.activity,#formatButton,#formatterSettingsButton');if(!target||target.disabled||(!target.title&&!target.dataset.studioTooltip))return;press={target,id:event.pointerId,x:event.clientX,y:event.clientY,shown:false};const item=press;item.timer=setTimeout(()=>{if(press!==item)return;StudioHover.hide();StudioHover.target=target;StudioHover.original=target.title||target.dataset.studioTooltip;StudioHover.x=item.x;StudioHover.y=item.y;StudioHover.show();item.shown=true;},600);},true);
    document.addEventListener('pointermove',event=>{if(press&&press.id===event.pointerId&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>8){clear();StudioHover.hide();}},true);
    document.addEventListener('pointerup',event=>{if(press?.id!==event.pointerId)return;if(press.shown){suppress={target:press.target,until:performance.now()+800};event.preventDefault();setTimeout(()=>StudioHover.hide(),1300);}clear();},true);
    document.addEventListener('pointercancel',()=>{clear();StudioHover.hide();},true);
    document.addEventListener('click',event=>{if(suppress&&performance.now()<suppress.until&&suppress.target.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();}suppress=null;},true);
    document.addEventListener('contextmenu',event=>{if(press?.shown){event.preventDefault();event.stopImmediatePropagation();}},true);
  },
  updatePanelMaximize(){
    const button=$('#maximizePanel'),max=document.body.classList.contains('panel-maximized');if(!button)return;
    button.title=tr(max?'Восстановить размер панели':'Развернуть панель');button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed',String(max));
    button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">'+(max?'<path d="M8 3v5H3m13 13v-5h5M8 8 3 3m13 13 5 5"/>':'<path d="M8 3H3v5m13 13h5v-5M3 3l6 6m12 12-6-6"/>')+'</svg>';
  },
  maximizePanel(show=!document.body.classList.contains('panel-maximized')){if(show)this.togglePanel(true);document.body.classList.toggle('panel-maximized',show);this.updatePanelMaximize();this.layoutEditors();},
  toggleFocusMode(){
    if(this.focusLayout){for(const[name,on]of Object.entries(this.focusLayout))document.body.classList.toggle(name,on);this.focusLayout=null;}
    else{this.focusLayout=Object.fromEntries(['sidebar-hidden','panel-hidden','sidebar-mobile-open','panel-maximized'].map(name=>[name,document.body.classList.contains(name)]));document.body.classList.add('sidebar-hidden','panel-hidden');document.body.classList.remove('sidebar-mobile-open','panel-maximized');}
    this.updatePanelMaximize();this.layoutEditors();this.editor.focus();
  },
  compactKeydown(event){
    if(document.querySelector('dialog[open]')||event.target?.closest?.('input,textarea,[contenteditable=true]'))return false;
    let action;
    if(event.key==='Escape'&&this.windows?.targets.ctx)action=()=>this.windows.targets.cancel();
    else if(event.ctrlKey&&event.shiftKey&&event.key==='F12')action=()=>this.toggleFocusMode();
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='j'&&this.windows)action=()=>this.windows.toggle(this.currentPanel||'console');
    else if(event.altKey&&!event.ctrlKey&&this.windows&&({1:'project',4:'console',5:'debug',6:'problems',7:'outline',9:'git'})[event.key])action=()=>this.windows.toggle(({1:'project',4:'console',5:'debug',6:'problems',7:'outline',9:'git'})[event.key]);
    else if(event.key==='Escape'&&$('#mainMenuToggle').getAttribute('aria-expanded')==='true')action=()=>{this.toggleMainMenu(false);this.editor.focus();};
    else if(event.key==='Escape'&&this.windows?.api.hasMaximizedGroup())action=()=>this.windows.restoreMaximized();
    else if(event.key==='Escape'&&document.body.classList.contains('panel-maximized'))action=()=>this.maximizePanel(false);
    else if(event.shiftKey&&event.key==='Escape')action=()=>{if(this.windows){const id=this.windows.api.activePanel?.id;if(id&&id!=='editor')this.windows.hide(id);else this.togglePanel(false);}else this.togglePanel(false);this.editor.focus();};
    if(!action)return false;event.preventDefault();event.stopImmediatePropagation();action();return true;
  }
};
