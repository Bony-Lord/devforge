(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioMarkdownEditing=api;})(globalThis,()=>{
 'use strict';
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function typed(text,start,end,char){
  if(typeof char!=='string'||char.length!==1)return null;
  const before=text.slice(0,start),after=text.slice(end),selected=text.slice(start,end),pairs={'[':']','(':')','{':'}','*':'*','_':'_','~':'~','`':'`','$':'$'};
  if(start===end&&/[*_~`]/.test(char)&&before.endsWith(char)&&after.startsWith(char)&&!/[\w]/.test(before.at(-2)||''))return{text:before+char+char+after,start:start+1,end:start+1};
  if(start===end&&after[0]===char&&')]}`*_~$'.includes(char))return{text,start:start+1,end:start+1};
  if(!pairs[char]||/[\\]/.test(before.at(-1)||'')||start===end&&/[*_~`$]/.test(char)&&/[\p{L}\p{N}]/u.test(before.at(-1)||''))return null;
  if(start===end&&after&&!/^[\s\])}*_~`$.,:;!?]/.test(after))return null;
  return{text:before+char+selected+pairs[char]+after,start:start+1,end:end+1};
 }
 function newline(text,start,end){
  const at=text.lastIndexOf('\n',start-1)+1,line=text.slice(at,start),after=text.slice(end),indent=line.match(/^[ \t]*/)[0];let insert='\n'+indent;
  const fence=line.match(/^\s*(`{3,}|~{3,})[^`~]*$/);
  if(fence&&after.startsWith(fence[1]))insert='\n'+indent+'\n'+indent;
  else{const list=line.match(/^(\s*(?:>\s*)*)(?:(?:([-+*])\s+)(\[[ xX]\]\s+)?|(\d+)([.)])\s+)(.*)$/);if(list){if(!list[6].trim())return{text:text.slice(0,at)+insert+after,start:at+insert.length,end:at+insert.length};insert='\n'+list[1]+(list[2]?list[2]+' '+(list[3]?'[ ] ':''):String(Number(list[4])+1)+list[5]+' ');}else if(/^\s*>/.test(line))insert='\n'+line.match(/^\s*(?:>\s*)+/)[0];}
  const caret=start+1+indent.length+(fence?0:insert.length-1-indent.length);return{text:text.slice(0,start)+insert+after,start:caret,end:caret};
 }
 function backspace(text,start,end){if(start!==end||!start)return null;const pairs={'[':']','(':')','{':'}','*':'*','_':'_','~':'~','`':'`','$':'$'};return pairs[text[start-1]]===text[start]?{text:text.slice(0,start-1)+text.slice(start+1),start:start-1,end:start-1}:null;}
 function highlight(text){let fence=false;return String(text).split('\n').map(line=>{if(/^\s*(```|~~~)/.test(line)){fence=!fence;return '<span class="md-token-code">'+escape(line)+'</span>';}if(fence)return '<span class="md-token-code">'+escape(line)+'</span>';if(/^\s{0,3}#{1,6}\s/.test(line))return '<span class="md-token-heading">'+escape(line)+'</span>';let out='',at=0;const pattern=/(`+)[^`\n]*?\1|!?(\[[^\]\n]*\])\([^\)\n]*\)|\$[^$\n]+\$|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~\n]+~~|^\s*(?:>\s*|[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)]\s+)/g;let m;while((m=pattern.exec(line))){out+=escape(line.slice(at,m.index));const value=m[0],kind=value.startsWith('`')?'code':value.startsWith('$')?'math':value.includes('](')?'link':/^[*_~]/.test(value)?'emphasis':'marker';out+='<span class="md-token-'+kind+'">'+escape(value)+'</span>';at=pattern.lastIndex;}return out+escape(line.slice(at));}).join('\n');}
 return Object.freeze({typed,newline,backspace,highlight});
});
