(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioCellEditing=api;})(globalThis,()=>{
  'use strict';
  const snapshot=value=>({text:value.text,start:value.start,end:value.end});
  function delta(before,after){
    if(before===after)return null;
    let start=0,a=before.length,b=after.length;
    while(start<a&&start<b&&before.charCodeAt(start)===after.charCodeAt(start))start++;
    if(start>0&&/[\uD800-\uDBFF]/.test(before[start-1]))start--;
    while(a>start&&b>start&&before.charCodeAt(a-1)===after.charCodeAt(b-1)){a--;b--;}
    if(a<before.length&&/[\uDC00-\uDFFF]/.test(before[a])){a++;b++;}
    return{start,end:a,text:after.slice(start,b)};
  }
  const width=options=>Math.max(1,Math.min(16,Number(options?.indentWidth)||4));
  const unit=options=>options?.indentMode==='tabs'?'\t':' '.repeat(width(options));
  const lineAt=(text,position)=>position>0?text.lastIndexOf('\n',position-1)+1:0;
  function indent(text,start,end,options={},reverse=false){
    if(start===end&&!reverse){const column=text.slice(lineAt(text,start),start).replace(/\t/g,' '.repeat(width(options))).length,insert=options.indentMode==='tabs'?'\t':' '.repeat(width(options)-column%width(options));return{text:text.slice(0,start)+insert+text.slice(end),start:start+insert.length,end:start+insert.length};}
    const first=lineAt(text,start),last=end>start&&text[end-1]==='\n'?end-1:end,edits=[];
    for(let at=first;at<=last;){const prefix=text.slice(at).match(/^[ \t]*/)[0],remove=reverse?(prefix[0]==='\t'?1:Math.min(width(options),prefix.match(/^ */)[0].length)):0;edits.push({at,remove,insert:reverse?'':unit(options)});const next=text.indexOf('\n',at);if(next<0)break;at=next+1;}
    const position=p=>{let shift=0;for(const e of edits){if(p<e.at)break;if(p<=e.at+e.remove)return e.at+shift+e.insert.length;shift+=e.insert.length-e.remove;}return p+shift;};
    let result=text;for(const e of [...edits].reverse())result=result.slice(0,e.at)+e.insert+result.slice(e.at+e.remove);
    return{text:result,start:position(start),end:position(end)};
  }
  function pythonContext(text,end){
    let quote='',triple=false,comment=false,line='',lineStart=0;const brackets=[];
    for(let i=0;i<end;i++){
      const c=text[i];if(c==='\n'){comment=false;line='';lineStart=i+1;if(quote&&!triple)quote='';continue;}
      if(comment)continue;
      if(quote){if(c==='\\'){i++;continue;}if(c===quote&&(!triple||text.slice(i,i+3)===quote.repeat(3))){if(triple)i+=2;quote='';}continue;}
      if(c==='#'){comment=true;continue;}
      if(c==='"'||c==="'"){quote=c;triple=text.slice(i,i+3)===c.repeat(3);if(triple)i+=2;line+=' ';continue;}
      if('([{'.includes(c))brackets.push({char:c,indent:text.slice(lineStart,i).match(/^[ \t]*/)[0]});
      else if(')]}'.includes(c)&&brackets.at(-1)?.char==='([{'.charAt(')]}'.indexOf(c)))brackets.pop();
      line+=c;
    }
    return{quote,line,brackets};
  }
  function newline(text,start,end,options={},python=true){
    const lineStart=lineAt(text,start),prefix=text.slice(lineStart,start),base=prefix.match(/^[ \t]*/)[0],context=python&&text.length<=200000?pythonContext(text,start):null;
    let padding=base,tail='';
    if(context&&!context.quote){const bracket=context.brackets.at(-1);if(bracket){padding=bracket.indent+unit(options);if(text[end]===')]}'.charAt('([{'.indexOf(bracket.char)))tail='\n'+bracket.indent;}else if(/^\s*(?:(?:async\s+)?(?:def|for|with)|class|if|elif|else|while|try|except|finally|match|case)\b/.test(context.line)&&/:\s*$/.test(context.line))padding+=unit(options);}
    const insert='\n'+padding+tail,caret=start+1+padding.length;return{text:text.slice(0,start)+insert+text.slice(end),start:caret,end:caret};
  }
  class History {
    constructor(){this.undoStack=[];this.redoStack=[];this.bytes=0;this.group=null;}
    reset(){this.undoStack=[];this.redoStack=[];this.bytes=0;this.group=null;}
    record(before,after,kind='',time=Date.now()){
      if(before.text===after.text)return;
      const group=this.group,merge=kind==='insertText'||kind==='deleteContentBackward';
      if(!(merge&&group?.kind===kind&&time-group.time<700&&group.text===before.text&&group.start===before.start&&before.start===before.end)){this.undoStack.push(snapshot(before));this.bytes+=before.text.length*2;}
      this.redoStack=[];this.group={kind,text:after.text,start:after.start,time};
      while(this.undoStack.length>100||this.bytes>4*1024*1024&&this.undoStack.length>1)this.bytes-=this.undoStack.shift().text.length*2;
    }
    undo(current){const value=this.undoStack.pop();if(!value)return null;this.bytes-=value.text.length*2;this.redoStack.push(snapshot(current));this.group=null;return value;}
    redo(current){const value=this.redoStack.pop();if(!value)return null;this.undoStack.push(snapshot(current));this.bytes+=current.text.length*2;this.group=null;return value;}
  }
  return Object.freeze({delta,indent,newline,History});
});
