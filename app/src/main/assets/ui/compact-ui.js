'use strict';
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
    this.initDialogDismiss();
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
    document.addEventListener('pointerup',event=>{const p=press;press=null;if(p&&p.id===event.pointerId&&p.dialog.open&&outside(p.dialog,event)&&Math.hypot(event.clientX-p.x,event.clientY-p.y)<8){event.preventDefault();event.stopImmediatePropagation();p.dialog.close('cancel');}},true);
    document.addEventListener('pointercancel',()=>{press=null;},true);
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
    if(event.ctrlKey&&event.shiftKey&&event.key==='F12')action=()=>this.toggleFocusMode();
    else if(event.key==='Escape'&&$('#mainMenuToggle').getAttribute('aria-expanded')==='true')action=()=>{this.toggleMainMenu(false);this.editor.focus();};
    else if(event.key==='Escape'&&document.body.classList.contains('panel-maximized'))action=()=>this.maximizePanel(false);
    else if(event.shiftKey&&event.key==='Escape')action=()=>{this.togglePanel(false);this.editor.focus();};
    if(!action)return false;event.preventDefault();event.stopImmediatePropagation();action();return true;
  }
};
