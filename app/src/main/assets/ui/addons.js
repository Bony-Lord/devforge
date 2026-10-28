'use strict';
// Only these bundled, reviewed factories are executable in SDK preview 1.
// Manifests and contributions are data; no third-party eval/import/bridge access.
class StudioAddons {
  constructor(app){
    this.app=app;this.errors=[];this.operations=Promise.resolve();this.style=document.createElement('style');this.style.dataset.studioAddons='';document.head.append(this.style);
    this.catalog=[
      {schemaVersion:1,id:'studio.navigation',version:'1.0.0',api:{min:'0.1.0',maxExclusive:'0.2.0'},name:{ru:'Быстрая навигация',en:'Quick navigation'},description:{ru:'Команды фокусировки редактора и сброса масштаба в палитре.',en:'Editor focus and reset zoom commands in the palette.'},license:'MIT',capabilities:['ui.commands'],dependencies:{},conflicts:{}},
      {schemaVersion:1,id:'studio.contrast',version:'1.0.0',api:{min:'0.1.0',maxExclusive:'0.2.0'},name:{ru:'Контрастные границы',en:'Contrast borders'},description:{ru:'Более заметные границы и второстепенные надписи. Отключение возвращает тему.',en:'More visible borders and secondary text. Disabling restores the theme.'},license:'MIT',capabilities:['ui.theme'],dependencies:{},conflicts:{}}
    ];
    const factories=new Map([
      ['studio.navigation@1.0.0',ctx=>{ctx.contribute('commands','studio.navigation/focus',{label:{ru:'Фокус в редактор',en:'Focus editor'},action:'editor.focus'});ctx.contribute('commands','studio.navigation/zoom',{label:{ru:'Сбросить масштаб кода',en:'Reset code zoom'},action:'editor.resetZoom'});}],
      ['studio.contrast@1.0.0',ctx=>ctx.contribute('themes','studio.contrast/borders',{dark:{'--line':'#697386','--muted':'#abb5c8'},light:{'--line':'#8793a7','--muted':'#4e5b70'}})]
    ]);
    this.registry=new StudioAddonCore.Registry({commands:'ui.commands',themes:'ui.theme'},()=>this.refreshContributions());
    this.manager=new StudioAddonCore.Manager({catalog:this.catalog,factories,registry:this.registry,report:(error,id)=>{this.errors.push({id,message:String(error.message||error),time:Date.now()});this.errors=this.errors.slice(-20);console.error('Addon',id,error);}});
    this.profile=[];this.safeMode=false;
    this.ready=this.load().catch(error=>{this.safeMode=true;this.errors.push({message:String(error.message||error)});this.app.toast(this.text('Аддоны отключены: ','Addons disabled: ')+error.message);});
  }
  text(ru,en){return this.app.settings.language==='en'?en:ru;}
  local(value){return typeof value==='string'?value:value?.[this.app.settings.language]||value?.en||'';}
  async load(){const saved=await native('addonState');this.profile=Array.isArray(saved.requested)?saved.requested:[];return this.apply(this.profile,!!saved.safeMode||!!saved.activating);}
  queue(work){const operation=this.operations.then(work);this.operations=operation.catch(()=>{});return operation;}
  apply(requested,safeMode=false){return this.queue(()=>this.applyNow(requested,safeMode));}
  async applyNow(requested,safeMode=false){
    await native('addonStateCommit',{schemaVersion:1,requested,safeMode,activating:true});try{const result=await this.manager.setProfile(requested,{safeMode});this.profile=result.requested;this.safeMode=result.safeMode;return result;}finally{await native('addonStateCommit',{schemaVersion:1,requested:this.profile,safeMode:this.safeMode,activating:false});this.render();}
  }
  refreshContributions(){
    const rules=[];for(const entry of this.registry.list('themes'))for(const [mode,values]of Object.entries(entry.value)){if(!['dark','light'].includes(mode))continue;const declarations=Object.entries(values).filter(([key,value])=>['--line','--muted','--accent'].includes(key)&&/^#[a-f0-9]{6}$/i.test(value)).map(([key,value])=>key+':'+value).join(';');rules.push((mode==='light'?'body.light':'body:not(.light)')+'{'+declarations+'}');}this.style.textContent=rules.join('\n');if(this.app.commands)this.app.registerCommands();
  }
  commands(){return this.registry.list('commands').map(entry=>({label:this.local(entry.value.label),run:async()=>{try{switch(entry.value.action){case 'editor.focus':await this.app.editor.focus();break;case 'editor.resetZoom':this.app.setCodeScale(100);break;default:throw Error('Unknown addon action');}}catch(error){safeError(error);}}}));}
  toggle(id){return this.ready.then(()=>this.queue(()=>{const current=this.profile.filter(value=>(typeof value==='string'?value:value.id)!==id);if(current.length===this.profile.length)current.push(id);return this.applyNow(current,false);}));}
  open(){
    let dialog=document.querySelector('#addonsDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='addonsDialog';dialog.className='addons-dialog';document.body.append(dialog);}this.render();if(!dialog.open)dialog.showModal();
  }
  render(){
    const dialog=document.querySelector('#addonsDialog');if(!dialog)return;dialog.replaceChildren();const heading=document.createElement('div');heading.className='dialog-heading';const title=document.createElement('h2');title.textContent=this.text('Аддоны · SDK preview','Addons · SDK preview');const close=document.createElement('button');close.className='close-button';close.dataset.icon='x';close.ariaLabel=this.text('Закрыть','Close');close.onclick=()=>dialog.close();heading.append(title,close);dialog.append(heading);
    const note=document.createElement('p');note.textContent=this.text('Встроенные официальные примеры. Установка сторонних пакетов и маркетплейс будут добавлены отдельно.','Bundled official examples. Third-party packages and the marketplace will follow.');dialog.append(note);
    const safe=document.createElement('button');safe.dataset.addonSafe='';safe.textContent=this.safeMode?this.text('Восстановить профиль','Restore profile'):this.text('Режим восстановления: отключить всё','Recovery mode: disable all');safe.onclick=()=>this.apply(this.profile,!this.safeMode).catch(safeError);dialog.append(safe);
    const active=new Set(this.manager.status().active.map(e=>e.id));for(const m of this.catalog){const row=document.createElement('div');row.className='addon-row';row.dataset.addon=m.id;const info=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('p'),meta=document.createElement('small');name.textContent=this.local(m.name)+' · '+m.version;detail.textContent=this.local(m.description);meta.textContent=m.id+' · '+m.license+' · '+m.capabilities.join(', ');info.append(name,detail,meta);const button=document.createElement('button');button.textContent=active.has(m.id)?this.text('Отключить','Disable'):this.text('Включить','Enable');button.setAttribute('aria-pressed',String(active.has(m.id)));button.onclick=async()=>{button.disabled=true;try{await this.toggle(m.id);}catch(error){safeError(error);}finally{this.render();}};row.append(info,button);dialog.append(row);}
    if(this.errors.length){const errors=document.createElement('p');errors.className='addon-errors';errors.textContent=this.errors.map(e=>(e.id?e.id+': ':'')+e.message).join('\n');dialog.append(errors);}
  }
}
