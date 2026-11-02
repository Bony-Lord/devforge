'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url');
const {Workspace,key}=require('../workspace.cjs'),{readWorkspace,projectsOverlap}=require('../workspace-descriptor.cjs'),{DesktopHost}=require('../host.cjs'),{WorkspaceWatchers}=require('../workspace-watchers.cjs');
async function fixture(t){const data=await fs.mkdtemp(path.join(os.tmpdir(),'devforge-workspace-files-')),ws=await new Workspace(data).init();t.after(()=>fs.rm(data,{recursive:true,force:true}));for(const name of ['one','two','meta'])await fs.mkdir(path.join(data,name));const file=path.join(data,'meta','sample.code-workspace');await fs.writeFile(file,JSON.stringify({folders:[{path:'../one',name:'First'},{path:'../two',name:'Second'}]}));return{ws,data,file};}
test('workspace JSONC supports named relative roots, file URIs, missing folders and canonical deduplication',async t=>{
 const {ws,file,data}=await fixture(t);await fs.writeFile(file,'// fixture\n'+JSON.stringify({folders:[{path:'../one',name:'Named'},{uri:pathToFileURL(path.join(data,'two')).href},{path:'../one'},{path:'../missing'}]}).replace(/]}$/,' ],}'));
 const result=await readWorkspace(file);assert.equal(result.folders.length,3);assert.equal(result.folders[0].name,'Named');assert(result.folders[2].missing);
 const project=await ws.openWorkspace(file);ws.prefs.current=project.project;const tree=await ws.tree();assert.equal(tree.length,3);assert(tree.every(row=>row.workspaceRoot));assert.equal(tree[0].name,'Named');
 const folder=await ws.open(path.join(data,'meta'));assert.notEqual(folder.project,project.project);assert.equal(ws.prefs.projects[project.project].workspaceFile,result.file);
});
test('workspace source edits, history, rename and file-manager trash work in secondary roots',async t=>{
 const {ws,file,data}=await fixture(t),project=await ws.openWorkspace(file);ws.prefs.current=project.project;const source=path.join(data,'two','source.cpp');await ws.write(source,'int original;');await ws.read(source);await ws.write(source,'int changed;');assert.equal((await ws.history(source))[0].text,'int original;');assert.equal((await ws.read(source)).readonly,false);
 const moved=path.join(data,'one','moved.cpp');await ws.move(source,moved);assert.equal((await ws.read(moved)).text,'int changed;');
 const {ProjectItems}=require('../project-items.cjs'),items=new ProjectItems(ws),[record]=await items.handle('projectTrashItems',{paths:[moved]});assert.equal(key(record.root),key(path.join(data,'one')));await items.handle('projectTrashRestore',{ids:[record.id]});assert.equal((await ws.read(moved)).text,'int changed;');
 await assert.rejects(ws.write(path.join(data,'outside.cpp'),'blocked'),/outside project/);await assert.rejects(ws.writable(path.join(data,'one')),/outside project/);
 await fs.symlink(path.join(data,'meta'),path.join(data,'two','escape'),process.platform==='win32'?'junction':'dir');await assert.rejects(ws.write(path.join(data,'two','escape','outside.cpp'),'blocked'),/outside project/);
 ws.projectReadOnly=true;assert((await ws.read(moved)).readonly);await assert.rejects(ws.write(moved,'blocked'),/PROJECT_READ_ONLY/);
});
test('refresh retains workspace settings and updates native roots after an external folder edit',async t=>{
 const {ws,file,data}=await fixture(t),project=await ws.openWorkspace(file);ws.prefs.current=project.project;await fs.writeFile(file,JSON.stringify({folders:[{path:'../two',name:'Renamed'}],settings:{'fixture.kept':42}}));assert(await ws.refreshWorkspace());assert.equal(ws.folders.length,1);assert.equal(ws.folders[0].name,'Renamed');assert.equal(JSON.parse(await fs.readFile(file,'utf8')).settings['fixture.kept'],42);await assert.rejects(ws.writable(path.join(data,'one','old.cpp')),/outside project/);assert.equal(await ws.refreshWorkspace(),false);
});
test('native file creation and class templates use a real root and protect removed roots',async t=>{
 const {ws,file,data}=await fixture(t),project=await ws.openWorkspace(file);ws.prefs.current=project.project;
 const created=await ws.createItem({kind:'empty',extension:'txt'});assert.equal(key(path.dirname(created.path)),key(path.join(data,'one')));
 const files=await ws.createTemplate({kind:'class',name:'Example',namespace:'fixture',directory:path.join(data,'two')});assert.equal(files.length,2);assert(files.every(f=>key(path.dirname(f.path))===key(path.join(data,'two'))));
 const source=files.find(f=>f.path.endsWith('.cpp'));await ws.read(source.path);await fs.writeFile(file,JSON.stringify({folders:[{path:'../one'}]}));await ws.refreshWorkspace();assert((await ws.read(source.path)).readonly);await assert.rejects(ws.write(source.path,'blocked'),/outside project/);
});
test('overlapping folder projects and workspaces share an edit lease while disjoint roots do not',()=>{
 const root=path.resolve('workspace-fixture'),workspace={workspaceFile:path.join(root,'a.code-workspace'),workspaceFolders:[{path:path.join(root,'one')},{path:path.join(root,'two')}]};
 assert(projectsOverlap(workspace,{path:path.join(root,'two')}));assert(projectsOverlap(workspace,{path:path.join(root,'one','nested')}));assert(!projectsOverlap(workspace,{path:path.join(root,'three')}));assert(projectsOverlap(workspace,{...workspace,workspaceFolders:[]}));
 assert(projectsOverlap(workspace,{path:root}));
});
test('watchers report secondary edits and atomic workspace-file replacement without watching the entire parent recursively',async t=>{
 const {file,data}=await fixture(t),events=[],watcher=new WorkspaceWatchers(e=>events.push(e));t.after(()=>watcher.close());watcher.watch({folders:[path.join(data,'one'),path.join(data,'two')],workspaceFile:file});
 await fs.writeFile(path.join(data,'two','changed.cpp'),'changed');const temp=file+'.new';await fs.writeFile(temp,'{"folders":[]}');await fs.rename(temp,file);
 const until=Date.now()+5000;while((!events.some(e=>e.workspaceFile)||!events.some(e=>e.files.some(f=>f.endsWith('/two/changed.cpp'))))&&Date.now()<until)await new Promise(r=>setTimeout(r,50));assert(events.some(e=>e.workspaceFile));assert(events.some(e=>e.files.some(f=>f.endsWith('/two/changed.cpp'))));assert.equal(watcher.roots.size,2);
});
test('native host refuses a folder update conflicting with another window and cannot trash linked project folders',async t=>{
 const {file,data}=await fixture(t),host=await new DesktopHost(path.join(data,'profile'),()=>{},{workspaceFoldersInUse:()=>true}).init();t.after(()=>host.close());const project=await host.handle('openWorkspace',{path:file});await host.handle('project',{name:project.project});
 const state=await host.state();assert.equal(state.workspaceFolders.length,2);assert.equal(state.tree[1].name,'Second');assert.equal((await host.handle('projectDescribe',{id:project.project})).canTrash,false);
 await assert.rejects(host.handle('workspaceCheckFolders',{project:project.project,folders:[{path:path.join(data,'one')}]}),/PROJECT_IN_USE/);host.ws.projectReadOnly=true;await assert.rejects(host.handle('workspaceCheckFolders',{project:project.project,folders:[]}),/PROJECT_READ_ONLY/);
 await fs.writeFile(file,'{"folders": [');const malformed=await host.state();assert(malformed.workspaceError);assert.equal(malformed.workspaceFolders.length,2);assert.equal(await fs.readFile(file,'utf8'),'{"folders": [');
 await fs.writeFile(file,'{"folders":[]}');const repaired=await host.state();assert.equal(repaired.workspaceError,undefined);assert.deepEqual(repaired.workspaceFolders,[]);
});
