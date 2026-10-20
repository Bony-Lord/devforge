'use strict';
const releaseMethods={
  initReleaseUI(){
    const form=$('#settingsForm'),sections=[...form.querySelectorAll(':scope > section')];
    const motion=document.createElement('label');motion.innerHTML='Анимации<select name="motion"><option value="system">Как в системе</option><option value="reduced">Минимальные</option></select>';form.querySelector('[name=uiScale]')?.closest('section').append(motion);
    if(window.StudioDesktop){
      $('#keyboardButton').classList.add('hidden');const legal=document.createElement('div');legal.className='desktop-legal-note';legal.innerHTML='<p>Настольная версия использует Electron, Chromium и FFmpeg под LGPL 2.1 или новее. Исходники библиотек распространяются рядом со сборками.</p><button type="button" id="desktopNotices">Лицензии Electron / Chromium</button><button type="button" id="desktopSources">Исходники библиотек</button>';$('#helpDialog').append(legal);legal.querySelector('#desktopNotices').onclick=()=>native('desktopNotices').catch(safeError);legal.querySelector('#desktopSources').onclick=()=>native('desktopSources').catch(safeError);
      const keyboardSection=form.querySelector('[name=keyboardOverlap]')?.closest('section');if(keyboardSection)keyboardSection.hidden=true;
      const tools=document.createElement('section');tools.id='desktopToolsSection';tools.innerHTML='<h3>Инструменты системы</h3><p>Укажите путь к установленному инструменту или оставьте поле пустым для автоматического поиска.</p><div class="desktop-tool-fields"></div>';
      const fields=tools.querySelector('.desktop-tool-fields');
      for(const [key,label]of Object.entries({gcc:'GCC · C',gxx:'GCC · C++',clang:'Clang · C',clangxx:'Clang · C++',clangd:'clangd',format:'clang-format',cmake:'CMake',ninja:'Ninja',gdb:'GDB',gdbserver:'gdbserver',lldbdap:'LLDB DAP',git:'Git',symbolizer:'llvm-symbolizer'})){
        if(key==='lldbdap'&&StudioDesktop.platform==='win32')continue;const row=document.createElement('label');row.innerHTML='<span></span><div class="desktop-tool-path"><input spellcheck="false" autocomplete="off"><button type="button" data-icon="folder-open" title="Выбрать исполняемый файл"></button></div>';row.querySelector('span').textContent=label;const input=row.querySelector('input');input.name='toolPath_'+key;input.placeholder=tr('Автоматический поиск');row.querySelector('button').onclick=async()=>{const result=await native('chooseToolExecutable',{name:key});if(result)input.value=result;};fields.append(row);
      }
      form.insertBefore(tools,form.querySelector('.settings-note'));sections.push(tools);
    }
    const tabs=document.createElement('nav');tabs.className='settings-categories';tabs.setAttribute('aria-label',tr('Разделы настроек'));form.before(tabs);
    this.settingsSections=sections.filter(s=>!s.hidden);
    for(const [index,section]of this.settingsSections.entries()){
      section.dataset.settingsCategory=String(index);const button=document.createElement('button');button.type='button';button.textContent=tr(section.querySelector('h3')?.textContent||'Настройки');button.onclick=()=>this.selectSettingsCategory(index);tabs.append(button);
    }
    const footer=form.querySelector('.dialog-buttons');if(footer){footer.querySelector('[type=submit]')?.setAttribute('form','settingsForm');form.after(footer);}this.selectSettingsCategory(0);this.applyMotion();
  },
  selectSettingsCategory(index){this.settingsCategory=index;this.settingsSections?.forEach((section,i)=>section.hidden=i!==index);$$('.settings-categories button').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));},
  applyMotion(){const reduced=this.settings.motion==='reduced'||this.state.capabilities?.systemAnimations===false||matchMedia('(prefers-reduced-motion:reduce)').matches;document.documentElement.dataset.motion=reduced?'reduced':'system';},
  openDesktopTools(){this.openSettings();this.selectSettingsCategory(this.settingsSections.findIndex(s=>s.id==='desktopToolsSection'));},
  documentDirty(doc){return doc.savedVersion===undefined?doc.model.getValue()!==doc.saved:doc.model.getAlternativeVersionId()!==doc.savedVersion;},
  renderTabs(){
    const signature=this.tabs.map(d=>d.path+'\0'+(d===this.active)+'\0'+this.documentDirty(d)).join('\n');if(this.tabRenderSignature===signature)return;this.tabRenderSignature=signature;
    const el=$('#tabs'),nodes=new Map([...el.children].map(node=>[node.dataset.path,node]));
    for(const d of this.tabs){let button=nodes.get(d.path);if(!button){button=document.createElement('button');button.className='tab';button.dataset.path=d.path;button.setAttribute('role','tab');button.innerHTML='<span class="file-symbol">'+fileSymbol(d.path)+'</span><span class="tab-label"></span><i class="dirty-dot hidden"></i><span class="tab-close" aria-label="'+tr('Закрыть')+'">'+svg('x')+'</span>';button.onclick=e=>{if(e.target.closest('.tab-close'))this.closeTab(d);else if(this.active!==d)this.openFile(d.path);else this.editor.focus();};}
      button.classList.toggle('active',d===this.active);button.setAttribute('aria-selected',String(d===this.active));button.title=relative(d.path,this.state.root);button.querySelector('.tab-label').textContent=basename(d.path);button.querySelector('.dirty-dot').classList.toggle('hidden',!this.documentDirty(d));el.append(button);nodes.delete(d.path);
    }for(const node of nodes.values())node.remove();
  },
  updateDirty(){let dirty=0;for(const doc of this.docs.values())if(!doc.readonly&&this.documentDirty(doc))dirty++;$('#saveStatus').textContent=tr(dirty?(this.settings.autosave?'Сохранение…':'Не сохранено: '+dirty):'Сохранено');this.renderTabs();},
  appendOutput(target,text,kind=''){
    this.outputQueues??=new Map();const queue=this.outputQueues.get(target)||[];const previous=queue.at(-1);if(previous?.kind===kind&&previous.text.length<32768)previous.text+=text;else queue.push({text,kind});this.outputQueues.set(target,queue);
    if(!this.outputFrame)this.outputFrame=requestAnimationFrame(()=>{this.outputFrame=null;this.flushOutputs();});
  },
  flushOutputs(){
    for(const [target,queue]of this.outputQueues||[]){const el=$('#'+target+'Output');if(!el)continue;const follow=el.scrollHeight-el.scrollTop-el.clientHeight<70,fragment=document.createDocumentFragment();let added=0;
      for(const {text,kind}of queue){const span=document.createElement('span');span.className=kind;span.textContent=text;added+=text.length;fragment.append(span);}el.append(fragment);el.studioOutputLength=(el.studioOutputLength||0)+added;
      // textContent is read once on manual clear, never once per incoming chunk.
      if(el.childNodes.length===queue.length)el.studioOutputLength=added;
      while(el.studioOutputLength>1100000&&el.firstChild){el.studioOutputLength-=el.firstChild.textContent.length;el.firstChild.remove();}if(follow)el.scrollTop=el.scrollHeight;
    }this.outputQueues?.clear();
  },
  async refreshToolLabels(){if(!window.StudioDesktop)return;for(const [value,key]of [['gcc','gxx'],['clang','clangxx']]){const version=this.versions?.[key]?.match(/\b\d+\.\d+(?:\.\d+)?\b/)?.[0],label=(value==='gcc'?'GCC':'Clang')+(version?' '+version:'');for(const select of [$('#compilerSelect'),$('#settingsForm [name="compiler"]')]){const option=select?.querySelector('[value="'+value+'"]');if(option)option.textContent=label;}}}
};
