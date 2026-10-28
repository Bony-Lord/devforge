'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {DesktopHost}=require('../host.cjs');
const python=process.env.DEVFORGE_TEST_PYTHON;
test('Python scripts and notebook cells use actual processes, workspace trust and shared state',{skip:!python},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'devforge-python-')),events=[],host=await new DesktopHost(dir,(type,value)=>events.push({type,value})).init();
 try{
  host.ws.prefs.settings.pythonExecutable=python;host.addons.data.profile.resolved=['studio.python','studio.notebooks'];
  const main=path.join(host.ws.root,'main.py'),book=path.join(host.ws.root,'notebook.ipynb');await host.ws.write(main,'import os, sys\nprint(os.getcwd())\nprint(sys.argv[1])\nprint(os.environ["DF_TEST"])\n');await host.ws.write(book,'{}');
  await assert.rejects(()=>host.handle('pythonRun',{path:main,id:'run'}),/WORKSPACE_UNTRUSTED/);await host.handle('workspaceTrustSet',{trusted:true});
  const syntax=await host.handle('pythonCheck',{path:main});assert.equal(syntax.code,0);assert.equal(events.filter(e=>e.type==='output').length,0);const info=await host.handle('pythonInfo');assert(info.available);await host.handle('pythonRun',{path:main,id:'run',args:['Привет'],options:{workingDirectory:'.',environment:{DF_TEST:'42'}}});
  const until=async predicate=>{const stop=Date.now()+15000;while(!predicate()){if(Date.now()>stop)throw Error(JSON.stringify(events).slice(-1500));await new Promise(r=>setTimeout(r,20));}};
  await until(()=>events.some(e=>e.type==='exit'&&e.value.id==='run'));const text=events.filter(e=>e.type==='output'&&e.value.id==='run').map(e=>e.value.text).join('');assert(text.includes('Привет'));assert(text.includes('42'));assert(text.includes(path.resolve(host.ws.root)));
  const session=await host.handle('notebookStart',{path:book});await host.handle('notebookExecute',{path:book,id:'a',code:'answer=40',cell:1});await until(()=>events.some(e=>e.value.id==='a'&&e.value.type==='idle'));
  await host.handle('notebookExecute',{path:book,id:'b',code:'answer+2',cell:2});await until(()=>events.some(e=>e.value.id==='b'&&e.value.type==='idle'));assert(events.some(e=>e.value.id==='b'&&e.value.type==='result'&&e.value.text==='42'&&e.value.session===session.session));
  await fs.mkdir(path.join(host.ws.root,'data'));const changed=await host.handle('notebookStart',{path:book,options:{workingDirectory:'data',environment:{DF_NOTEBOOK_ENV:'configured'}}});assert.notEqual(changed.session,session.session);await host.handle('notebookExecute',{path:book,id:'context',code:'import os\n(os.getcwd(), os.environ["DF_NOTEBOOK_ENV"])',cell:3});await until(()=>events.some(e=>e.value.id==='context'&&e.value.type==='idle'));assert(events.some(e=>e.value.id==='context'&&e.value.type==='result'&&e.value.text.includes('configured')&&e.value.text.includes('data')));
  assert.equal(await host.handle('notebookStop',{session:session.session}),false);assert(host.python.kernel);
  await host.handle('notebookExecute',{path:book,id:'forever',code:'while True: pass',cell:3});await host.handle('notebookStop');assert(!host.python.kernel);await host.handle('notebookStart',{path:book});await host.handle('notebookExecute',{path:book,id:'cleared',code:'answer',cell:4});await until(()=>events.some(e=>e.value.id==='cleared'&&e.value.type==='idle'));assert(events.some(e=>e.value.id==='cleared'&&e.value.ename==='NameError'));
  await host.handle('workspaceTrustSet',{trusted:false});assert(!host.python.kernel);await assert.rejects(()=>host.handle('notebookStart',{path:book}),/WORKSPACE_UNTRUSTED/);
 }finally{await host.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:30,retryDelay:100});}
});
