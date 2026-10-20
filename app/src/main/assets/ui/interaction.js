'use strict';

// Shared by touch, mouse and pen. No document-wide drag or wheel interception.
function studioResizer(element, make) {
  element.setAttribute('role', 'separator');
  element.tabIndex = 0;
  const vertical = element.id !== 'panelResizer';
  element.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
  element.setAttribute('aria-label', tr('Изменить размер панели'));
  if(typeof document.createElement==='function'){const hit=document.createElement('span');hit.className='studio-resize-hit';element.append(hit);}
  let drag = null, frame = 0;
  const finish = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = drag.started;
    if (frame) { cancelAnimationFrame(frame); frame = 0; drag.move(drag.dx, drag.dy); }
    drag = null;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId); document.body.classList.remove('pane-resizing'); element.classList.remove('dragging');
    if (moved) element.dispatchEvent(new Event('studio-resize-end'));
  };
  element.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || drag) return;
    event.preventDefault();
    drag = {id:event.pointerId, x:event.clientX, y:event.clientY, dx:0, dy:0, threshold:event.pointerType==='touch'?8:4, move:make(), started:false};
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    drag.dx=event.clientX-drag.x; drag.dy=event.clientY-drag.y;
    if (!drag.started && Math.hypot(drag.dx,drag.dy)<drag.threshold) return;
    drag.started=true; document.body.classList.add('pane-resizing'); element.classList.add('dragging');
    if (!frame) frame=requestAnimationFrame(()=>{frame=0;if(drag)drag.move(drag.dx,drag.dy);});
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) element.addEventListener(type,finish);
  element.addEventListener('keydown', event => {
    const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if (!direction) return;
    event.preventDefault(); const step=event.shiftKey?40:10; make()(direction[0]*step,direction[1]*step);
    element.dispatchEvent(new Event('studio-resize-end'));
  });
}

