(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioCppEditing=api;})(globalThis,()=>{
 'use strict';
 function mask(text){return text.replace(/R"([^\s()\\]{0,16})\([\s\S]*?\)\1"|\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g,value=>value.replace(/[^\n]/g,' '));}
 function semicolon(text,offset,typed){
  if(!['{','}'].includes(typed)||offset<1||text.length>1000000)return null;const code=mask(text),at=offset-1;if(code[at]!==typed)return null;let opening=at,closing=at;
  if(typed==='{'){let depth=1;for(closing=at+1;closing<code.length;closing++){if(code[closing]==='{')depth++;if(code[closing]==='}'&&!--depth)break;}if(closing>=code.length)return null;}
  else{let depth=1;for(opening=at-1;opening>=0;opening--){if(code[opening]==='}')depth++;if(code[opening]==='{'&&!--depth)break;}if(opening<0)return null;}
  const boundary=Math.max(code.lastIndexOf(';',opening-1),code.lastIndexOf('{',opening-1),code.lastIndexOf('}',opening-1)),header=code.slice(boundary+1,opening).replace(/^\s*#[^\n]*\n/gm,'').trim();
  const declaration=/^(?:(?:template\s*<[^;{}]*>|typedef|export|alignas\s*\([^)]*\))\s*)*(?:struct|class|union|enum(?:\s+(?:class|struct))?)\b[\w\s:<>,.*&\[\]()]*$/.test(header);if(!declaration)return null;
  const tail=code.slice(closing+1);if(tail.trimStart().startsWith(';')||/^[ \t]*[\w,.[(]/.test(tail))return null;return closing+1;
 }
 function attach(editor){
  const markers=new WeakMap();return editor.onDidType(typed=>{const ide=globalThis.forge,model=editor.getModel(),position=editor.getPosition();if(!model||!position||!['c','cpp'].includes(model.getLanguageId())||ide?.addons?.host.lastFeatures&&!ide.addons.host.enabled('smartTyping')||editor.getSelections().length!==1||editor.getOption(globalThis.monaco.editor.EditorOption.readOnly))return;
   if(typed===';'){const offset=model.getOffsetAt(position),ids=markers.get(model)||[];for(const id of ids){const range=model.getDecorationRange(id);if(range&&model.getOffsetAt(range.getStartPosition())===offset&&model.getValueInRange(range)===';'){const start=model.getPositionAt(offset-1);editor.executeEdits('cpp.skip-terminator',[{range:new monaco.Range(start.lineNumber,start.column,position.lineNumber,position.column),text:''}],editor.getSelections());model.deltaDecorations([id],[]);markers.set(model,ids.filter(value=>value!==id));return;}}return;}
   const offset=semicolon(model.getValue(),model.getOffsetAt(position),typed);if(offset==null)return;const p=model.getPositionAt(offset),selections=editor.getSelections();editor.executeEdits('cpp.declaration-terminator',[{range:new monaco.Range(p.lineNumber,p.column,p.lineNumber,p.column),text:';'}],selections);const ids=markers.get(model)||[];if(ids.length>=1000)model.deltaDecorations(ids.splice(0,500),[]);ids.push(...model.deltaDecorations([],[{range:new monaco.Range(p.lineNumber,p.column,p.lineNumber,p.column+1),options:{stickiness:monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges}}]));markers.set(model,ids);
  });
 }

 return Object.freeze({mask,semicolon,attach});
});
