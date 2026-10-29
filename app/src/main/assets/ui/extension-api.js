'use strict';
// Privileged mods run only from a reviewed package with extensions.full-access.
// Project execution and filesystem operations still pass through native validation.
const StudioExtensionAPI={
 version:'0.1.2',views:new Map(),commands:new Map(),hooks:new WeakMap(),
 descriptor(path){return this.views.get(path);},
 create(ide,scope){
  const owner=scope.manifest.id,track=value=>scope.use(value),id=value=>{if(!/^[a-zA-Z0-9._-]{1,80}$/.test(value))throw Error('Invalid extension identifier');return owner+'/'+value;};
  const api={version:this.version,manifest:scope.manifest,signal:scope.signal,subscriptions:{push:(...items)=>items.forEach(track)},use:track,
   raw:{application:ide,get windows(){return ide.windows;},get editor(){return ide.editor;},document,monaco},
   host:{request:(op,data)=>native(op,data),on:(name,callback)=>track(onNative(name,callback))},
   workspace:{get root(){return ide.state.root;},get files(){return ide.flatFiles();},open:path=>ide.openFile(path),refresh:()=>ide.refreshTree(),save:()=>ide.saveAll(),get configurations(){return ide.configurations;},get actions(){return ide.projectActions;}},
   editor:{get active(){return ide.editor;},get document(){return ide.active;},get models(){return [...ide.docs.values()];},action:action=>ide.action(action),decorate:(model,markers)=>{monaco.editor.setModelMarkers(model,owner,markers);return track(()=>monaco.editor.setModelMarkers(model,owner,[]));},onChange:callback=>track(ide.editor.onDidChangeModelContent(callback))},
   languages:monaco.languages,
   configuration:{get:(key,fallback)=>ide.settings.extensionSettings?.[owner]?.[key]??fallback,set:async(key,value)=>{const extensionSettings=structuredClone(ide.settings.extensionSettings||{});extensionSettings[owner]={...extensionSettings[owner],[key]:value};await ide.changeSettings({extensionSettings});}},
   commands:{register:(name,label,run,key)=>{const command={id:id(name),label,key,run};if(typeof run!=='function'||typeof label!=='string')throw Error('Invalid command');this.commands.set(command.id,command);ide.registerCommands();return track(()=>{this.commands.delete(command.id);ide.registerCommands();});},execute:(name,...args)=>{const command=this.commands.get(name)||ide.commands.find(c=>c.id===name);if(!command)throw Error('Command unavailable: '+name);return command.run(...args);}},
   views:{register:(name,title,render)=>{const uri='devforge://extensions/'+id(name);if(typeof render!=='function')throw Error('A view requires a renderer');this.views.set(uri,{owner,title,render,api});track(async()=>{this.views.delete(uri);for(const doc of [...ide.docs.values()])if(doc.path===uri){if(ide.tabs.includes(doc))await ide.closeTab(doc);}});return{uri,open:()=>ide.openFile(uri),dispose:()=>this.views.delete(uri)};},open:uri=>ide.openFile(uri)},
   ui:{element:(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;},toast:message=>ide.toast(message),popover:(element,anchor)=>StudioPopover.open(element,anchor),style:css=>{const style=document.createElement('style');style.dataset.extension=owner;style.textContent=String(css);document.head.append(style);return track(()=>style.remove());}},
   events:{listen:(target,name,callback,options)=>{target.addEventListener(name,callback,options);return track(()=>target.removeEventListener(name,callback,options));}},
   hook:(object,method,wrap)=>{if(typeof object[method]!=='function'||typeof wrap!=='function')throw Error('Hook target must be a function');let methods=this.hooks.get(object);if(!methods)this.hooks.set(object,methods=new Map());let slot=methods.get(method);if(!slot){slot={original:object[method],layers:[]};methods.set(method,slot);object[method]=function(...args){const call=index=>(...values)=>index<slot.layers.length?slot.layers[index](call(index+1),...values):slot.original.apply(this,values);return call(0)(...args);};}slot.layers.push(wrap);return track(()=>{const at=slot.layers.indexOf(wrap);if(at>=0)slot.layers.splice(at,1);});}
  };return Object.freeze(api);
 },
 document(ide,doc){return new StudioExtensionDocument(ide,doc);}
};
class StudioExtensionDocument {
 constructor(ide,doc){this.ide=ide;this.doc=doc;}
 open(container,editor){this.editor=editor;this.dialog=document.createElement('section');this.dialog.className='notebook-document studio-extension-document';this.dialog.dataset.noI18n='';container.append(this.dialog);const entry=StudioExtensionAPI.descriptor(this.doc.path);if(!entry)throw Error('Extension view unavailable');const result=entry.render(this.dialog,{editor,doc:this.doc,ide:this.ide,api:entry.api});if(result?.then)result.then(value=>{if(!this.dialog.isConnected){typeof value==='function'?value():value?.dispose?.();}else this.cleanup=value;}).catch(safeError);else this.cleanup=result;this.dialog.addEventListener('pointerdown',()=>StudioDocumentViews.activate(editor,this.doc));}
 focus(){this.dialog.querySelector('input,button,textarea,[tabindex]')?.focus({preventScroll:true});}
 optionsChanged(){}
 dispose(){typeof this.cleanup==='function'?this.cleanup():this.cleanup?.dispose?.();this.dialog.remove();}
}

globalThis.StudioExtensionAPI=StudioExtensionAPI;
