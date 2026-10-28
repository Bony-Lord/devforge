const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const calls=[],fields=[],events=new Map(),nativeEvents=new Map(),frames=new Map();let observer,sequence=0;
 const document={activeElement:null,body:{},querySelectorAll:()=>fields,addEventListener:(name,fn)=>events.set(name,fn)};
 const forge={settings:{keyboardPrimary:'floating'},addons:{host:{lastFeatures:{keyboard:true},enabled:()=>true}}};
 const context={window:{forge},document,WeakMap,console,queueMicrotask,requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:id=>frames.delete(id),studioTextInput:e=>!!e?.editable,getComputedStyle:e=>({visibility:e.hidden?'hidden':'visible'}),native:async(op,data)=>{calls.push({op,data});return true;},onNative:(name,fn)=>nativeEvents.set(name,fn),MutationObserver:class{constructor(fn){observer=fn;}observe(){}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('app/src/main/assets/ui/web-keyboard.js','utf8')+';globalThis.policy=StudioWebKeyboard;',context);
 function field(mode=null){const attributes=new Map(mode===null?[]:[['inputmode',mode]]),e={editable:true,hidden:false,overlay:null,matches:()=>true,querySelectorAll:()=>[],closest:()=>e.overlay,getBoundingClientRect:()=>({width:100,height:20}),getAttribute:k=>attributes.has(k)?attributes.get(k):null,setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k)};fields.push(e);return e;}
 return{policy:context.policy,context,document,forge,calls,field,events,nativeEvents,mutate:node=>observer([{addedNodes:[node]}]),frame(){const work=[...frames.values()];frames.clear();work.forEach(fn=>fn());}};
}
(async()=>{
 const f=fixture(),a=f.field(),numeric=f.field('decimal');f.policy.init();
 assert.equal(a.getAttribute('inputmode'),'none');assert.equal(numeric.getAttribute('inputmode'),'none');
 f.document.activeElement=a;f.policy.refresh();f.calls.length=0;
 f.document.activeElement=null;f.events.get('focusout')();await Promise.resolve();f.document.activeElement=numeric;f.events.get('focusin')();await Promise.resolve();f.frame();
 assert.equal(f.calls.length,0,'Moving directly between fields must not hide/show the keyboard');
 numeric.overlay={hidden:true};assert.equal(f.policy.field(),null,'A hidden Dockview tab cannot own input even if its child says visible');f.policy.refresh();f.frame();
 assert.equal(f.calls.at(-1).data.focused,false);
 numeric.overlay=null;f.forge.settings.keyboardPrimary='system';f.nativeEvents.get('floatingKeyboardMode')({mode:'system'});f.frame();
 assert.equal(a.getAttribute('inputmode'),null);assert.equal(numeric.getAttribute('inputmode'),'decimal');assert.equal(f.calls.at(-1).op,'keyboard');
 f.forge.settings.keyboardPrimary='floating';f.policy.refresh();const added=f.field('text');f.mutate(added);assert.equal(added.getAttribute('inputmode'),'none','New notebook cells must suppress the IME before first focus');
 f.document.activeElement=added;f.policy.refresh();f.events.get('pointerdown')({target:added});assert.equal(f.calls.at(-1).op,'keyboard','Tapping the focused field reopens a manually hidden keyboard');
 f.context.window.StudioDesktop={};f.policy.refresh();assert.equal(added.getAttribute('inputmode'),'text','Desktop input is not overridden');
 console.log('7 WebView keyboard policy checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
