'use strict';
window.StudioI18n={locale:window.STUDIO_BOOT_LANGUAGE||localStorage.getItem('gccStudioLanguage')||(navigator.language.toLowerCase().startsWith('ru')?'ru':'en')};
document.documentElement.lang=StudioI18n.locale;
const translationPairs=Object.entries(window.STUDIO_EN).sort((a,b)=>b[0].length-a[0].length);
window.tr=function(text){text=String(text??'');if(StudioI18n.locale==='ru'||!/[А-Яа-яЁё]/.test(text))return text;if(Object.hasOwn(STUDIO_EN,text))return STUDIO_EN[text];for(const[from,to]of translationPairs){if(text.includes(from)){const escaped=from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');text=text.replace(new RegExp('(?<![\\p{L}\\p{N}_])'+escaped+'(?![\\p{L}\\p{N}_])','gu'),()=>to);}}return text;};
const i18nSkip='.monaco-editor,pre,code,textarea,input,#tree,#outline,#breadcrumb,#projectName,#projectSelect,#quickResults,.output,.debug-list,[data-no-i18n]';
function localizeElement(root){
  if(StudioI18n.locale==='ru')return;
  const visit=node=>{if(node.nodeType===Node.TEXT_NODE){if(!node.parentElement?.closest(i18nSkip)){const value=tr(node.data.trim());if(value!==node.data.trim())node.data=node.data.replace(node.data.trim(),value);}return;}if(node.nodeType!==Node.ELEMENT_NODE)return;if(node.matches(i18nSkip)&&!node.matches('input,textarea'))return;for(const key of ['title','placeholder','aria-label']){const value=node.getAttribute(key);if(value){const translated=tr(value);if(translated!==value)node.setAttribute(key,translated);}}for(const child of node.childNodes)visit(child);};visit(root);
}
const localeQueue=new Set();let localePending=false;
new MutationObserver(records=>{if(StudioI18n.locale==='ru')return;for(const r of records){const element=r.target.nodeType===Node.ELEMENT_NODE?r.target:r.target.parentElement;if(element?.closest(i18nSkip))continue;localeQueue.add(r.target);}if(!localePending){localePending=true;queueMicrotask(()=>{localePending=false;for(const node of localeQueue)localizeElement(node);localeQueue.clear();});}}).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['title','placeholder','aria-label']});
localizeElement(document.body);
