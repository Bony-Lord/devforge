'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{delta,indent,newline,History}=require('../app/src/main/assets/ui/cell-editing.js');
test('small JSON source changes produce a small edit rather than a whole notebook replacement',()=>{
 const before=JSON.stringify({metadata:{padding:'x'.repeat(200000)},cells:[{source:'print(40)'}]}),after=before.replace('print(40)','print(42)'),edit=delta(before,after);
 assert.equal(edit.text,'2');assert.equal(edit.end-edit.start,1);assert.equal(before.slice(0,edit.start)+edit.text+before.slice(edit.end),after);assert.equal(delta(after,after),null);
});
test('delta round trips Unicode text without cutting a surrogate pair',()=>{
 const alphabet=['a','\n','😀','😁','й','"','\\','🧑‍💻'];let seed=41;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(let i=0;i<1000;i++){const a=Array.from({length:random()*30},()=>alphabet[Math.floor(random()*alphabet.length)]).join(''),b=Array.from({length:random()*30},()=>alphabet[Math.floor(random()*alphabet.length)]).join(''),e=delta(a,b);if(!e){assert.equal(a,b);continue;}assert.equal(a.slice(0,e.start)+e.text+a.slice(e.end),b);assert.ok(!/[\uD800-\uDBFF]$/.test(a.slice(0,e.start)));assert.ok(!/^[\uDC00-\uDFFF]/.test(a.slice(e.end)));}
});
test('Tab inserts to the next stop, with configurable width and real tabs',()=>{
 assert.deepEqual(indent('ab',2,2,{indentWidth:4}),{text:'ab  ',start:4,end:4});assert.equal(indent('',0,0,{indentWidth:2}).text,'  ');assert.equal(indent('',0,0,{indentMode:'tabs'}).text,'\t');
});
test('selected lines indent and outdent without including the following unselected line',()=>{
 const selected=indent('a\nb\nc',0,4,{},false);assert.equal(selected.text,'    a\n    b\nc');const reverted=indent(selected.text,selected.start,selected.end,{},true);assert.equal(reverted.text,'a\nb\nc');
 assert.equal(indent('\nx',0,1,{},false).text,'    \nx');assert.equal(indent('  value',7,7,{},true).text,'value');
});
test('Enter indents Python blocks and ignores colon characters inside comments or strings',()=>{
 for(const source of ['if ready:', 'async def main():', '    else:', 'try: # a comment']){const result=newline(source,source.length,source.length,{});assert.ok(result.text.endsWith('\n'+(source.startsWith('    ')?'        ':'    ')));}
 for(const source of ['print(":")','# if ready:', 'if ready # :'])assert.ok(newline(source,source.length,source.length,{}).text.endsWith('\n'));
 assert.equal(newline('print(":")',10,10,{}).text,'print(":")\n');
});
test('Enter preserves string bodies, tab indentation, Markdown, and multiline continuations',()=>{
 const source='if ready:\n    text = """a:\nb:';assert.equal(newline(source,source.length,source.length,{}).text,source+'\n');
 assert.equal(newline('if x:',5,5,{indentMode:'tabs'}).text,'if x:\n\t');assert.equal(newline('# title:',8,8,{},false).text,'# title:\n');
 const brackets=newline('    values = ()',14,14,{});assert.equal(brackets.text,'    values = (\n        \n    )');assert.equal(brackets.start,23);
});
test('undo groups continuous typing and restores the original selection; redo restores the result',()=>{
 const h=new History(),initial={text:'',start:0,end:0},a={text:'a',start:1,end:1},ab={text:'ab',start:2,end:2};h.record(initial,a,'insertText',10);h.record(a,ab,'insertText',20);assert.deepEqual(h.undo(ab),initial);assert.deepEqual(h.redo(initial),ab);assert.equal(h.redo(ab),null);
});
test('a moved caret, distinct operation, or pause starts a separate undo transaction',()=>{
 const h=new History(),a={text:'a',start:1,end:1},b={text:'ab',start:2,end:2},c={text:'ab\n',start:3,end:3};h.record({text:'',start:0,end:0},a,'insertText',10);h.record(a,b,'insertText',900);h.record(b,c,'newline',901);assert.deepEqual(h.undo(c),b);assert.deepEqual(h.undo(b),a);h.record(a,{text:'ax',start:2,end:2},'insertText',1000);assert.equal(h.redo(a),null);
});
test('history is bounded, and reset drops stale cell edits',()=>{
 const h=new History();for(let i=0;i<150;i++)h.record({text:'a'.repeat(i),start:i,end:i},{text:'a'.repeat(i+1),start:i+1,end:i+1},'paste',i);assert.equal(h.undoStack.length,100);h.reset();assert.equal(h.undo({text:'a',start:1,end:1}),null);
});
