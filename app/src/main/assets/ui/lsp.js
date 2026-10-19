'use strict';
class ClangdClient {
  constructor(ide){this.ide=ide;this.seq=0;this.pending=new Map();this.opened=new Map();this.chain=Promise.resolve();this.ready=false;this.capabilities={};this.disposables=[];this.epoch=0;onNative('lsp',m=>this.receive(m));onNative('lspExit',e=>{this.ready=false;ide.lspStatus('clangd остановлен','error');for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('clangd завершился'));}this.pending.clear();});onNative('lspLog',s=>console.warn('clangd:',s));}
  send(m){this.chain=this.chain.catch(()=>{}).then(()=>native('lspSend',{message:m}));return this.chain;}
  notify(method,params){return this.send({jsonrpc:'2.0',method,params}).catch(e=>console.warn('LSP',method,e.message));}
  request(method,params,token){
    if(!this.ready&&method!=='initialize')return Promise.resolve(null);
    const id=++this.seq;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('clangd: '+method+' timeout'));},30000);
      const cancel=token?.onCancellationRequested(()=>this.notify('$/cancelRequest',{id}));
      this.pending.set(id,{resolve:r=>{cancel?.dispose();resolve(r);},reject:e=>{cancel?.dispose();reject(e);},timer});
      this.send({jsonrpc:'2.0',id,method,params}).catch(e=>{clearTimeout(timer);this.pending.delete(id);reject(e);});
    });
  }
  receive(m){
    if(m.id!==undefined&&!m.method){const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);return;}
    if(m.method==='textDocument/publishDiagnostics'){if(this.ready)this.ide.diagnostics(m.params);return;}
    if(m.method==='window/logMessage')console.log('clangd',m.params?.message);
    if(m.id!==undefined){
      if(m.method==='workspace/configuration')this.send({jsonrpc:'2.0',id:m.id,result:(m.params.items||[]).map(()=>null)});
      else if(m.method==='workspace/applyEdit')this.ide.applyEdit(m.params.edit).then(()=>this.send({jsonrpc:'2.0',id:m.id,result:{applied:true}})).catch(e=>this.send({jsonrpc:'2.0',id:m.id,result:{applied:false,failureReason:e.message}}));
      else this.send({jsonrpc:'2.0',id:m.id,result:null});
    }
  }
  async start(){
    const epoch=++this.epoch;
    this.ready=false;this.ide.lspStatus('Запуск clangd…','pending');
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('clangd перезапускается'));}this.pending.clear();this.opened.clear();
    for(const d of this.disposables)d.dispose();this.disposables=[];
    try{
      await this.chain.catch(()=>{});
      const s=await native('lspStart',this.ide.settings);if(epoch!==this.epoch)return;
      const tokenTypes=['namespace','type','class','enum','interface','struct','typeParameter','parameter','variable','property','enumMember','event','function','method','macro','keyword','modifier','comment','string','number','regexp','operator','decorator'];
      const tokenModifiers=['declaration','definition','readonly','static','deprecated','abstract','async','modification','documentation','defaultLibrary'];
      const init=await this.request('initialize',{processId:null,rootUri:monaco.Uri.file(s.root).toString(),workspaceFolders:[{uri:monaco.Uri.file(s.root).toString(),name:this.ide.state.project}],clientInfo:{name:'Forge IDE',version:'0.1.0'},capabilities:{workspace:{applyEdit:true,workspaceEdit:{documentChanges:true},configuration:true,symbol:{symbolKind:{valueSet:Array.from({length:26},(_,i)=>i+1)}}},textDocument:{synchronization:{dynamicRegistration:false,didSave:true},completion:{contextSupport:true,completionItem:{snippetSupport:true,documentationFormat:['markdown','plaintext'],deprecatedSupport:true,preselectSupport:true,tagSupport:{valueSet:[1]},insertReplaceSupport:true,resolveSupport:{properties:['documentation','detail','additionalTextEdits']}}},hover:{contentFormat:['markdown','plaintext']},signatureHelp:{signatureInformation:{documentationFormat:['markdown','plaintext'],parameterInformation:{labelOffsetSupport:true}}},definition:{linkSupport:true},documentSymbol:{hierarchicalDocumentSymbolSupport:true},codeAction:{codeActionLiteralSupport:{codeActionKind:{valueSet:['quickfix','refactor','source','source.organizeImports']}},resolveSupport:{properties:['edit']}},publishDiagnostics:{relatedInformation:true,versionSupport:true,tagSupport:{valueSet:[1,2]},dataSupport:true,codeDescriptionSupport:true},semanticTokens:{requests:{full:true},tokenTypes,tokenModifiers,formats:['relative'],overlappingTokenSupport:false,multilineTokenSupport:false},inlayHint:{resolveSupport:{properties:['tooltip','textEdits','label.tooltip']}}},general:{positionEncodings:['utf-16']}},initializationOptions:{clangdFileStatus:true,fallbackFlags:['-std='+this.ide.settings.cppStandard]}});
      if(epoch!==this.epoch)return;
      this.capabilities=init?.capabilities||{};this.ready=true;await this.notify('initialized',{});this.registerProviders();
      for(const doc of this.ide.docs.values())this.sync(doc.model);
      this.ide.lspStatus('clangd готов','ready');this.ide.updateOutline();
    }catch(e){if(epoch===this.epoch){this.ready=false;this.ide.lspStatus('Ошибка clangd','error');this.ide.toast(e.message);console.error(e);}}
  }
  sync(model){
    if(!this.ready||!['c','cpp'].includes(model.getLanguageId()))return;
    const uri=model.uri.toString(),version=model.getVersionId();
    if(!this.opened.has(uri)){this.opened.set(uri,version);this.notify('textDocument/didOpen',{textDocument:{uri,languageId:model.getLanguageId(),version,text:model.getValue()}});}
    else if(this.opened.get(uri)!==version){this.opened.set(uri,version);this.notify('textDocument/didChange',{textDocument:{uri,version},contentChanges:[{text:model.getValue()}]});}
  }
  close(model){const uri=model.uri.toString();if(this.ready&&this.opened.has(uri))this.notify('textDocument/didClose',{textDocument:{uri}});this.opened.delete(uri);}
  doc(model){this.sync(model);return{uri:model.uri.toString()};}
  at(model,pos){return{textDocument:this.doc(model),position:{line:pos.lineNumber-1,character:pos.column-1}};}
  range(r){return{startLineNumber:r.start.line+1,startColumn:r.start.character+1,endLineNumber:r.end.line+1,endColumn:r.end.character+1};}
  fromRange(r){return{start:{line:r.startLineNumber-1,character:r.startColumn-1},end:{line:r.endLineNumber-1,character:r.endColumn-1}};}
  textEdits(es){return(es||[]).map(e=>({range:this.range(e.range),text:e.newText}));}
  async workspaceEdit(edit){
    const edits=[];if(!edit)return{edits};
    for(const[uri,changes]of Object.entries(edit.changes||{})){
      const model=await this.ide.ensureModel(monaco.Uri.parse(uri).fsPath);if(this.ide.docs.get(model.uri.toString())?.readonly)throw new Error('Нельзя изменить заголовок системной библиотеки');
      for(const e of changes)edits.push({resource:model.uri,versionId:model.getVersionId(),textEdit:{range:this.range(e.range),text:e.newText}});
    }
    for(const change of edit.documentChanges||[]){if(!change.textDocument)continue;const model=await this.ide.ensureModel(monaco.Uri.parse(change.textDocument.uri).fsPath);if(this.ide.docs.get(model.uri.toString())?.readonly)throw new Error('Файл только для чтения');for(const e of change.edits||[])edits.push({resource:model.uri,versionId:model.getVersionId(),textEdit:{range:this.range(e.range),text:e.newText}});}
    return{edits};
  }
  markdown(value){if(!value)return undefined;if(typeof value==='string')return{value,isTrusted:false,supportHtml:false};if(Array.isArray(value))return{value:value.map(v=>typeof v==='string'?v:v.value||'').join('\n\n'),isTrusted:false,supportHtml:false};return{value:value.kind==='plaintext'?value.value.replace(/[\\`*_{}\[\]()#+\-.!]/g,'\\$&'):value.value||'',isTrusted:false,supportHtml:false};}
  registerProviders(){
    const m=monaco,l=m.languages,self=this;
    const kindMap=[l.CompletionItemKind.Text,l.CompletionItemKind.Method,l.CompletionItemKind.Function,l.CompletionItemKind.Constructor,l.CompletionItemKind.Field,l.CompletionItemKind.Variable,l.CompletionItemKind.Class,l.CompletionItemKind.Interface,l.CompletionItemKind.Module,l.CompletionItemKind.Property,l.CompletionItemKind.Unit,l.CompletionItemKind.Value,l.CompletionItemKind.Enum,l.CompletionItemKind.Keyword,l.CompletionItemKind.Snippet,l.CompletionItemKind.Color,l.CompletionItemKind.File,l.CompletionItemKind.Reference,l.CompletionItemKind.Folder,l.CompletionItemKind.EnumMember,l.CompletionItemKind.Constant,l.CompletionItemKind.Struct,l.CompletionItemKind.Event,l.CompletionItemKind.Operator,l.CompletionItemKind.TypeParameter];
    function completion(item,model,pos){const word=model.getWordUntilPosition(pos);const e=item.textEdit;return{label:item.label,kind:kindMap[(item.kind||1)-1],detail:item.detail,documentation:self.markdown(item.documentation),sortText:item.sortText,filterText:item.filterText,preselect:item.preselect,insertText:e?.newText??item.insertText??item.label,insertTextRules:item.insertTextFormat===2?l.CompletionItemInsertTextRule.InsertAsSnippet:undefined,range:e?(e.range?self.range(e.range):{insert:self.range(e.insert),replace:self.range(e.replace)}):new m.Range(pos.lineNumber,word.startColumn,pos.lineNumber,word.endColumn),additionalTextEdits:self.textEdits(item.additionalTextEdits),tags:item.deprecated||item.tags?.includes(1)?[l.CompletionItemTag.Deprecated]:undefined,__lsp:item,__position:pos,__model:model};}
    for(const language of ['c','cpp']){
      const add=d=>this.disposables.push(d);
      add(l.registerCompletionItemProvider(language,{triggerCharacters:['.','>',':','"','<','/'],async provideCompletionItems(model,pos,ctx,token){try{const r=await self.request('textDocument/completion',{...self.at(model,pos),context:{triggerKind:ctx.triggerKind===0?1:ctx.triggerKind===1?2:3,triggerCharacter:ctx.triggerCharacter}},token);return{suggestions:(Array.isArray(r)?r:r?.items||[]).map(i=>completion(i,model,pos)),incomplete:r?.isIncomplete};}catch{return{suggestions:[]};}},async resolveCompletionItem(item,token){if(!self.capabilities.completionProvider?.resolveProvider)return item;try{const r=await self.request('completionItem/resolve',item.__lsp,token);return{...item,...completion(r,item.__model,item.__position)};}catch{return item;}}}));
      add(l.registerHoverProvider(language,{async provideHover(model,pos,token){try{const r=await self.request('textDocument/hover',self.at(model,pos),token);if(!r)return null;const content=Array.isArray(r.contents)?r.contents:[r.contents];return{range:r.range?self.range(r.range):undefined,contents:content.map(v=>v?.language?{value:'```'+v.language+'\n'+v.value+'\n```'}:self.markdown(v)).filter(Boolean)};}catch{return null;}}}));
      add(l.registerDefinitionProvider(language,{async provideDefinition(model,pos,token){try{const r=await self.request('textDocument/definition',self.at(model,pos),token);return(r?(Array.isArray(r)?r:[r]):[]).map(x=>x.targetUri?{uri:m.Uri.parse(x.targetUri),range:self.range(x.targetRange),targetSelectionRange:self.range(x.targetSelectionRange),originSelectionRange:x.originSelectionRange?self.range(x.originSelectionRange):undefined}:{uri:m.Uri.parse(x.uri),range:self.range(x.range)});}catch{return[];}}}));
      add(l.registerReferenceProvider(language,{async provideReferences(model,pos,ctx,token){try{const r=await self.request('textDocument/references',{...self.at(model,pos),context:{includeDeclaration:ctx.includeDeclaration}},token);for(const uri of new Set((r||[]).map(x=>x.uri)))await self.ide.ensureModel(m.Uri.parse(uri).fsPath);return(r||[]).map(x=>({uri:m.Uri.parse(x.uri),range:self.range(x.range)}));}catch{return[];}}}));
      add(l.registerRenameProvider(language,{async provideRenameEdits(model,pos,newName,token){const r=await self.request('textDocument/rename',{...self.at(model,pos),newName},token);return self.workspaceEdit(r);},async resolveRenameLocation(model,pos,token){if(self.capabilities.renameProvider?.prepareProvider){const r=await self.request('textDocument/prepareRename',self.at(model,pos),token);if(!r)return{range:new m.Range(pos.lineNumber,pos.column,pos.lineNumber,pos.column),text:'',rejectReason:'Этот символ нельзя переименовать'};return{range:self.range(r.range||r),text:r.placeholder||model.getValueInRange(self.range(r.range||r))};}const w=model.getWordAtPosition(pos);return w?{range:new m.Range(pos.lineNumber,w.startColumn,pos.lineNumber,w.endColumn),text:w.word}:null;}}));
      add(l.registerDocumentFormattingEditProvider(language,{async provideDocumentFormattingEdits(model,options,token){const r=await self.request('textDocument/formatting',{textDocument:self.doc(model),options:{tabSize:options.tabSize,insertSpaces:options.insertSpaces}},token);return self.textEdits(r);}}));
      add(l.registerDocumentRangeFormattingEditProvider(language,{async provideDocumentRangeFormattingEdits(model,range,options,token){const r=await self.request('textDocument/rangeFormatting',{textDocument:self.doc(model),range:self.fromRange(range),options:{tabSize:options.tabSize,insertSpaces:options.insertSpaces}},token);return self.textEdits(r);}}));
      add(l.registerDocumentSymbolProvider(language,{async provideDocumentSymbols(model,token){try{const r=await self.request('textDocument/documentSymbol',{textDocument:self.doc(model)},token);const convert=x=>({name:x.name,detail:x.detail||'',kind:x.kind-1,range:self.range(x.range||x.location.range),selectionRange:self.range(x.selectionRange||x.range||x.location.range),tags:x.tags,children:(x.children||[]).map(convert)});return(r||[]).map(convert);}catch{return[];}}}));
      add(l.registerDocumentHighlightProvider(language,{async provideDocumentHighlights(model,pos,token){try{const r=await self.request('textDocument/documentHighlight',self.at(model,pos),token);return(r||[]).map(x=>({range:self.range(x.range),kind:x.kind||1}));}catch{return[];}}}));
      add(l.registerSignatureHelpProvider(language,{signatureHelpTriggerCharacters:['(',','],signatureHelpRetriggerCharacters:[',',')'],async provideSignatureHelp(model,pos,token,context){try{const r=await self.request('textDocument/signatureHelp',self.at(model,pos),token);if(!r)return null;return{value:{activeParameter:r.activeParameter||0,activeSignature:r.activeSignature||0,signatures:r.signatures.map(s=>({label:s.label,documentation:self.markdown(s.documentation),parameters:(s.parameters||[]).map(p=>({label:p.label,documentation:self.markdown(p.documentation)})),activeParameter:s.activeParameter}))},dispose(){}};}catch{return null;}}}));
      add(l.registerCodeActionProvider(language,{providedCodeActionKinds:['quickfix','refactor','source'],async provideCodeActions(model,range,ctx,token){try{const diagnostics=(self.ide.diagnosticMap.get(model.uri.toString())?.diagnostics||[]).filter(d=>d.range.start.line<=range.endLineNumber-1&&d.range.end.line>=range.startLineNumber-1);const r=await self.request('textDocument/codeAction',{textDocument:self.doc(model),range:self.fromRange(range),context:{diagnostics,only:ctx.only?[ctx.only]:undefined,triggerKind:ctx.trigger===1?1:2}},token);const actions=[];for(const a of r||[]){if(a.disabled)continue;actions.push({title:a.title,kind:a.kind||'quickfix',isPreferred:a.isPreferred,edit:a.edit?await self.workspaceEdit(a.edit):undefined,__lsp:a});}return{actions,dispose(){}};}catch{return{actions:[],dispose(){}};}},async resolveCodeAction(action,token){if(!action.edit&&self.capabilities.codeActionProvider?.resolveProvider){const r=await self.request('codeAction/resolve',action.__lsp,token);if(r?.edit)action.edit=await self.workspaceEdit(r.edit);}return action;}}));
      if(this.capabilities.semanticTokensProvider&&this.ide.settings.semanticHighlighting){const legend=this.capabilities.semanticTokensProvider.legend;add(l.registerDocumentSemanticTokensProvider(language,{getLegend:()=>legend,async provideDocumentSemanticTokens(model,last,token){try{const r=await self.request('textDocument/semanticTokens/full',{textDocument:self.doc(model)},token);return r?{data:new Uint32Array(r.data),resultId:r.resultId}:null;}catch{return null;}},releaseDocumentSemanticTokens(){}}));}
      if(this.capabilities.inlayHintProvider)add(l.registerInlayHintsProvider(language,{async provideInlayHints(model,range,token){if(!self.ide.settings.inlayHints)return{hints:[],dispose(){}};try{const r=await self.request('textDocument/inlayHint',{textDocument:self.doc(model),range:self.fromRange(range)},token);return{hints:(r||[]).map(h=>({position:{lineNumber:h.position.line+1,column:h.position.character+1},label:typeof h.label==='string'?h.label:h.label.map(p=>({label:p.value,tooltip:self.markdown(p.tooltip)})),kind:h.kind===1?l.InlayHintKind.Type:l.InlayHintKind.Parameter,tooltip:self.markdown(h.tooltip),paddingLeft:h.paddingLeft,paddingRight:h.paddingRight,textEdits:self.textEdits(h.textEdits)})),dispose(){}};}catch{return{hints:[],dispose(){}};}}}));
    }
  }
}
