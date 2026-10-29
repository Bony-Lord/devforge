'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),paths=require('../app/src/main/assets/ui/project-paths.js');
test('CMake path identity supports Windows drives, both separators, UNC and Unix case sensitivity',()=>{
  assert(paths.equal('C:\\Users\\Test\\main.cpp','/c:/users/test/main.cpp'));assert.equal(paths.normalize('../main.cpp','C:/Project/src'),'c:/Project/main.cpp');assert(paths.equal('\\\\Server\\Share\\A.cpp','//server/share/a.cpp'));assert(!paths.equal('/project/A.cpp','/project/a.cpp'));assert.equal(paths.key('src/../main.cpp','/project'),'/project/main.cpp');
});
test('actual CMake inspector recognizes a main source with Windows model and portable tree paths',async()=>{
  const root='C:/Projects/Example',model={uri:{fsPath:'c:\\projects\\example\\main.cpp',toString:()=> 'file:///c:/projects/example/main.cpp'},getLanguageId:()=> 'cpp'},files=[{name:'CMakeLists.txt',path:root+'/CMakeLists.txt'}];
  const context=vm.createContext({StudioProjectPaths:paths,monaco:{Uri:{file:path=>({toString:()=>path})}},native:async op=>op==='read'?{text:'project(app)\nadd_executable(app main.cpp)\n'}:{files:[]}});vm.runInContext(fs.readFileSync('app/src/main/assets/ui/project-tools.js','utf8')+';globalThis.inspect=projectToolsMethods.inspectCmake;',context);
  const state={state:{root,project:'example'},docs:new Map(),flatFiles:()=>files},result=await context.inspect.call(state,model);assert.equal(result.included,true);assert.equal(result.targets[0].name,'app');
});
