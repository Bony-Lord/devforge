'use strict';
/* Builtin adapters contribute preference schemas; unloading a module removes its UI. */
Object.assign(StudioDesign.prototype,{
 refreshAddonSettings(){
  const form=document.querySelector('#settingsForm');if(!this.settingsPages||!form)return;
  const current=this.settingsPages.find(p=>!p.page.hidden)?.label;
  for(const page of this.settingsPages.filter(p=>p.owner)){page.page.remove();page.button.remove();}
  this.settingsPages=this.settingsPages.filter(p=>!p.owner);
  const groups=new Map();for(const record of this.ide.addons.registry.list('settingsFields')){if(!groups.has(record.owner))groups.set(record.owner,[]);groups.get(record.owner).push(record.value);}
  const local=value=>typeof value==='string'?value:value?.[this.locale]||value?.en||'';
  for(const[owner,fields]of groups){
   const manifest=this.ide.addons.catalog.find(m=>m.id===owner),section=document.createElement('section'),heading=document.createElement('h3'),grid=document.createElement('div');section.dataset.addonSettings=owner;section.className='design-settings-page';heading.textContent=local(manifest?.name)||owner;grid.className='settings-grid';section.append(heading,grid);
   for(const field of fields){
    const label=document.createElement('label'),input=document.createElement(field.type==='choice'?'select':'input'),value=this.ide.settings[field.key]??field.default;label.textContent=local(field.label);input.name=field.key;input.dataset.addonOwner=owner;
    if(field.type==='choice'){for(const choice of field.options){const option=document.createElement('option');option.value=typeof choice==='object'?choice.value:choice;option.textContent=local(typeof choice==='object'?choice.label:String(choice));input.append(option);}input.value=value;}
    else if(field.type==='toggle'){input.type='checkbox';input.checked=!!value;label.className='check';}
    else{input.type=field.type==='number'?'number':'text';input.value=value;for(const attr of ['min','max','step'])if(field[attr]!==undefined)input[attr]=field[attr];}
    label.append(input);grid.append(label);
   }
   this.addSettingsPage(section,heading.textContent,owner);this.settingsContent.append(section);
  }
  for(const entry of this.ide.addons.manager.active.values()){const manifest=entry.manifest;if(!Object.keys(manifest.configuration||{}).length)continue;const section=document.createElement('section');section.dataset.addonSettings=manifest.id;this.addSettingsPage(section,local(manifest.name)||manifest.id,manifest.id);this.settingsContent.append(section);this.ide.addons.renderExtensionSettings(section,manifest.id);}
  const index=this.settingsPages.findIndex(p=>p.label===current);this.chooseSettingsPage(index>=0?index:0);
 }
});
