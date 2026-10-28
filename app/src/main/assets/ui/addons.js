'use strict';
// The host executes reviewed factories and interprets validated data packages.
// Manifests and contributions are data; no third-party eval/import/bridge access.
class StudioAddons {
  constructor(app){
    this.app=app;this.errors=[];this.loading=true;this.tab='installed';this.search='';this.available=[];this.library={packages:[]};this.operations=Promise.resolve();this.style=document.createElement('style');this.style.dataset.studioAddons='';document.head.append(this.style);
    this.builtinCatalog=[
      {schemaVersion:1,id:'studio.navigation',version:'1.0.0',api:{min:'0.1.0',maxExclusive:'0.2.0'},name:{ru:'Быстрая навигация',en:'Quick navigation'},description:{ru:'Команды фокусировки редактора и сброса масштаба в палитре.',en:'Editor focus and reset zoom commands in the palette.'},license:'MIT',capabilities:['ui.commands'],dependencies:{},conflicts:{}},
      {schemaVersion:1,id:'studio.contrast',version:'1.0.0',api:{min:'0.1.0',maxExclusive:'0.2.0'},name:{ru:'Контрастные границы',en:'Contrast borders'},description:{ru:'Более заметные границы и второстепенные надписи. Отключение возвращает тему.',en:'More visible borders and secondary text. Disabling restores the theme.'},license:'MIT',capabilities:['ui.theme'],dependencies:{},conflicts:{}}
    ];
    this.builtinFactories=new Map([
      ['studio.navigation@1.0.0',ctx=>{ctx.contribute('commands','studio.navigation/focus',{label:{ru:'Фокус в редактор',en:'Focus editor'},action:'editor.focus'});ctx.contribute('commands','studio.navigation/zoom',{label:{ru:'Сбросить масштаб кода',en:'Reset code zoom'},action:'editor.resetZoom'});}],
      ['studio.contrast@1.0.0',ctx=>ctx.contribute('themes','studio.contrast/borders',{dark:{'--line':'#697386','--muted':'#abb5c8'},light:{'--line':'#8793a7','--muted':'#4e5b70'}})]
    ]);
    this.registry=new StudioAddonCore.Registry({commands:'ui.commands',themes:'ui.theme'},()=>this.refreshContributions());
    this.manager=new StudioAddonCore.Manager({catalog:this.builtinCatalog,factories:new Map(this.builtinFactories),registry:this.registry,report:(error,id)=>{this.errors.push({id,message:String(error.message||error),time:Date.now()});this.errors=this.errors.slice(-20);console.error('Addon',id,error);}});
    this.profile=[];this.safeMode=false;
    onNative('addonImported',event=>this.review(event.text,false));
    this.ready=this.load().catch(error=>{this.safeMode=true;this.errors.push({message:String(error.message||error)});this.app.toast(this.text('Аддоны отключены: ','Addons disabled: ')+error.message);}).finally(()=>{this.loading=false;this.render();});
  }
  text(ru,en){return this.app.settings.language==='en'?en:ru;}
  local(value){return typeof value==='string'?value:value?.[this.app.settings.language]||value?.en||'';}
  async load(){
    const [library,available]=await Promise.all([native('addonLibrary'),native('addonCatalog')]);this.available=available.map(StudioAddonPackages.parse);this.adopt(library);const saved=library.profile;this.profile=Array.isArray(saved.requested)?saved.requested:[];
    if(library.recovered)this.errors.push({message:this.text('Незавершённая установка или повреждённый снимок восстановлены из предыдущего состояния.','An interrupted install or damaged snapshot was restored from the previous state.')});
    return this.apply(this.profile,!!saved.safeMode||!!saved.activating);
  }
  adopt(library){
    const manifests=[...this.builtinCatalog],factories=new Map(this.builtinFactories);for(const entry of library.packages){const pkg=StudioAddonPackages.parse(entry.package);manifests.push(pkg.manifest);factories.set(pkg.manifest.id+'@'+pkg.manifest.version,StudioAddonPackages.factory(pkg));}
    this.library=library;this.catalog=manifests;this.manager.catalog=manifests;this.manager.factories=factories;
  }
  pin(requested,safeMode=false){if(safeMode)return requested;const selected=new Map(StudioAddonCore.resolve(this.catalog,requested).map(m=>[m.id,m.version]));return requested.map(r=>{const id=typeof r==='string'?r:r.id;return {id,version:selected.get(id)};});}
  queue(work){const operation=this.operations.then(work);this.operations=operation.catch(()=>{});return operation;}
  apply(requested,safeMode=false){return this.queue(()=>this.applyNow(requested,safeMode));}
  async applyNow(requested,safeMode=false){
    requested=this.pin(requested,safeMode);await native('addonStateCommit',{schemaVersion:1,requested,safeMode,activating:true});try{const result=await this.manager.setProfile(requested,{safeMode});this.profile=result.requested;this.safeMode=result.safeMode;return result;}finally{await native('addonStateCommit',{schemaVersion:1,requested:this.profile,safeMode:this.safeMode,activating:false});this.render();}
  }
  refreshContributions(){
    const rules=[];for(const entry of this.registry.list('themes'))for(const [mode,values]of Object.entries(entry.value)){if(!['dark','light'].includes(mode))continue;const declarations=Object.entries(values).filter(([key,value])=>StudioAddonPackages.COLORS.includes(key)&&/^#[a-f0-9]{6}([a-f0-9]{2})?$/i.test(value)).map(([key,value])=>key+':'+value).join(';');rules.push((mode==='light'?'body.light':'body:not(.light)')+'{'+declarations+'}');}this.style.textContent=rules.join('\n');if(this.app.commands)this.app.registerCommands();
  }
  commands(){return this.registry.list('commands').map(entry=>({label:this.local(entry.value.label),run:async()=>{try{switch(entry.value.action){case 'editor.focus':await this.app.editor.focus();break;case 'editor.resetZoom':this.app.setCodeScale(100);break;case 'ui.settings':this.app.openSettings();break;case 'ui.focusMode':this.app.toggleFocusMode();break;default:throw Error('Unknown addon action');}}catch(error){safeError(error);}}}));}
  toggle(id,version){return this.ready.then(()=>this.queue(()=>{const direct=this.profile.some(r=>(typeof r==='string'?r:r.id)===id),active=this.manager.active.get(id)?.manifest.version,current=this.profile.filter(r=>(typeof r==='string'?r:r.id)!==id);if(!direct||active!==version)current.push({id,version});return this.applyNow(current,false);}));}
  async transact(request){
    const previous=await native('addonLibrary');let token;
    try{const staged=await native('addonBegin',{...request,revision:previous.revision});token=staged.token;this.adopt(staged.library);await this.applyNow(request.profile.requested,request.profile.safeMode);this.library=await native('addonFinish',{token,commit:true});}
    catch(error){let restored=previous;if(token)try{restored=await native('addonFinish',{token,commit:false});}catch(rollback){this.errors.push({message:this.text('Не удалось записать откат; следующий запуск восстановит журнал. ','Rollback could not be saved; the next launch will recover the journal. ')+rollback.message});}this.adopt(restored);await this.applyNow(previous.profile.requested,previous.profile.safeMode).catch(recovery=>this.errors.push({message:recovery.message}));throw error;}
  }
  installPlan(pkg,enable=true){return StudioAddonPackages.plan({builtins:this.builtinCatalog,installed:this.library.packages,available:this.available,candidate:pkg,profile:this.profile,enable,safeMode:this.safeMode});}
  install(pkg,enable=true){return this.ready.then(()=>this.queue(async()=>{
    this.library=await native('addonLibrary');pkg=StudioAddonPackages.parse(pkg);const plan=this.installPlan(pkg,enable),official=new Set(this.available.map(p=>p.manifest.id+'@'+p.manifest.version));
    const install=plan.packages.map(p=>{const key=p.manifest.id+'@'+p.manifest.version;return official.has(key)?{official:key}:{package:p};});
    // Include an existing candidate to detect attempts to change immutable version content.
    if(!plan.packages.some(p=>p.manifest.id===pkg.manifest.id&&p.manifest.version===pkg.manifest.version))install.push(official.has(pkg.manifest.id+'@'+pkg.manifest.version)?{official:pkg.manifest.id+'@'+pkg.manifest.version}:{package:pkg});
    await this.transact({install,profile:{schemaVersion:1,requested:plan.requested,safeMode:plan.safeMode,activating:false}});this.pendingReview=null;this.tab='installed';this.render();
  }));}
  remove(id,version){return this.ready.then(()=>this.queue(async()=>{
    this.library=await native('addonLibrary');const active=this.manager.active.get(id)?.manifest.version,requested=this.profile.filter(r=>!((typeof r==='string'?r:r.id)===id&&(active===version||!active&&(typeof r==='string'||r.version===version))));
    const catalog=this.catalog.filter(m=>!(m.id===id&&m.version===version));StudioAddonCore.resolve(catalog,requested);
    await this.transact({remove:id+'@'+version,profile:{schemaVersion:1,requested,safeMode:this.safeMode,activating:false}});this.render();
  }));}
  review(input,official){try{const pkg=StudioAddonPackages.parse(input);if(!official&&pkg.manifest.id.startsWith('studio.'))throw Error(this.text('Пространство studio зарезервировано для встроенного каталога.','The studio namespace is reserved for the bundled catalog.'));this.pendingReview={pkg,official,enable:true};this.open();}catch(error){this.errors.push({message:error.message});this.open();}}
  open(){let dialog=document.querySelector('#addonsDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='addonsDialog';dialog.className='addons-dialog';document.body.append(dialog);}this.render();if(!dialog.open)dialog.showModal();}
  element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
  button(label,action,attrs={}){const button=this.element('button',label);Object.assign(button,attrs);button.onclick=async()=>{button.disabled=true;try{await action();}catch(error){this.errors.push({message:error.message});safeError(error);}finally{this.render();}};return button;}
  render(){
    const dialog=document.querySelector('#addonsDialog');if(!dialog)return;const scroll=dialog.scrollTop;dialog.replaceChildren();const heading=this.element('div',undefined,'dialog-heading'),title=this.element('h2',this.text('Аддоны','Addons')),close=this.button('',()=>dialog.close(),{className:'close-button',ariaLabel:this.text('Закрыть','Close')});close.dataset.icon='x';heading.append(title,close);dialog.append(heading);
    const note=this.element('p',this.text('Темы и команды из пакетов данных. Скрипты и нативный код не загружаются.','Themes and commands from data packages. Scripts and native code are not loaded.'));dialog.append(note);
    if(this.loading){dialog.append(this.element('p',this.text('Загрузка…','Loading…')));return;}
    if(this.pendingReview){this.renderReview(dialog);return;}
    const tools=this.element('div',undefined,'addon-toolbar');for(const [tab,label]of [['installed',this.text('Установленные','Installed')],['catalog',this.text('Каталог','Catalog')]]){const button=this.button(label,()=>{this.tab=tab;});button.setAttribute('aria-pressed',String(this.tab===tab));tools.append(button);}tools.append(this.button(this.text('Из файла…','From file…'),()=>native('addonImport')));dialog.append(tools);
    if(this.tab==='installed'){const safe=this.button(this.safeMode?this.text('Восстановить профиль','Restore profile'):this.text('Режим восстановления','Recovery mode'),()=>this.apply(this.profile,!this.safeMode));safe.dataset.addonSafe='';dialog.append(safe);if(this.safeMode||this.errors.length)dialog.append(this.button(this.text('Сбросить профиль','Reset profile'),()=>this.apply([],false)));}else dialog.append(this.element('p',this.text('Официальные примеры из этой сборки; доступны без сети. Удалённый маркетплейс появится позже.','Official examples shipped with this build; available offline. An online marketplace will follow.')));
    const search=this.element('input');search.type='search';search.placeholder=this.text('Поиск по имени или ID','Search name or ID');search.ariaLabel=search.placeholder;search.value=this.search;dialog.append(search);const list=this.element('div');dialog.append(list);
    const entries=this.tab==='installed'?[...this.builtinCatalog.map(manifest=>({package:{manifest},source:'builtin'})),...this.library.packages]:this.available.map(pkg=>({package:pkg,source:'catalog'}));
    for(const entry of entries){const m=entry.package.manifest,row=this.element('div',undefined,'addon-row');row.dataset.addon=m.id;row.dataset.version=m.version;row.dataset.search=(this.local(m.name)+' '+m.id+' '+this.local(m.description)).toLowerCase();const info=this.element('div'),name=this.element('strong',this.local(m.name)+' · '+m.version),detail=this.element('p',this.local(m.description)),meta=this.element('small',m.id+' · '+m.license+' · '+this.text(entry.source==='local'?'Локальный пакет':'Официальный',entry.source==='local'?'Local package':'Official'));info.append(name,detail,meta);row.append(info);const actions=this.element('div',undefined,'addon-actions');
      const active=this.manager.active.get(m.id)?.manifest.version===m.version,direct=this.profile.some(r=>(typeof r==='string'?r:r.id)===m.id),installed=this.catalog.some(v=>v.id===m.id&&v.version===m.version);
      if(this.tab==='catalog'){actions.append(this.button(installed?this.text('Установлен','Installed'):this.text('Установить…','Install…'),()=>this.review(entry.package,true),{disabled:installed}));}
      else{const toggle=this.button(active?this.text(direct?'Отключить':'Зависимость',direct?'Disable':'Dependency'):this.text('Включить','Enable'),()=>this.toggle(m.id,m.version),{disabled:active&&!direct});toggle.setAttribute('aria-pressed',String(active));actions.append(toggle);if(entry.source!=='builtin')actions.append(this.button(this.text('Удалить','Remove'),()=>this.remove(m.id,m.version),{title:this.text('Удалить эту версию. Используемые зависимости защищены.','Remove this version. Required dependencies are protected.')}));}
      row.append(actions);list.append(row);
    }
    const filter=()=>{this.search=search.value;for(const row of list.children)row.hidden=!row.dataset.search.includes(this.search.toLowerCase());};search.oninput=filter;filter();
    if(!list.children.length)list.append(this.element('p',this.text('Нет установленных пакетов.','No installed packages.')));
    if(this.errors.length)dialog.append(this.element('p',this.errors.slice(-5).map(e=>(e.id?e.id+': ':'')+e.message).join('\n'),'addon-errors'));dialog.scrollTop=scroll;
  }
  renderReview(dialog){
    const pending=this.pendingReview,pkg=pending.pkg,m=pkg.manifest;dialog.append(this.element('h3',this.local(m.name)+' · '+m.version));dialog.append(this.element('p',this.local(m.description)));dialog.append(this.element('p',this.text('Автор: ','Author: ')+(m.author||this.text('не указан','unspecified'))+' · '+m.license));dialog.append(this.element('p',pending.official?this.text('Источник: встроенный официальный каталог.','Source: bundled official catalog.'):this.text('Источник: локальный файл. Имя автора не проверено.','Source: local file. Author identity is unverified.')));
    const label=this.element('label',undefined,'addon-enable'),checkbox=this.element('input');checkbox.type='checkbox';checkbox.checked=pending.enable;checkbox.onchange=()=>{pending.enable=checkbox.checked;this.render();};label.append(checkbox,document.createTextNode(this.text('Включить после установки','Enable after installation')));dialog.append(label);let plan,error;try{plan=this.installPlan(pkg,pending.enable);}catch(e){error=e.message;}
    if(plan){for(const p of plan.packages){const caps=p.manifest.capabilities.map(c=>c==='ui.theme'?this.text('цвета интерфейса','interface colors'):this.text('команды интерфейса','interface commands'));dialog.append(this.element('p',p.manifest.id+' '+p.manifest.version+' — '+caps.join(', ')));}if(!plan.packages.length)dialog.append(this.element('p',this.text('Эта версия уже установлена.','This version is already installed.')));}else dialog.append(this.element('p',error,'addon-errors'));
    const buttons=this.element('div',undefined,'dialog-buttons');buttons.append(this.button(this.text('Отмена','Cancel'),()=>{this.pendingReview=null;}),this.button(this.text('Установить','Install'),()=>this.install(pkg,pending.enable),{disabled:!!error,className:'primary'}));dialog.append(buttons);
  }
}
