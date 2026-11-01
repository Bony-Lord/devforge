'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{Application}=require('../soak/cdp.cjs');
test('visual heuristics detect real defects and ignore clipped-away controls in a real renderer',{timeout:45000},async()=>{
 const app=new Application(path.join(__dirname,'fixtures/visual-browser.cjs'),'unused-profile');
 try{await app.launch();const c=app.cdp;await c.until('!!document.body&&document.body.innerText.includes("Visual audit fixture")');await c.evaluate(await fs.readFile(path.join(__dirname,'../soak/visual.js'),'utf8'));
  async function inspect(html){await c.evaluate('document.body.innerHTML='+JSON.stringify('<style>body{margin:0;background:white}button{width:120px;height:30px}</style>'+html));return(await c.evaluate('__devforgeVisual.inspect()')).issues;}
  let issues=await inspect('<div style="width:60px;height:20px;overflow:hidden"><button id="clipped">Clipped</button></div>');assert(issues.some(i=>i.kind==='control-clipped'&&i.selector==='#clipped'));assert(!issues.some(i=>i.kind==='control-covered'),'its center is clipped away, not covered');
  issues=await inspect('<button id="covered" style="position:absolute;top:50px;left:50px">Covered</button><div style="position:absolute;top:50px;left:50px;width:120px;height:30px;background:red"></div>');assert(issues.some(i=>i.kind==='control-covered'&&i.selector==='#covered'));
  issues=await inspect('<div style="height:40px;overflow:hidden"><button id="visible">Visible</button><div style="height:70px"></div><button id="outside">Clipped away</button></div>');assert(!issues.some(i=>i.selector==='#outside'),'off-clip controls must not be called covered by unrelated panels');
  issues=await inspect('<div style="width:60px;height:25px;overflow:auto"><button id="scrolled">Intentional scroll</button></div>');assert(!issues.some(i=>i.selector==='#scrolled'),'ordinary scroll areas are not clipping defects');
  issues=await inspect('<button hidden id="hidden">Hidden</button><div inert><button id="inert">Inactive</button></div>');assert(!issues.some(i=>['#hidden','#inert'].includes(i.selector)));
  issues=await inspect('<button id="ellipsis" title="Full text" style="width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">A long label with a tooltip</button>');assert(!issues.some(i=>i.kind==='text-clipped'));
  issues=await inspect('<div role="menu" style="width:100px;height:40px;overflow-x:auto"><div style="width:300px">Long content</div></div>');assert(issues.some(i=>i.kind==='popup-horizontal-scroll'));
  issues=await inspect('<div role="menu" style="position:absolute;left:750px;top:10px;width:200px;height:40px">Outside viewport</div>');assert(issues.some(i=>i.kind==='popup-outside-screen'));
  const css=await fs.readFile(path.resolve(__dirname,'../../app/src/main/assets/ui/notebook.css'),'utf8');
  await c.send('Emulation.setDeviceMetricsOverride',{width:480,height:640,deviceScaleFactor:1,mobile:false});
  issues=await inspect('<style>'+css+'</style><style>.notebook-toolbar .icon-button{width:28px;height:28px}.notebook-toolbar .notebook-run-all{display:flex;gap:6px;padding:6px 10px}.icon-button svg{width:15px;height:15px;flex:none}</style><section class="notebook-document" style="position:relative;width:260px;height:200px"><div class="notebook-toolbar"><button class="icon-button">A</button><button class="icon-button">B</button><button class="icon-button notebook-run-all"><svg viewBox="0 0 24 24"></svg><span>Выполнить всё</span></button><button class="icon-button">C</button></div></section>');assert(!issues.some(i=>i.kind==='control-covered'||i.kind==='control-clipped'),'the notebook toolbar wraps full buttons on narrow layouts');
 }finally{await app.close();}
});