// Retain select form semantics; choices stay anchored and do not take modal focus.
const StudioChoices={
  buttons:new Map(),active:null,
  refresh(select){const button=this.buttons.get(select);if(!button)return;const text=select.selectedOptions[0]?.textContent||'';if(button.textContent!==text)button.textContent=text;button.disabled=select.disabled;button.title=select.title||text;button.setAttribute('aria-label',select.getAttribute('aria-label')||text);},
  enhance(root=document){
    for(const select of root.querySelectorAll('select')){
      if(this.buttons.has(select)){this.refresh(select);continue;}
      const button=document.createElement('button');button.type='button';button.className='studio-select';button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
      select.classList.add('studio-native-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true');select.after(button);this.buttons.set(select,button);
      button.onclick=event=>this.active?.select===select?this.close():this.open(select,event.detail===0);select.addEventListener('change',()=>this.refresh(select));button.onkeydown=event=>{if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();this.open(select,true);}};
      new MutationObserver(()=>this.refresh(select)).observe(select,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['disabled','selected','title','aria-label']});this.refresh(select);
    }
    for(const [select]of this.buttons)if(!select.isConnected)this.buttons.delete(select);
  },
  close(restore=false){const current=this.active;if(!current)return;this.active=null;current.button.setAttribute('aria-expanded','false');current.observer?.disconnect();current.popover.remove();NativeEditing.queueLayout();if(restore&&current.button.isConnected)current.button.focus();},
  position(){const a=this.active;if(!a)return;if(!a.button.isConnected||!a.button.getClientRects().length){this.close();return;}const b=a.button.getBoundingClientRect(),v=window.visualViewport,left=v?.offsetLeft||0,top=v?.offsetTop||0,width=v?.width||innerWidth,height=v?.height||innerHeight,p=a.popover;p.style.width=Math.min(width-16,Math.max(a.select.matches('#compilerSelect,[name=compiler]')?320:210,b.width))+'px';p.style.maxHeight=Math.min(330,height-24)+'px';p.style.left=Math.max(left+8,Math.min(b.left,left+width-p.offsetWidth-8))+'px';const below=top+height-b.bottom-8,above=b.top-top-8;const y=below>=Math.min(180,p.scrollHeight)||below>=above?b.bottom+4:b.top-p.offsetHeight-4;p.style.top=Math.max(top+8,Math.min(y,top+height-p.offsetHeight-8))+'px';NativeEditing.queueLayout();},
  open(select,focus=false){
    if(select.disabled)return;this.close();const button=this.buttons.get(select);if(!button)return;const popover=document.createElement('div');popover.className='studio-choice-popover';
    const search=document.createElement('input');search.type='search';search.placeholder=tr('Поиск…');search.setAttribute('aria-label',tr('Поиск…'));search.spellcheck=false;search.autocomplete='off';search.hidden=select.options.length<=10;popover.append(search);
    const list=document.createElement('div');list.className='studio-choice-list';list.setAttribute('role','listbox');popover.append(list);
    const render=()=>{list.replaceChildren();for(const option of select.options){if(option.hidden||!option.textContent.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()))continue;const row=document.createElement('div');row.className='studio-choice-row';const pick=document.createElement('button');pick.type='button';pick.textContent=option.textContent;pick.disabled=option.disabled;pick.setAttribute('role','option');pick.setAttribute('aria-selected',String(option.selected));pick.dataset.value=option.value;pick.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));this.refresh(select);this.close(true);};row.append(pick);
      if(select.matches('#compilerSelect,[name=compiler]')){const pack=window.forge?.toolPackState?.packs.find(p=>p.id==='clang'),status=document.createElement(option.value==='gcc'?'small':'button');status.className='studio-choice-action';if(option.value==='gcc'){status.textContent=tr('Включён');}else{status.type='button';status.textContent=tr(pack?.installed?'Удалить':'Скачать');status.disabled=!!window.forge?.packBusy;status.onclick=async()=>{try{await window.forge.setToolPack('clang',!pack?.installed);render();this.position();}catch(e){safeError(e);}};}row.append(status);}list.append(row);}
      if(select.matches('#compilerSelect,[name=compiler]')){const note=document.createElement('small');note.className='studio-choice-note';note.textContent=tr('Доступны GCC 15.2 и Clang 21.1.8. Стандарт языка выбирается отдельно.');list.append(note);}this.position();};
    search.oninput=render;popover.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close(true);return;}const rows=[...list.querySelectorAll('[role=option]:not(:disabled)')];if(!rows.length)return;const at=rows.indexOf(document.activeElement);if(event.key==='Enter'&&document.activeElement===search){event.preventDefault();rows[0].click();}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();rows[event.key==='Home'?0:event.key==='End'?rows.length-1:(at+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length].focus();}});
    (select.closest('dialog[open]')||document.body).append(popover);this.active={select,button,popover};button.setAttribute('aria-expanded','true');render();this.position();this.active.observer=new ResizeObserver(()=>this.position());this.active.observer.observe(popover);if(focus)list.querySelector('[aria-selected=true]')?.focus();
  },
  init(){this.enhance();new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'||[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('select')||n.querySelector('select')))))queueMicrotask(()=>this.enhance());}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});document.addEventListener('pointerdown',e=>{if(this.active&&!this.active.popover.contains(e.target)&&e.target!==this.active.button)this.close();},true);document.addEventListener('click',()=>{for(const[s]of this.buttons)this.refresh(s);},true);document.addEventListener('close',()=>{this.close();requestAnimationFrame(()=>{if(!document.querySelector('dialog[open]'))window.forge?.editor.focus();});},true);window.addEventListener('resize',()=>this.position());window.visualViewport?.addEventListener('resize',()=>this.position());document.addEventListener('scroll',e=>{if(this.active&&!this.active.popover.contains(e.target))this.close();},true);onNative('editorDismissPopover',()=>this.close());}
};
