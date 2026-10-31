(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioFunctionDocs=api;})(globalThis,()=>{
 'use strict';
 const cache=new WeakMap();let providers=[];
 function comments(lines,start,tail,python){
  const result=[];let block=false,at=start,first=true;for(;at<lines.length&&result.length<80;at++){
   let text=first?tail:lines[at].trim();first=false;if(!text.trim())break;text=text.trim();
   if(block){const end=text.indexOf('*/');result.push(text.slice(0,end<0?undefined:end).replace(/^\* ?/,''));if(end>=0){block=false;if(text.slice(end+2).trim())break;}continue;}
   if(text.startsWith('//'))result.push(text.replace(/^\/\/[/!]?\s?/,''));
   else if(python&&text.startsWith('#'))result.push(text.replace(/^#+\s?/,''));
   else if(text.startsWith('/*')){text=text.replace(/^\/\*[* !]?\s?/,'');const end=text.indexOf('*/');result.push(text.slice(0,end<0?undefined:end));block=end<0;if(end>=0&&text.slice(end+2).trim())break;}
   else break;
  }return result.join('\n').trim();
 }
 function index(text,language){
  if(!['c','cpp','python','javascript','typescript','java','csharp'].includes(language)||text.length>2*1024*1024)return[];
  const lines=text.split(/\r?\n/),result=[];let inBlock=false,inString=null;
  for(let line=0;line<lines.length;line++){
   const source=lines[line],trim=source.trim();if(inString){if(trim.includes(inString))inString=null;continue;}if(language==='python'&&(trim.startsWith('"""')||trim.startsWith("'''"))){const quote=trim.slice(0,3);if(!trim.slice(3).includes(quote))inString=quote;continue;}if(inBlock){if(trim.includes('*/'))inBlock=false;continue;}if(trim.startsWith('/*')){inBlock=!trim.includes('*/');continue;}if(trim.startsWith('//')||trim.startsWith('#')&&language!=='python')continue;
   const python=language==='python',match=python?trim.match(/^(?:async\s+)?def\s+([\p{L}_][\p{L}\p{N}_]*)\s*\(/u):trim.match(/^(?!if\b|for\b|while\b|switch\b|return\b|catch\b|throw\b)(?:(?:template\s*<[^>]+>\s*)?)(?:(?:[\w:*&<>~,\[\]]+\s+)+)([\w:~]+)\s*\(/);
   if(!match)continue;let signature=source,end=line,depth=0,started=false,close=-1;
   for(;end<Math.min(line+24,lines.length);end++){if(end!==line)signature+='\n'+lines[end];const scan=lines[end].split('//')[0];for(let i=end===line?scan.indexOf('('):0;i<scan.length;i++){if(scan[i]==='('){depth++;started=true;}else if(scan[i]===')'&&--depth===0&&started){close=i;break;}}if(close>=0)break;}
   if(close<0)continue;const last=lines[end],after=last.slice(close+1),delimiter=python?after.indexOf(':'):after.search(/[;{]/);if(delimiter<0)continue;const tail=after.slice(delimiter+1).trim();if(tail&&!/^(\/\/|\/\*)/.test(tail)&&!(python&&tail.startsWith('#')))continue;
   let description=tail?comments(lines,end,tail,python):end+1<lines.length?comments(lines,end+1,lines[end+1].trim(),python):'';
   if(python&&!description){const next=(lines[end+1]||'').trim(),quote=next.startsWith('"""')?'"""':next.startsWith("'''")?"'''":null;if(quote){let value=next.slice(3),at=end+1;while(!value.includes(quote)&&++at<lines.length&&at<end+80)value+='\n'+lines[at].trim();description=value.split(quote)[0].trim();}}
   if(!description){const preceding=[];for(let i=line-1;i>=0&&preceding.length<80;i--){const value=lines[i].trim();if(value.startsWith('//')||python&&value.startsWith('#'))preceding.unshift(value.replace(python?/^#+\s?/:/^\/\/[/!]?\s?/,''));else break;}description=preceding.join('\n');}
   result.push({name:match[1].split('::').at(-1),line,signature:signature.split(/\{|\/\/|\/\*/)[0].trim(),description});line=end;
  }return result;
 }
 function modelIndex(model){let value=cache.get(model);if(!value||value.version!==model.getVersionId()){value={version:model.getVersionId(),items:index(model.getValue(),model.getLanguageId())};cache.set(model,value);}return value.items;}
 function annotate(symbols,model){const items=modelIndex(model),walk=list=>(list||[]).map(s=>{const line=(s.selectionRange||s.range||s.location?.range)?.start.line,item=items.find(i=>i.line===line&&i.name===s.name.split('(')[0]);return{...s,documentation:item?.description||s.documentation,children:walk(s.children)};});return walk(symbols);}
 function sync(ide,enabled){providers.forEach(p=>p.dispose());providers=[];if(!enabled)return;for(const language of ['cpp','c','python'])providers.push(monaco.languages.registerHoverProvider(language,{provideHover(model,position){const word=model.getWordAtPosition(position);if(!word)return null;const line=model.getLineContent(position.lineNumber);if(!/^\s*\(/.test(line.slice(word.endColumn-1)))return null;const matches=[...ide.docs.values()].filter(d=>d.model.getLanguageId()===model.getLanguageId()&&!d.model.isDisposed()).flatMap(d=>modelIndex(d.model).filter(i=>i.name===word.word&&i.description).map(i=>({...i,path:d.path})));if(!matches.length)return null;const own=matches.find(i=>i.path===model.uri.fsPath&&i.line===position.lineNumber-1),entries=own?[own]:matches.slice(0,4);return{range:new monaco.Range(position.lineNumber,word.startColumn,position.lineNumber,word.endColumn),contents:entries.map(i=>({value:'```'+language+'\n'+i.signature+'\n```\n\n'+i.description.replace(/[\\`*_{}\[\]<>]/g,'\\$&').replaceAll('\n','  \n'),isTrusted:false}))};}}));}
 return Object.freeze({index,annotate,sync});
});
