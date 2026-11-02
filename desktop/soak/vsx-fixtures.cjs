'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {atomic}=require('./core.cjs');
const publisher='devforge-soak',ids={library:'vscode.devforge-soak.library',probe:'vscode.devforge-soak.probe',browser:'vscode.devforge-soak.browser'};
function definitions(){
 const base={publisher,version:'1.0.0',engines:{vscode:'^1.100.0'},license:'MIT',activationEvents:['*']};
 const library={...base,name:'library',displayName:'VSX Finder Library',main:'./main.cjs'};
 const probe={...base,name:'probe',displayName:'VSX Finder Probe',description:'Synthetic extension for lifecycle and UI checks',main:'./main.cjs',extensionDependencies:[publisher+'.library'],contributes:{
  commands:[['probe','Inspect'],['key','Keybinding'],['webview','Webview'],['update','Update setting']].map(([suffix,title])=>({command:'df.vsx.'+suffix,title:'VSX Finder '+title})),
  configuration:{title:'VSX Finder',properties:{'df.vsx.mode':{type:'string',enum:['one','two'],default:'one'},'df.vsx.enabled':{type:'boolean',default:true}}},
  menus:{'editor/context':[{command:'df.vsx.probe',group:'navigation'}],'explorer/context':[{command:'df.vsx.probe',when:'resourceExtname == .dfpipe',group:'navigation'}]},
  keybindings:[{command:'df.vsx.key',key:'ctrl+alt+8',when:'editorTextFocus'}],
  viewsContainers:{activitybar:[{id:'df-vsx',title:'VSX Finder',icon:'icon.svg'}]},views:{'df-vsx':[{id:'df.vsx.tree',name:'VSX Finder Tree'}]},
  languages:[{id:'df pipe (finder)',extensions:['.dfpipe'],configuration:'language.json'}],grammars:[{language:'df pipe (finder)',scopeName:'source.dfpipe',path:'grammar.json'}],
  snippets:[{language:'df pipe (finder)',path:'snippets.json'}],themes:[{id:'df-vsx-theme',label:'VSX Finder Theme',uiTheme:'vs-dark',path:'theme.json'}]
 }};
 const browser={...base,name:'browser',displayName:'VSX Finder Browser',browser:'./main.cjs',contributes:{commands:[{command:'df.vsx.browser',title:'VSX Finder Browser'}]}};
 return{library,probe,browser};
}
// These run in genuine Code OSS Node/browser extension hosts, not API mocks.
const probeCode=`const v=require('vscode');let keyCount=0;exports.activate=async c=>{
 const dep=v.extensions.getExtension('devforge-soak.library'),library=await dep.activate();
 const push=x=>c.subscriptions.push(x),version=c.extension.packageJSON.version;
 push(v.commands.registerCommand('df.vsx.probe',uri=>({version,dependency:library.answer,mode:v.workspace.getConfiguration('df.vsx').get('mode'),keyCount,uri:uri?.fsPath})));
 push(v.commands.registerCommand('df.vsx.key',()=>++keyCount));
 push(v.commands.registerCommand('df.vsx.update',mode=>v.workspace.getConfiguration('df.vsx').update('mode',mode,v.ConfigurationTarget.Global)));
 push(v.commands.registerCommand('df.vsx.webview',()=>{const p=v.window.createWebviewPanel('df.vsx.webview','VSX Finder Webview',v.ViewColumn.Active,{enableScripts:true});p.webview.html='<html><body><button id="ready">VSX Finder webview ready</button></body></html>';push(p);return true;}));
 push(v.window.registerTreeDataProvider('df.vsx.tree',{getTreeItem:x=>new v.TreeItem(x),getChildren:()=>['VSX Finder tree ready']}));
 const status=v.window.createStatusBarItem(v.StatusBarAlignment.Right);status.name='VSX Finder';status.text='VSX Finder status';status.show();push(status);
 const selector={language:'df pipe (finder)'},range=new v.Range(0,0,0,3);
 push(v.languages.registerCompletionItemProvider(selector,{provideCompletionItems:()=>[new v.CompletionItem('finderCompletion',v.CompletionItemKind.Function)]}));
 push(v.languages.registerHoverProvider(selector,{provideHover:()=>new v.Hover('VSX Finder hover',range)}));
 push(v.languages.registerDocumentSymbolProvider(selector,{provideDocumentSymbols:()=>[new v.DocumentSymbol('finderSymbol','from extension',v.SymbolKind.Function,range,range)]}));
 push(v.languages.registerDocumentFormattingEditProvider(selector,{provideDocumentFormattingEdits:d=>[v.TextEdit.replace(new v.Range(d.positionAt(0),d.positionAt(d.getText().length)),d.getText().toUpperCase())]}));
 const diagnostics=v.languages.createDiagnosticCollection('df-vsx-finder');push(diagnostics);const update=d=>{if(d.languageId==='df pipe (finder)')diagnostics.set(d.uri,d.getText().includes('BAD')?[new v.Diagnostic(range,'VSX Finder BAD token',v.DiagnosticSeverity.Warning)]:[]);};
 push(v.workspace.onDidOpenTextDocument(update));push(v.workspace.onDidChangeTextDocument(e=>update(e.document)));v.workspace.textDocuments.forEach(update);
};`;
async function prepare(profile){
 const fixture=await require('./fixtures.cjs').prepare(profile),defs=definitions();
 await fs.writeFile(path.join(fixture.main,'sample.dfpipe'),'BAD example\n');
 // No real user's extensions, credentials, projects or settings enter this profile.
 const host=await new(require('../host.cjs').DesktopHost)(profile,()=>{},{codeossEnabled:()=>true}).init(),packages={};
 try{
  for(const[key,manifest]of [...Object.entries(defs),['upgrade',{...defs.probe,version:'1.1.0'}]]){
   const folder=path.join(profile,'vsx-fixtures',key,'extension');await fs.mkdir(folder,{recursive:true});
   const files={'package.json':JSON.stringify(manifest),'LICENSE':'MIT\nSynthetic DevForge test extension.','main.cjs':key==='library'?"exports.activate=()=>({answer:42});":key==='browser'?"const v=require('vscode');exports.activate=c=>c.subscriptions.push(v.commands.registerCommand('df.vsx.browser',()=>({worker:typeof window==='undefined',answer:42})));":probeCode};
   if(key==='probe'||key==='upgrade')Object.assign(files,{'icon.svg':'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#8ac" d="M4 4h16v16H4z"/></svg>',
    'language.json':JSON.stringify({comments:{lineComment:'//'},brackets:[['{','}']],autoClosingPairs:[{open:'{',close:'}'}]}),
    'grammar.json':JSON.stringify({scopeName:'source.dfpipe',patterns:[{match:'\\bBAD\\b',name:'comment.line.dfpipe'}]}),
    'snippets.json':JSON.stringify({Finder:{prefix:'dfsnippet',body:'finderSnippet',description:'Finder snippet'}}),
    'theme.json':JSON.stringify({name:'VSX Finder Theme',colors:{'editor.background':'#1a2328'},tokenColors:[]}),'.oxlintrc.ci.json':'{}'});
   for(const[name,text]of Object.entries(files))await fs.writeFile(path.join(folder,name),text);
   const archive=path.join(profile,'vsx-fixtures',key+'.vsix');await require('../archive.cjs').zipDirectory(path.dirname(folder),archive);packages[key]=await host.vscode.prepareFile(archive);
  }
 }finally{await host.close();}
 const library=JSON.parse(await fs.readFile(path.join(profile,'addons.json'),'utf8'));
 for(const key of ['library','probe'])library.packages.push({package:packages[key],source:'local-file',accepted:true,compatibilityAccepted:true});
 const requested=['studio.language.cpp','studio.outline','studio.function-docs','studio.split-editors','studio.console',ids.probe];
 library.profile={...library.profile,nativeProvidersRestored:true,requested,defaultRequested:requested,resolved:[]};delete library.builtins;await atomic(path.join(profile,'addons.json'),library);
 return{...fixture,vsx:{schema:1,ids,packages}};
}
async function refreshCandidate(fixture,key){
 if(!['library','probe','upgrade','browser'].includes(key))throw Error('Unknown synthetic VSIX');
 const real=await fs.realpath(fixture.profile),archive=await fs.realpath(path.join(real,'vsx-fixtures',key+'.vsix'));
 if(!require('./core.cjs').inside(archive,real))throw Error('VSIX fixture escaped its profile');
 const marker=JSON.parse(await fs.readFile(path.join(real,'.devforge-soak-owned.json'),'utf8'));
 if(marker.format!=='devforge.soak.fixture/1'||!marker.token)throw Error('VSIX fixture owner is unavailable');
 const runtime=new(require('../vscode-runtime.cjs').VSCodeRuntime)({ws:{data:real},system:{codeossEnabled:()=>true}});
 return runtime.prepareFile(archive);
}
module.exports={prepare,definitions,ids,refreshCandidate};
