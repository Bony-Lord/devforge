'use strict';
const setupMethods={
  setupText(ru,en){return (this.setupDraft?.values.language||this.settings.language)==='ru'?ru:en;},
  setupLocal(value){return typeof value==='string'?value:value?.[this.setupDraft?.values.language||this.settings.language]||value?.en||'';},
  async maybeSetup(){if(this.state.capabilities.toolDelivery==='engine-and-packs'&&this.settings.runtimeDeliveryVersion!==2){if(this.settings.setupComplete||this.settings.setupDismissed)this.settings.setupDraft=StudioSetupModel.initial({profile:this.addons.baseProfile,settings:this.settings,presets:this.addons.host.compositions});this.settings.runtimeDeliveryVersion=2;await native('settingsCommit',this.settings);}if(StudioSetupModel.required(this.settings))await this.openSetup();},
  setupPlan(){return StudioSetupModel.plan(this.addons.catalog,this.setupDraft.requested,this.addons.host.toolState.packs,this.addons.host.definitions);},
  async openSetup(){
    if(this.setupInstalling)return;this.setupOpen=true;await NativeEditing.layout();await this.addons.ready;document.querySelector('#settingsDialog').close();this.addons.host.toolState=await native('toolPacks');
    this.setupDraft=StudioSetupModel.initial({saved:this.settings.setupDraft,profile:this.addons.profile,settings:this.settings,presets:this.addons.host.compositions});this.setupStep=this.setupDraft.step;this.setupError='';
    let dialog=document.querySelector('#setupDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='setupDialog';dialog.className='setup-dialog';dialog.dataset.noI18n='';document.body.append(dialog);dialog.addEventListener('close',()=>{if(this.setupOpen){if(this.setupInstalling)dialog.showModal();else this.skipSetup().catch(safeError);}});dialog.addEventListener('cancel',e=>{e.preventDefault();this.skipSetup().catch(safeError);});}
    this.renderSetup();if(!dialog.open)dialog.showModal();await NativeEditing.layout();
  },
  async saveSetupDraft(){
    clearTimeout(this.setupSaveTimer);this.setupDraft.step=this.setupStep;this.settings.setupDraft=structuredClone(this.setupDraft);const payload=structuredClone(this.settings);
    this.setupSaveQueue=(this.setupSaveQueue||Promise.resolve()).catch(()=>{}).then(()=>native('settingsCommit',payload));await this.setupSaveQueue;
  },
  scheduleSetupSave(){if(!this.setupOpen||!document.querySelector('#setupDialog')?.open)return;clearTimeout(this.setupSaveTimer);this.setupSaveTimer=setTimeout(()=>{if(this.setupOpen&&document.querySelector('#setupDialog')?.open)this.saveSetupDraft().catch(error=>this.setupShowError(error));},350);},
  setupCoreFields(){return [{key:'uiScale',type:'choice',default:100,label:{ru:'Масштаб интерфейса',en:'Interface scale'},options:[80,90,100,110,125,150]},{key:'keepAwake',type:'toggle',default:false,label:{ru:'Не гасить экран в приложении',en:'Keep the screen awake in the app'}}];},
  captureSetup(){for(const input of document.querySelectorAll('#setupDialog [data-setup]')){const field=this.setupFields?.get(input.dataset.setup);if(field)this.setupDraft.values[field.key]=StudioSetupModel.value(field,input.type==='checkbox'?input.checked:input.value);}},
  setupButton(text,action,attributes={}){const b=document.createElement('button');b.type='button';b.textContent=text;const {allowDuringInstall,...attrs}=attributes;Object.assign(b,attrs);b.disabled=!!b.disabled||!!this.setupInstalling&&!allowDuringInstall;b.onclick=async()=>{try{await action();}catch(error){this.setupShowError(error);}};return b;},
  setupElement(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;},
  setupShowError(error){this.setupError=error?.message||String(error||'');const node=document.querySelector('#setupError');if(node){node.textContent=this.setupError;node.hidden=!this.setupError;}},
  setupRemember(details,id){details.open=this.setupDraft.view.expanded.includes(id);details.ontoggle=()=>{if(!details.isConnected)return;const opened=new Set(this.setupDraft.view.expanded);if(details.open)opened.add(id);else opened.delete(id);this.setupDraft.view.expanded=[...opened];this.scheduleSetupSave();};},
  renderSetup(){
    const dialog=document.querySelector('#setupDialog');if(!dialog)return;dialog.dataset.dismissLocked=String(!!this.setupInstalling);dialog.replaceChildren();this.setupFields=new Map();this.setupPicker=null;const t=(ru,en)=>this.setupText(ru,en);
    const heading=this.setupElement('div',undefined,'dialog-heading'),title=this.setupElement('h2',[t('Настройка DevForge','Set up DevForge'),t('Настройки','Preferences'),t('Готово к установке','Ready to install')][this.setupStep]),close=this.setupButton('×',()=>this.skipSetup(),{className:'close-button',ariaLabel:t('Закрыть','Close')});close.dataset.icon='x';heading.append(title,close);dialog.append(heading,this.setupElement('p',t('Шаг ','Step ')+(this.setupStep+1)+' / 3','setup-step'));
    if(this.state.capabilities.toolDelivery==='engine-and-packs')dialog.append(this.setupElement('p',t('Android один раз установит общее нативное окружение. Выбранные паки инструментов загружаются в формате DevForge без отдельных системных подтверждений. Обновление самого окружения снова потребует подтверждения Android.','Android installs one shared native engine. Selected DevForge tool packs need no separate system confirmations. Updating the engine itself requires Android confirmation again.')));const body=this.setupElement('div');body.id='setupBody';dialog.append(body);let plan;try{plan=this.setupPlan();}catch(error){this.setupError=error.message;}
    if(this.setupStep===0&&plan)this.renderSetupSelection(body);
    if(this.setupStep===1&&plan)this.renderSetupFields(body,plan);
    if(this.setupStep===2&&plan)this.renderSetupReview(body,plan);
    const error=this.setupElement('p',this.setupError||'','addon-errors');error.id='setupError';error.hidden=!this.setupError;error.setAttribute('role','alert');dialog.append(error);
    const progress=this.setupElement('p');progress.id='setupProgress';progress.dataset.packProgress='';progress.setAttribute('aria-live','polite');progress.hidden=!this.setupInstalling;if(this.setupInstalling)progress.textContent=t('Подготовка состава…','Preparing composition…');dialog.append(progress);
    if(this.setupInstalling)dialog.append(this.setupButton(t('Отменить загрузку','Cancel download'),()=>this.addons.cancelDownload(),{id:'setupCancelInstall',allowDuringInstall:true}));
    const footer=this.setupElement('div',undefined,'setup-footer');footer.append(this.setupButton(this.settings.setupComplete?t('Отмена','Cancel'):t('Пропустить','Skip'),()=>this.skipSetup(),{id:'setupSkip'}),this.setupElement('span'));
    if(this.setupStep)footer.append(this.setupButton(t('Назад','Back'),async()=>{this.captureSetup();this.setupStep--;await this.saveSetupDraft();this.renderSetup();},{id:'setupBack'}));footer.append(this.setupButton(this.setupStep===2?t('Применить','Apply'):t('Далее','Next'),()=>this.advanceSetup(),{id:'setupNext',className:'primary',disabled:!plan}));dialog.append(footer);
  },
  renderSetupSelection(body){
    const t=(ru,en)=>this.setupText(ru,en),draft=this.setupDraft,label=this.setupElement('label',t('Язык','Language'),'setup-language-row'),language=document.createElement('select');language.ariaLabel=t('Язык интерфейса','Interface language');
    for(const[id,text]of [['ru','Русский'],['en','English']]){const option=this.setupElement('option',text);option.value=id;language.append(option);}language.value=draft.values.language;language.disabled=!!this.setupInstalling;language.onchange=async()=>{draft.values.language=language.value;this.settings.language=language.value;await this.saveSetupDraft();await this.persistSession(true);localStorage.setItem('gccStudioLanguage',language.value);location.reload();};label.append(language);body.append(label);
    const picker=new StudioComponentPicker({priority:this.addons.host.compositions.flatMap(p=>p.requested.map(r=>typeof r==='string'?r:r.id)),catalog:this.addons.catalog,tools:this.addons.host.toolState.packs,locale:draft.values.language,state:draft.view,disabled:this.setupInstalling,getRequested:()=>draft.requested,setRequested:requested=>{draft.requested=requested;draft.mode='custom';},onChange:()=>{this.setupShowError('');this.scheduleSetupSave();},onStateChange:()=>this.scheduleSetupSave(),onError:error=>this.setupShowError(error)});this.setupPicker=picker;picker.mount(body);
  },
  renderSetupFields(body,plan){
    const core=this.setupElement('div',undefined,'settings-grid');for(const field of this.setupCoreFields())this.renderSetupField(core,field);body.append(core);
    const groups=new Map();for(const field of plan.fields){if(!groups.has(field.owner))groups.set(field.owner,[]);groups.get(field.owner).push(field);}
    for(const[owner,fields]of groups){const details=this.setupElement('details',undefined,'setup-settings-group'),manifest=this.addons.catalog.find(m=>m.id===owner);details.append(this.setupElement('summary',this.setupLocal(manifest?.name)||owner));this.setupRemember(details,'settings:'+owner);const grid=this.setupElement('div',undefined,'settings-grid');for(const field of fields)this.renderSetupField(grid,field);details.append(grid);body.append(details);}
    body.append(this.setupElement('p',this.setupText('Можно оставить значения по умолчанию.','You can keep the defaults.'),'component-picker-note'));
  },
  renderSetupField(parent,field){
    this.setupFields.set(field.key,field);let value=this.setupDraft.values[field.key]??this.settings[field.key]??field.default;try{value=StudioSetupModel.value(field,value);}catch{value=field.default;}this.setupDraft.values[field.key]=value;
    const label=this.setupElement('label',this.setupLocal(field.label)),input=document.createElement(field.type==='choice'?'select':'input');input.dataset.setup=field.key;input.disabled=!!this.setupInstalling;
    if(field.type==='choice'){for(const item of field.options){const option=this.setupElement('option',this.setupLocal(typeof item==='object'?item.label:String(item)));option.value=typeof item==='object'?item.value:item;input.append(option);}input.value=value;}else if(field.type==='toggle'){input.type='checkbox';input.checked=value;label.className='check';}else{input.type=field.type==='number'?'number':'text';input.value=value;if(field.min!==undefined)input.min=field.min;if(field.max!==undefined)input.max=field.max;input.autocomplete='off';input.spellcheck=false;}
    input.onchange=()=>{try{this.setupDraft.values[field.key]=StudioSetupModel.value(field,input.type==='checkbox'?input.checked:input.value);this.scheduleSetupSave();}catch(error){this.setupShowError(error);}};label.append(input);parent.append(label);
  },
  renderSetupReview(body,plan){
    const t=(ru,en)=>this.setupText(ru,en);body.append(this.setupElement('p',t('Компонентов: ','Components: ')+plan.resolved.filter(m=>m.kind!=='pack').length),this.setupElement('p',t('Скачать: ','Download: ')+(plan.bytes/1e6).toFixed(1)+' MB'));
    if(plan.downloads.length){const list=this.setupElement('ul');for(const pack of plan.downloads)list.append(this.setupElement('li',this.setupLocal(plan.resolved.find(m=>m.nativePack===pack.id)?.name||pack.name)+' · '+(pack.bytes/1e6).toFixed(1)+' MB'));body.append(list);}else body.append(this.setupElement('p',t('Ничего скачивать не нужно.','Nothing to download.')));
    const details=this.setupElement('details');details.append(this.setupElement('summary',t('Весь состав','Full composition')));this.setupRemember(details,'review');for(const m of plan.resolved)details.append(this.setupElement('p',this.setupLocal(m.name)));body.append(details);
  },
  async skipSetup(){
    if(this.setupInstalling)return;clearTimeout(this.setupSaveTimer);await(this.setupSaveQueue||Promise.resolve()).catch(()=>{});delete this.settings.setupDraft;if(!this.settings.setupComplete)this.settings.setupDismissed=true;await native('settingsCommit',this.settings);this.setupOpen=false;document.querySelector('#setupDialog')?.close();await native('editorWebInput',{focused:false});await NativeEditing.layout();if(this.lsp.startDeferred)await this.lsp.start();
  },
  async advanceSetup(){
    if(this.setupInstalling)return;this.captureSetup();this.setupShowError('');if(this.setupStep<2){this.setupStep++;await this.saveSetupDraft();this.renderSetup();return;}
    const plan=this.setupPlan(),values={};for(const field of [...this.setupCoreFields(),...plan.fields])values[field.key]=StudioSetupModel.value(field,this.setupDraft.values[field.key]??this.settings[field.key]??field.default);values.language=this.setupDraft.values.language;
    await this.saveSetupDraft();this.setupInstalling=true;this.renderSetup();
    try{await this.addons.queue(async()=>{await this.addons.host.prepare(plan.resolved);await this.addons.applyNow(plan.requested,false);});await this.changeSettings(values);this.settings.setupComplete=true;this.settings.setupDismissed=false;this.settings.setupVersion=3;delete this.settings.setupDraft;await native('settingsCommit',this.settings);await this.persistSession(true);this.setupOpen=false;document.querySelector('#setupDialog').close();await native('editorWebInput',{focused:false});if(this.addons.host.needsReload||StudioI18n.locale!==values.language){location.reload();return;}await NativeEditing.layout();await this.lsp.start();this.toast(this.setupText('Состав применён','Composition applied'));}
    catch(error){this.setupError=error.message;this.addons.host.toolState=await native('toolPacks');await this.saveSetupDraft();}
    finally{this.setupInstalling=false;if(document.querySelector('#setupDialog')?.open)this.renderSetup();}
  }
};
