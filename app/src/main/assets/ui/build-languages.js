'use strict';
const cmakeSnippets={
  cmake_minimum_required:'cmake_minimum_required(VERSION ${1:3.16})',project:'project(${1:my_project} LANGUAGES ${2:CXX})',
  add_executable:'add_executable(${1:app}\n    ${2:main.cpp}\n)',add_library:'add_library(${1:library} ${2:STATIC}\n    ${3:source.cpp}\n)',
  target_sources:'target_sources(${1:app} PRIVATE\n    ${2:source.cpp}\n)',target_include_directories:'target_include_directories(${1:app} PRIVATE\n    ${2:include}\n)',
  target_link_libraries:'target_link_libraries(${1:app} PRIVATE ${2:library})',target_compile_features:'target_compile_features(${1:app} PRIVATE cxx_std_${2:20})',
  target_compile_options:'target_compile_options(${1:app} PRIVATE ${2:-Wall})',target_compile_definitions:'target_compile_definitions(${1:app} PRIVATE ${2:MY_DEFINE=1})',
  set:'set(${1:NAME} ${2:value})',option:'option(${1:BUILD_TESTS} "${2:Build tests}" ${3:ON})',find_package:'find_package(${1:Package} REQUIRED)',
  add_subdirectory:'add_subdirectory(${1:src})',include:'include(${1:CTest})',if:'if(${1:CONDITION})\n    ${0}\nendif()',
  foreach:'foreach(${1:item} IN LISTS ${2:items})\n    ${0}\nendforeach()',function:'function(${1:name} ${2:args})\n    ${0}\nendfunction()',
  message:'message(STATUS "${1:message}")',install:'install(TARGETS ${1:app} DESTINATION ${2:bin})',add_test:'add_test(NAME ${1:test} COMMAND ${2:app})'
};
const cmakeVariables=['CMAKE_SOURCE_DIR','CMAKE_BINARY_DIR','CMAKE_CURRENT_SOURCE_DIR','CMAKE_CURRENT_BINARY_DIR','CMAKE_PROJECT_NAME','PROJECT_NAME','PROJECT_SOURCE_DIR','PROJECT_BINARY_DIR','CMAKE_CXX_STANDARD','CMAKE_C_STANDARD','CMAKE_BUILD_TYPE','CMAKE_EXPORT_COMPILE_COMMANDS','CMAKE_CXX_FLAGS','CMAKE_C_FLAGS','CMAKE_MODULE_PATH','CMAKE_PREFIX_PATH','CMAKE_INSTALL_PREFIX','CMAKE_CURRENT_LIST_DIR'];
function registerBuildLanguages(ide){
  const m=monaco,l=m.languages;
  l.register({id:'cmake',extensions:['.cmake'],filenames:['CMakeLists.txt'],aliases:['CMake']});
  l.setLanguageConfiguration('cmake',{comments:{lineComment:'#',blockComment:['#[[',']]']},brackets:[['(',')'],['${','}']],autoClosingPairs:[{open:'(',close:')'},{open:'"',close:'"'},{open:'${',close:'}'}],surroundingPairs:[{open:'(',close:')'},{open:'"',close:'"'}]});
  l.setMonarchTokensProvider('cmake',{ignoreCase:true,tokenizer:{root:[[/#\[(=*)\[/,'comment','@comment'],[/#[^\n]*/,'comment'],[/\[(=*)\[/,'string','@bracketString'],[/"/,'string','@string'],[/\$\{/,'variable.cmake','@variable'],[/\$</,'variable.cmake'],[/\b(if|else|elseif|endif|foreach|endforeach|while|endwhile|function|endfunction|macro|endmacro|return|break|continue)\b/,'keyword'],[/([A-Za-z_][\w]*)(\s*)(\()/,['function.cmake','white','delimiter.parenthesis']],[/\b(ON|OFF|TRUE|FALSE|PUBLIC|PRIVATE|INTERFACE|STATIC|SHARED|MODULE|OBJECT|REQUIRED|CONFIG|VERSION)\b/,'keyword'],[/\b\d+(?:\.\d+)*\b/,'number'],[/[()]/,'delimiter.parenthesis'],[/[A-Za-z_][\w.-]*/,'identifier']],string:[[/\\./,'string.escape'],[/\$\{[^}]*\}/,'variable.cmake'],[/"/,'string','@pop'],[/[^"\\$]+/,'string'],[/./,'string']],variable:[[/\}/,'variable.cmake','@pop'],[/[^}]+/,'variable.cmake']],comment:[[/\](=*)\]/,'comment','@pop'],[/./,'comment']],bracketString:[[/\](=*)\]/,'string','@pop'],[/./,'string']]}});
  ide.cmakeCommandNames=Object.keys(cmakeSnippets);ide.cmakeHelpCache=new Map();
  native('cmakeCommands').then(r=>{if(r.code===0)ide.cmakeCommandNames=r.text.trim().split(/\s+/);}).catch(console.warn);
  l.registerCompletionItemProvider('cmake',{triggerCharacters:['$','{','/','"','('],provideCompletionItems(model,pos){
    const word=model.getWordUntilPosition(pos),range={startLineNumber:pos.lineNumber,endLineNumber:pos.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn},before=model.getLineContent(pos.lineNumber).slice(0,pos.column-1),suggestions=[];
    if(/\$\{[^}]*$/.test(before)){const local=[...model.getValue().matchAll(/\bset\s*\(\s*([A-Za-z_]\w*)/gi)].map(x=>x[1]);return{suggestions:[...new Set([...cmakeVariables,...local])].map(name=>({label:name,insertText:name,kind:l.CompletionItemKind.Variable,range}))};}
    if(!before.trim()||/^\s*\w*$/.test(before))for(const name of ide.cmakeCommandNames)suggestions.push({label:name,kind:l.CompletionItemKind.Function,insertText:cmakeSnippets[name]||name+'(${1})',insertTextRules:l.CompletionItemInsertTextRule.InsertAsSnippet,range,detail:'CMake',__command:name});
    for(const name of ['PRIVATE','PUBLIC','INTERFACE','STATIC','SHARED','REQUIRED','CONFIG','ON','OFF','LANGUAGES','CXX','C','VERSION'])suggestions.push({label:name,insertText:name,kind:l.CompletionItemKind.Keyword,range});
    for(const target of ide.cmakeSnapshot?.targets||[])suggestions.push({label:target.name,insertText:target.name,kind:l.CompletionItemKind.Reference,range});
    const dir=model.uri.fsPath.slice(0,model.uri.fsPath.lastIndexOf('/'));for(const file of ide.flatFiles().filter(f=>!f.dir)){let relativePath=file.path.startsWith(dir+'/')?file.path.slice(dir.length+1):relative(file.path,ide.state.root);suggestions.push({label:relativePath,insertText:relativePath,kind:l.CompletionItemKind.File,range});}
    return{suggestions};
  },async resolveCompletionItem(item){if(item.__command){const name=item.__command;let help=ide.cmakeHelpCache.get(name);if(!help){const r=await native('cmakeHelp',{name});help=r.text.slice(0,16000);ide.cmakeHelpCache.set(name,help);}item.documentation={value:'```text\n'+help+'\n```',isTrusted:false};}return item;}});
  l.registerHoverProvider('cmake',{async provideHover(model,pos){const word=model.getWordAtPosition(pos)?.word.toLowerCase();if(!ide.cmakeCommandNames.includes(word))return null;let help=ide.cmakeHelpCache.get(word);if(!help){help=(await native('cmakeHelp',{name:word})).text.slice(0,16000);ide.cmakeHelpCache.set(word,help);}return{contents:[{value:'```text\n'+help+'\n```',isTrusted:false}]};}});
  l.registerDocumentSymbolProvider('cmake',{provideDocumentSymbols(model){const result=[];for(let line=1;line<=model.getLineCount();line++){const text=model.getLineContent(line),match=text.match(/^\s*(project|add_executable|add_library|function|macro|set)\s*\(\s*([^\s)]+)/i);if(match){const range=new m.Range(line,1,line,text.length+1);result.push({name:match[2],detail:match[1],kind:l.SymbolKind.Function,range,selectionRange:range});}}return result;}});
  m.editor.registerCommand('studio.cmake.addSource',(_,path,target)=>ide.addCMakeSource(path,target));
  for(const language of ['c','cpp'])l.registerCodeActionProvider(language,{providedCodeActionKinds:['quickfix'],async provideCodeActions(model){const status=await ide.inspectCmake(model);return{actions:!status||status.included||status.dynamic?[]:status.targets.map(target=>({title:tr('Добавить файл в CMake')+' · '+target.name,kind:'quickfix',isPreferred:true,command:{id:'studio.cmake.addSource',title:tr('Добавить файл в CMake'),arguments:[model.uri.fsPath,target]}})),dispose(){}};}});
  l.registerCompletionItemProvider('yaml',{triggerCharacters:[':', ' '],provideCompletionItems(model,pos){
    if(!/\/(?:\.clang-format|_clang-format|\.clangd|\.clang-tidy)$/.test(model.uri.fsPath))return{suggestions:[]};
    const word=model.getWordUntilPosition(pos),range=new m.Range(pos.lineNumber,word.startColumn,pos.lineNumber,word.endColumn),line=model.getLineContent(pos.lineNumber),key=line.match(/^\s*([A-Za-z_]+):/)?.[1],fields=typeof FORMATTER_FIELDS==='undefined'?[]:FORMATTER_FIELDS;
    if(key){const field=fields.find(f=>f.key===key),values=field?.values||(typeof ide.formatterSchemaValues?.[key]==='boolean'?['true','false']:[]);return{suggestions:values.map(v=>({label:String(v),insertText:String(v),range,kind:l.CompletionItemKind.EnumMember}))};}
    const format=/clang-format$/.test(model.uri.fsPath),names=format?Object.keys(ide.formatterSchemaValues||{}):/clang-tidy$/.test(model.uri.fsPath)?['Checks','WarningsAsErrors','HeaderFilterRegex','CheckOptions','FormatStyle']:['CompileFlags','Diagnostics','InlayHints','Index','Completion','Hover'];
    return{suggestions:names.map(name=>({label:name,insertText:name+': ',range,kind:l.CompletionItemKind.Property,documentation:fields.find(f=>f.key===name)?.label||name}))};
  }});
}
