'use strict';
// Catalog-discovered language providers own their implementation and settings.
globalThis.StudioInterfaceLanguages={
 refresh(ide){const select=document.querySelector('#settingsForm [name=language]');if(!select)return;let section=select.closest('section').querySelector('[data-interface-language-providers]');if(!section){section=document.createElement('div');section.dataset.interfaceLanguageProviders='';select.closest('section').append(section);}section.replaceChildren();
 for(const pkg of ide.addons.available.filter(pkg=>pkg.manifest.interfaceTranslation)){const m=pkg.manifest,active=ide.addons.manager.active.has(m.id),button=document.createElement('button'),note=document.createElement('p');button.type='button';button.textContent=ide.addons.local(m.name)+(active?'…':ide.settings.language==='en'?' — addon required':' — требуется дополнение');button.onclick=()=>active?StudioExtensionAPI.commands.get(m.id+'/open')?.run():ide.addons.review(pkg,true);note.textContent=ide.settings.language==='en'?'Machine translation by the selected provider may be inaccurate.':'Машинный перевод через выбранный переводчик может быть неточным.';section.append(button,note);}
 }
};
