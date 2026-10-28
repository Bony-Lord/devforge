'use strict';
// Workload-style draft selection. Checking a box never starts a download.
Object.assign(StudioAddons.prototype,{
  beginSelection(){this.selectionDraft=structuredClone(this.profile);this.selectionError='';},
  selectionMembers(manifest){if(this.selectionCatalog!==this.catalog){this.selectionCatalog=this.catalog;this.selectionMemberCache=new Map();}const key=manifest.id+'@'+manifest.version;if(!this.selectionMemberCache.has(key))this.selectionMemberCache.set(key,StudioAddonSelection.members(this.catalog,manifest));return this.selectionMemberCache.get(key);},
  selectionStatus(manifest){return StudioAddonSelection.state(this.catalog,this.selectionDraft,manifest,this.selectionResolved,this.selectionMembers(manifest));},
  changeSelection(manifest,checked){
    try{this.selectionDraft=StudioAddonSelection.toggle(this.catalog,this.selectionDraft,manifest,checked);this.selectionError='';}
    catch(error){this.selectionError=error.message;}
    this.render();
  },
  async applySelection(){
    const requested=structuredClone(this.selectionDraft);
    await this.queue(async()=>{
      if(this.app.running||this.app.busy||this.app.debugger?.active)throw Error(this.text('Сначала остановите программу','Stop the program first'));
      const resolved=StudioAddonCore.resolve(this.catalog,requested);
      await this.host.prepare(resolved);await this.applyNow(requested,false);this.beginSelection();
    });
  },
  selectionCheck(manifest){
    const status=this.selectionStatus(manifest),check=this.element('input');check.type='checkbox';check.checked=status.checked;check.indeterminate=status.partial;
    check.dataset.addonCheck=manifest.id;check.dataset.version=manifest.version;check.disabled=!!this.operationBusy;
    check.setAttribute('aria-label',this.local(manifest.name));check.setAttribute('aria-checked',status.partial?'mixed':String(status.checked));
    check.onchange=()=>this.changeSelection(manifest,check.checked);return check;
  },
  selectionRow(manifest,{pack=false,source='builtin'}={}){
    const status=this.selectionStatus(manifest),row=this.element(pack?'article':'div',undefined,pack?'addon-workload':'addon-component');
    row.dataset.addon=manifest.id;row.dataset.version=manifest.version;row.dataset.search=(this.local(manifest.name)+' '+manifest.id+' '+this.local(manifest.description)).toLowerCase();row.dataset.selected=String(status.checked||status.partial);
    const label=this.element('label',undefined,'addon-select-label'),info=this.element('span',undefined,'addon-select-info');
    info.append(this.element('strong',this.local(manifest.name)),this.element('small',this.local(manifest.description)));label.append(this.selectionCheck(manifest),info);row.append(label);
    const meta=this.element('div',undefined,'addon-select-meta');meta.append(this.element('small',manifest.version+' · '+(status.partial?this.text('Частично: ','Partially selected: ')+status.count+'/'+status.total:status.checked?this.text('Выбрано','Selected'):this.text('Не выбрано','Not selected'))));
    const installed=pack?StudioAddonSelection.state(this.catalog,this.profile,manifest,this.selectionActiveResolved,this.selectionMembers(manifest)).checked:this.manager.active.get(manifest.id)?.manifest.version===manifest.version;
    if(installed)meta.append(this.element('small',this.text('Сейчас включён','Currently enabled')));
    if(!pack&&(status.checked||installed)){
      const roots=this.selectionRequiredBy.get(manifest.id)||[];
      if(roots.length)meta.append(this.element('small',this.text('Нужен для: ','Required by: ')+roots.map(r=>this.local(this.catalog.find(m=>m.id===(typeof r==='string'?r:r.id))?.name)||r.id||r).join(', ')));
    }
    row.append(meta);
    if(pack){const details=this.element('details'),summary=this.element('summary',this.text('Компоненты пака','Workload components')+' · '+status.total);details.append(summary);const members=this.selectionMembers(manifest);row.dataset.search+=' '+members.map(m=>this.local(m.name)+' '+m.id).join(' ').toLowerCase();this.selectionExpanded??=new Set();details.open=this.selectionExpanded.has(manifest.id);details.ontoggle=()=>{if(details.open)this.selectionExpanded.add(manifest.id);else this.selectionExpanded.delete(manifest.id);if(details.open&&!details.dataset.loaded){details.dataset.loaded='true';for(const member of members)details.append(this.selectionRow(member));}};row.append(details);}
    else{
      const details=this.element('details'),summary=this.element('summary',this.text('Сведения','Details'));details.append(summary,this.element('small',manifest.id+' · '+manifest.license));
      const deps=Object.keys(manifest.dependencies||{});if(deps.length)details.append(this.element('p',this.text('Зависимости: ','Dependencies: ')+deps.map(id=>this.local(this.catalog.find(m=>m.id===id)?.name)||id).join(', ')));row.append(details);
      if(manifest.nativePack){const runtime=this.host.toolState.packs.find(p=>p.id===manifest.nativePack);row.append(this.element('small',runtime?.installed?this.text('Файлы инструмента скачаны','Tool files downloaded'):this.text('Загрузка при применении: ','Download on apply: ')+((runtime?.bytes||0)/1e6).toFixed(1)+' MB'));if(runtime?.installed)row.append(this.button(this.text('Удалить файлы','Remove files'),()=>this.queue(()=>this.host.removeRuntime(manifest.nativePack)),{className:'addon-small-action'}));}
      if(source!=='builtin')row.append(this.button(this.text('Удалить пакет','Uninstall package'),()=>this.remove(manifest.id,manifest.version),{className:'addon-small-action'}));
    }
    return row;
  },
  renderSelection(dialog,scroll){
    if(!this.selectionDraft)this.beginSelection();dialog.classList.add('addon-composer');
    let change;try{change=StudioAddonSelection.changes(this.catalog,this.profile,this.selectionDraft);this.selectionResolved=change.resolved;this.selectionActiveResolved=change.previous;}catch(error){this.selectionError=error.message;this.selectionResolved=[];this.selectionActiveResolved=[];dialog.append(this.element('p',this.selectionError,'addon-errors'),this.button(this.text('Сбросить профиль','Reset profile'),async()=>{await this.apply([],false);this.beginSelection();}));return;}
    this.selectionRequiredBy=new Map();const resolvedById=new Map(this.selectionResolved.map(m=>[m.id,m]));for(const root of this.selectionDraft){const rootId=typeof root==='string'?root:root.id,visited=new Set(),visit=id=>{if(visited.has(id))return;visited.add(id);if(id!==rootId){const list=this.selectionRequiredBy.get(id)||[];list.push(root);this.selectionRequiredBy.set(id,list);}for(const dep of Object.keys(resolvedById.get(id)?.dependencies||{}))visit(dep);};visit(rootId);}
    const tabs=this.element('div',undefined,'addon-toolbar');for(const [id,ru,en]of [['packs','Паки','Workloads'],['installed','Компоненты','Individual components'],['tools','Инструменты','Tools'],['catalog','Каталог пакетов','Package catalog']]){const b=this.button(this.text(ru,en),()=>{this.tab=id;});b.setAttribute('aria-pressed',String(this.tab===id));tabs.append(b);}tabs.append(this.button(this.text('Из файла…','From file…'),()=>native('addonImport')),this.button(this.text('По ссылке…','From URL…'),()=>this.openAddonUrl()));dialog.append(tabs);
    const presets=this.element('div',undefined,'addon-toolbar');for(const preset of this.host.compositions)presets.append(this.button(this.local(preset.name),()=>{this.selectionDraft=structuredClone(preset.requested);this.selectionError='';}));presets.append(this.button(this.text('Сохранить текущий состав…','Export current composition…'),()=>this.exportComposition()));dialog.append(presets);
    const layout=this.element('div',undefined,'addon-composer-layout'),main=this.element('div',undefined,'addon-composer-main'),aside=this.element('aside',undefined,'addon-selection-summary');layout.append(main,aside);dialog.append(layout);
    const filters=this.element('div',undefined,'addon-selection-filters'),search=this.element('input');search.type='search';search.placeholder=this.text('Найти аддон, возможность или инструмент','Find addon, feature or tool');search.ariaLabel=search.placeholder;search.value=this.search;search.disabled=!!this.operationBusy;filters.append(search);
    const selectedLabel=this.element('label'),selected=this.element('input');selected.type='checkbox';selected.checked=!!this.selectedOnly;selectedLabel.append(selected,document.createTextNode(this.text('Только выбранные','Selected only')));filters.append(selectedLabel);main.append(filters);
    const list=this.element('div',undefined,this.tab==='packs'?'addon-workloads':'addon-components');main.append(list);
    const entries=this.tab==='catalog'?this.available.map(pkg=>({manifest:pkg.manifest,package:pkg,source:'catalog'})):[...this.builtinCatalog.map(manifest=>({manifest,source:'builtin'})),...this.library.packages.map(entry=>({manifest:entry.package.manifest,source:entry.source}))];
    const filtered=entries.filter(e=>this.tab==='catalog'||(this.tab==='packs'?e.manifest.kind==='pack':this.tab==='tools'?!!e.manifest.nativePack:e.manifest.kind!=='pack'&&!e.manifest.nativePack));
    if(this.tab==='catalog')main.append(this.element('p',this.text('Официальные пакеты из этой сборки доступны без сети. Онлайн-маркетплейс ещё не подключён.','Official packages bundled with this build work offline. An online marketplace is not connected yet.')));
    for(const entry of filtered){if(this.catalog.some(m=>m.id===entry.manifest.id&&m.version===entry.manifest.version))list.append(this.selectionRow(entry.manifest,{pack:entry.manifest.kind==='pack',source:entry.source}));else{const row=this.element('article',undefined,'addon-component');row.dataset.search=(this.local(entry.manifest.name)+' '+entry.manifest.id).toLowerCase();row.dataset.selected='false';row.append(this.element('strong',this.local(entry.manifest.name)),this.element('p',this.local(entry.manifest.description)),this.button(this.text('Установить пакет…','Install package…'),()=>this.review(entry.package,true)));list.append(row);}}
    const empty=this.element('p',this.text('Ничего не найдено','No matches'));main.append(empty);
    const filter=()=>{this.search=search.value;this.selectedOnly=selected.checked;let count=0;for(const row of list.children){row.hidden=!row.dataset.search.includes(this.search.toLowerCase())||this.selectedOnly&&row.dataset.selected!=='true';if(!row.hidden)count++;}empty.hidden=count>0;};search.oninput=filter;selected.onchange=filter;filter();
    aside.append(this.element('h3',this.text('Выбранный состав','Selected composition')),this.element('p',this.text('Компонентов: ','Components: ')+this.selectionResolved.filter(m=>m.kind!=='pack').length));
    const missing=this.host.missing(this.selectionResolved),bytes=missing.reduce((n,p)=>n+p.bytes,0);aside.append(this.element('p',this.text('Скачать: ','Download: ')+(bytes/1e6).toFixed(1)+' MB'));
    if(change){for(const [key,ru,en]of [['added','Будут включены','Will enable'],['removed','Будут отключены','Will disable']]){const components=change[key].filter(m=>m.kind!=='pack'),details=this.element('details');details.open=components.length>0;details.append(this.element('summary',this.text(ru,en)+' · '+components.length));for(const m of components)details.append(this.element('p',this.local(m.name)));aside.append(details);}
      const changedPacks=this.catalog.filter(m=>m.kind==='pack').map(manifest=>({manifest,before:StudioAddonSelection.state(this.catalog,this.profile,manifest,this.selectionActiveResolved,this.selectionMembers(manifest)),after:this.selectionStatus(manifest)})).filter(p=>p.before.count!==p.after.count||p.before.checked!==p.after.checked);
      if(changedPacks.length){const details=this.element('details');details.open=true;details.append(this.element('summary',this.text('Изменится состав паков','Workload composition changes')));for(const p of changedPacks)details.append(this.element('p',this.local(p.manifest.name)+' · '+p.after.count+'/'+p.after.total));aside.append(details);}
    }
    aside.append(this.element('p',this.text('Галочки меняют план. Загрузка и включение начнутся после «Применить». Отключение функции сохраняет скачанные файлы инструментов.','Checkboxes change the plan. Downloads and activation start after Apply. Disabling a feature retains downloaded tool files.')));
    if(this.selectionError)aside.append(this.element('p',this.selectionError,'addon-errors'));
    const progress=this.element('p');progress.dataset.packProgress='';progress.setAttribute('aria-live','polite');if(this.operationBusy)progress.textContent=this.text('Применение состава…','Applying composition…');aside.append(progress);
    const changed=!!change&&(change.added.length>0||change.removed.length>0||this.safeMode);aside.append(this.button(this.text('Применить','Apply'),async()=>{try{await this.applySelection();}catch(error){this.selectionError=error.message;}},{className:'primary',id:'addonApplySelection',disabled:!changed||!change}),this.button(this.text('Отменить изменения','Discard changes'),()=>this.beginSelection(),{id:'addonDiscardSelection',disabled:!changed}));
    if(this.operationBusy)aside.append(this.button(this.text('Отменить загрузку','Cancel download'),()=>this.cancelDownload(),{allowDuringBusy:true}));
    if(this.host.needsReload)aside.append(this.button(this.text('Перезапустить интерфейс','Restart UI'),()=>this.host.reload()));
    const recovery=this.element('details');recovery.append(this.element('summary',this.text('Восстановление','Recovery')),this.button(this.safeMode?this.text('Восстановить профиль','Restore profile'):this.text('Режим восстановления','Recovery mode'),()=>this.apply(this.profile,!this.safeMode)));aside.append(recovery);
    if(this.errors.length)dialog.append(this.element('p',this.errors.slice(-3).map(e=>e.message).join('\n'),'addon-errors'));dialog.scrollTop=scroll;
  }
});
