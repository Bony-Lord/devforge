const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let checks=0;
function fixture(){
  const listeners=new Map(),frames=new Map(),classes=new Set();let capture=null,next=0,moves=[],ends=0;
  const element={id:'sidebarResizer',classList:{add(){},remove(){}},setAttribute(){},addEventListener(k,f){const list=listeners.get(k)||[];list.push(f);listeners.set(k,list);},setPointerCapture(id){capture=id;},hasPointerCapture:id=>capture===id,releasePointerCapture(id){capture=null;element.dispatchEvent({type:'lostpointercapture',pointerId:id});},dispatchEvent(e){for(const f of listeners.get(e.type)||[])f(e);}};
  const context={tr:x=>x,Event:class{constructor(type){this.type=type;}},document:{body:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}}},requestAnimationFrame:f=>{frames.set(++next,f);return next;},cancelAnimationFrame:id=>frames.delete(id)};
  vm.createContext(context);vm.runInContext(fs.readFileSync('app/src/main/assets/ui/interaction.js','utf8')+'\nglobalThis.setup=studioResizer;',context);context.setup(element,()=>((x,y)=>moves.push([x,y])));element.addEventListener('studio-resize-end',()=>ends++);
  const send=(type,values={})=>element.dispatchEvent({type,isPrimary:true,button:0,pointerType:'touch',pointerId:1,clientX:100,clientY:100,preventDefault(){},...values});
  return{send,flush(){const pending=[...frames.values()];frames.clear();pending.forEach(f=>f());},get moves(){return moves;},get ends(){return ends;},get dragging(){return classes.has('pane-resizing');}};
}
{
  const f=fixture();f.send('pointerdown',{isPrimary:false});f.send('pointermove',{clientX:150});f.flush();assert.equal(f.moves.length,0);checks++;
  f.send('pointerdown',{button:2});f.send('pointermove',{clientX:150});f.flush();assert.equal(f.moves.length,0);checks++;
}
{
  const f=fixture();f.send('pointerdown');f.send('pointermove',{clientX:105});f.flush();f.send('pointerup');assert.equal(f.moves.length,0);assert.equal(f.ends,0);checks++;
}
{
  const f=fixture();f.send('pointerdown');f.send('pointermove',{clientX:120});f.send('pointermove',{clientX:140});assert.equal(f.moves.length,0);f.flush();assert.deepEqual(f.moves,[[40,0]]);assert.equal(f.dragging,true);checks++;
  f.send('pointercancel');assert.equal(f.dragging,false);assert.equal(f.ends,1);f.send('pointermove',{clientX:200});f.flush();assert.equal(f.moves.length,1);checks++;
  f.send('pointerdown');f.send('pointermove',{pointerId:2,clientX:200});f.flush();assert.equal(f.moves.length,1);f.send('pointerup');checks++;
}
{
  const f=fixture();f.send('pointerdown',{pointerType:'mouse'});f.send('pointermove',{pointerType:'mouse',clientX:106});f.send('lostpointercapture');assert.deepEqual(f.moves,[[6,0]]);assert.equal(f.ends,1);assert.equal(f.dragging,false);checks++;
  f.send('keydown',{key:'ArrowRight',shiftKey:true});assert.deepEqual(f.moves.at(-1),[40,0]);assert.equal(f.ends,2);checks++;
}
console.log(checks+' splitter interaction checks passed');
