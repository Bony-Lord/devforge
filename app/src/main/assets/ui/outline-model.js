(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioOutline=api;})(globalThis,()=>{
 'use strict';
 function lexical(text,language){
  const roots=[],stack=[];let blockComment=false;
  for(const[source,index]of String(text).split('\n').map((s,i)=>[s,i])){
   const line=source.replace(/\t/g,'    '),trim=line.trim();if(!trim)continue;
   if(trim.startsWith('/*'))blockComment=true;if(blockComment){if(trim.includes('*/'))blockComment=false;continue;}if(trim.startsWith('//')||trim.startsWith('#')&&!['python','markdown'].includes(language))continue;
   let match,kind=12,level=line.length-line.trimStart().length;
   if(language==='python'){match=trim.match(/^(?:async\s+)?(def|class)\s+([\p{L}_][\p{L}\p{N}_]*)/u);if(match)kind=match[1]==='class'?5:12;}
   else if(language==='markdown'){match=trim.match(/^(#{1,6})\s+(.+?)\s*#*$/);if(match){kind=3;level=match[1].length;}}
   else if(language==='json'){match=line.match(/^\s*"((?:[^"\\]|\\.)+)"\s*:/);if(match){match=[match[0],'property',match[1]];kind=7;}}
   else if(['cpp','c','javascript','typescript','java','csharp'].includes(language)){
    match=trim.match(/^(?:(?:export|public|private|static|inline|constexpr|template\s*<[^>]+>)\s+)*(class|struct|enum|namespace)\s+([\w:]+)/);
    if(match)kind=match[1]==='namespace'?3:5;
    else{const fn=trim.match(/^(?!if\b|for\b|while\b|switch\b|return\b|catch\b)(?:[\w:*&<>~]+\s+)*([\w:~]+)\s*\([^;]*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:\{|$)/);if(fn)match=[fn[0],'function',fn[1]];else if(!stack.some(s=>[6,12].includes(s.item.kind))){const field=trim.match(/^(?!return\b|using\b|typedef\b)([\w:<>,*&]+(?:\s+[\w:<>,*&]+)*)\s+([\w]+)\s*(?:;|=|\{)/);if(field){match=[field[0],'field',field[2]];kind=stack.some(s=>s.item.kind===5)?8:13;}}}
   }
   if(!match)continue;while(stack.length&&stack.at(-1).level>=level)stack.pop();let detail='';if(['python','cpp','c'].includes(language)){const nameAt=trim.indexOf(match[2]),suffix=trim.slice(nameAt+match[2].length).replace(/\{.*$/,'').replace(/[:;]$/,'').trim();detail=suffix||([8,13].includes(kind)?trim.slice(0,nameAt).trim():'');}const item={name:match[2],kind,detail,range:{start:{line:index,character:0},end:{line:index,character:source.length}},children:[]};(stack.at(-1)?.item.children||roots).push(item);stack.push({level,item});
  }return roots;
 }
 return Object.freeze({lexical});
});
