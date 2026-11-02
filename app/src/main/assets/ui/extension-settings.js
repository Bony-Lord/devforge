'use strict';
Object.assign(StudioAddons.prototype,{
 openExtensionSettings(id){
  const uri='devforge://extensions/studio.extension-settings/'+(id||'all'),previous=this.app.active?.path;
  StudioExtensionAPI.views.set(uri,{owner:'studio.extension-settings',title:this.text('Настройки дополнений','Extension settings'),render:container=>this.renderExtensionSettings(container,id,previous)});return this.app.openFile(uri);
 },
 renderExtensionSettings(container,selected,previous){
  const page=this.element('section',undefined,'extension-settings-page'),header=this.element('header'),back=this.button(this.text('← Назад','← Back'),()=>previous&&previous!==this.app.active?.path?this.app.openFile(previous):this.open()),heading=this.element('h2',this.text('Настройки дополнений','Extension settings')),select=this.element('select'),body=this.element('div',undefined,'extension-settings-body');
  select.ariaLabel=heading.textContent;header.append(back,heading);page.append(header,select,body);container.append(page);
  const fields=m=>Object.entries(m.configuration||{}).filter(([key])=>!StudioCodeOSS.api||key!=='devforge.providerPolicy');
  const available=()=>this.marketplaceEntries().filter(e=>this.manager.active.has(e.manifest.id)&&fields(e.manifest).length);
  let entries=available();
  const fill=value=>{select.replaceChildren(...entries.map(e=>{const option=this.element('option',this.local(e.manifest.name));option.value=e.manifest.id;return option;}));select.value=entries.some(e=>e.manifest.id===value)?value:entries[0]?.manifest.id||'';};fill(selected);
  const draw=()=>{
   body.replaceChildren();const entry=entries.find(e=>e.manifest.id===select.value);if(!entry){body.append(this.element('p',this.text('Нет включённых дополнений с настройками','No enabled extensions with settings')));return;}
   const id=entry.manifest.id,m=entry.manifest,form=this.element('form'),grid=this.element('div',undefined,'extension-settings-grid'),error=this.element('p',undefined,'inline-error'),inputs=new Map();form.append(grid,error);body.append(this.element('p',this.local(m.description)),form);
   for(const[key,field]of fields(m)){
    const label=this.element('label',undefined,'extension-setting-field'),title=this.element('span',key),description=this.element('span',field.description||field.markdownDescription||'','extension-setting-description'),stored=StudioCodeOSS.api&&m.vscode?StudioCodeOSS.api.vscode.workspace.getConfiguration().get(key,field.default):Object.hasOwn(this.app.settings.extensionSettings?.[id]||{},key)?this.app.settings.extensionSettings[id][key]:field.default;let input;
    if(Array.isArray(field.enum)){input=this.element('select');for(const value of field.enum){const option=this.element('option',String(value));option.value=JSON.stringify(value);input.append(option);}input.value=JSON.stringify(stored===undefined?field.enum[0]:stored);input.dataset.jsonEnum='';}
    else if(field.type==='boolean'){input=this.element('input');input.type='checkbox';input.checked=!!stored;label.classList.add('extension-setting-check');}
    else if(['integer','number'].includes(field.type)){input=this.element('input');input.type='number';input.step=field.type==='integer'?'1':'any';if(field.minimum!==undefined)input.min=field.minimum;if(field.maximum!==undefined)input.max=field.maximum;input.value=stored??'';}
    else if(['object','array'].includes(field.type)||Array.isArray(field.type)||field.anyOf||field.oneOf){input=this.element('textarea');input.value=JSON.stringify(stored===undefined?(field.type==='array'?[]:field.type==='object'?{}:null):stored,null,2);input.rows=5;input.dataset.jsonValue='';}
    else{input=this.element('input');input.type=field.writeOnly||field.format==='password'||/(?:apiKey|password|secret|accessToken)$/i.test(key)?'password':'text';input.value=stored??'';}
    input.name=key;input.ariaLabel=key;label.append(title,description,input);grid.append(label);inputs.set(key,input);
   }
   const actions=this.element('div',undefined,'dialog-buttons'),reset=this.element('button',this.text('Сбросить','Reset')),save=this.element('button',this.text('Применить','Apply'),'primary');reset.type='button';save.type='submit';actions.append(reset,save);form.append(actions);
   reset.onclick=async()=>{const extensionSettings=structuredClone(this.app.settings.extensionSettings||{});delete extensionSettings[id];await this.app.changeSettings({extensionSettings});draw();};
   form.onsubmit=async event=>{event.preventDefault();if(save.disabled)return;save.disabled=true;error.textContent='';try{const values={};for(const[key,input]of inputs){const value=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.dataset.jsonValue!==undefined||input.dataset.jsonEnum!==undefined?JSON.parse(input.value):input.value;if(input.type==='number'&&(!input.value||!Number.isFinite(value)))throw Error(key+': '+this.text('нужно число','number required'));values[key]=value;}const extensionSettings=structuredClone(this.app.settings.extensionSettings||{});extensionSettings[id]=values;await this.app.changeSettings({extensionSettings});this.refreshContributions();document.dispatchEvent(new CustomEvent('studio:extension-settings',{detail:{id,values}}));this.app.toast(this.text('Настройки применены','Settings applied'));}catch(e){error.textContent=e.message;}finally{save.disabled=false;}};
  };
  select.onchange=draw;const refresh=()=>{const value=select.value;entries=available();fill(value);draw();};document.addEventListener('studio:addons-changed',refresh);draw();return()=>document.removeEventListener('studio:addons-changed',refresh);
 }
});
