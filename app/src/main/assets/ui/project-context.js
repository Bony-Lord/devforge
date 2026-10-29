'use strict';
Object.assign(StudioConfigurations.prototype,{
  rememberInterface(){const s=this.ide.settings;if(!this.ide.state.root)return;s.projectInterfaces??={};s.projectInterfaces[this.ide.state.root]={mode:s.interfaceMode||'simple',layout:structuredClone(s.layout||{}),dockWindows:structuredClone(s.dockWindows||null)};},
  async captureInterface(){await this.ide.windows?.persist(true);this.rememberInterface();await native('settingsCommit',this.ide.settings);},
  async applyProjectContext(startup=false){
    const ide=this.ide,addons=ide.addons,doc=this.document||{};this.loadingProject=true;
    try{
      const requested=StudioProjectPolicy.profile(doc,addons.baseProfile||[]);const scoped=doc.addons?.mode==='project';
      try{const resolved=StudioAddonCore.resolve(addons.catalog,requested);if(addons.host.missing(resolved).some(pack=>!pack.optional))throw Error(addons.text('Для профиля проекта нужны инструменты. Откройте аддоны и примените состав для установки.','Project profile requires tools. Open Addons and apply its selection to install.'));addons.projectScoped=scoped;await addons.apply(requested,false);}catch(error){addons.projectScoped=true;await addons.apply([],false);addons.errors.push({message:error.message});ide.toast(error.message);}
      const s=ide.settings;s.projectDefaultInterface??={mode:s.interfaceMode||'simple',layout:structuredClone(s.layout||{}),dockWindows:structuredClone(s.dockWindows||null)};
      const ui=s.projectInterfaces?.[ide.state.root]||s.projectDefaultInterface,wanted=doc.interface?.mode&&doc.interface.mode!=='inherit'?doc.interface.mode:ui.mode;
      const useWindows=addons.host.enabled('windows')&&addons.host.windowsAvailable!==false&&wanted==='windows',changed=!startup&&(!!ide.windows!==useWindows||this.contextRoot!==ide.state.root&&!!ide.windows);
      s.interfaceMode=wanted;s.layout=structuredClone(ui.layout||{});s.dockWindows=structuredClone(ui.dockWindows||null);this.contextRoot=ide.state.root;
      if(startup){addons.host.bootWindows=useWindows;addons.host.needsReload=false;}
      document.body.classList.toggle('sidebar-hidden',!!s.layout.sidebarHidden);document.body.classList.toggle('panel-hidden',!!s.layout.panelHidden);await ide.applyUIScale();await native('settingsCommit',s);this.render();ide.registerCommands();
      if(changed){await ide.persistSession(true);location.reload();return{reloading:true};}
      return{reloading:false};
    }finally{this.loadingProject=false;}
  }
});
Object.assign(StudioConfigurationEditor.prototype,{
  actionFields(configuration){
    this.section('Действия конфигурации');configuration.actions??={};
    for(const kind of StudioProjectPolicy.kinds){const row=document.createElement('label');row.className='studio-config-row';const title=document.createElement('span');title.textContent=tr(({build:'Сборка',run:'Запустить',debug:'Отладка'})[kind]);const select=document.createElement('select'),none=document.createElement('option');none.value='';none.textContent=this.ide.settings.language==='en'?'Not defined — hide button':'Не задано — скрыть кнопку';select.append(none);
      for(const entry of this.ide.addons.registry.list('actionProviders').filter(e=>e.value.kind===kind)){const option=document.createElement('option');option.value=entry.value.id;option.textContent=this.ide.addons.local(entry.value.label);select.append(option);}
      const current=configuration.actions[kind]?.provider||'';if(current&&![...select.options].some(o=>o.value===current)){const option=document.createElement('option');option.value=current;option.textContent=current;select.append(option);}select.value=current;
      select.dataset.actionKind=kind;select.onchange=()=>{if(select.value)configuration.actions[kind]={...configuration.actions[kind],provider:select.value};else delete configuration.actions[kind];this.attempt(()=>this.paint());};row.append(title,select);this.fields.append(row);
    }
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=this.ide.settings.language==='en'?'Project interface and addons':'Интерфейс и аддоны проекта';details.append(summary);
    const label=document.createElement('label'),select=document.createElement('select');label.textContent=this.ide.settings.language==='en'?'Interface: ':'Интерфейс: ';for(const[value,ru,en]of [['inherit','Из настроек','Inherit settings'],['simple','Упрощённый','Simple'],['windows','Оконный','Windows']]){const option=document.createElement('option');option.value=value;option.textContent=this.ide.settings.language==='en'?en:ru;select.append(option);}select.value=this.draft.interface?.mode||'inherit';select.onchange=()=>{this.draft.interface={...this.draft.interface,mode:select.value};};label.append(select);details.append(label);
    const addons=document.createElement('button');addons.type='button';addons.textContent=this.ide.settings.language==='en'?'Configure project addons…':'Настроить аддоны проекта…';addons.onclick=async()=>{try{this.capture();await this.owner.save(this.draft);await this.owner.apply();this.dialog.close();const manager=this.ide.addons;manager.selectionScope='project';manager.beginSelection();manager.open();}catch(error){this.error.textContent=error.message;}};details.append(addons);this.fields.append(details);
  }
});
