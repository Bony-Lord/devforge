import argparse,json,pathlib,subprocess,sys,time
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'));from device_cdp import Device
p=argparse.ArgumentParser();p.add_argument('--project',required=True);p.add_argument('--report',required=True);args=p.parse_args();assert args.project.startswith('input-check-');d=Device();checks=[];created=[];original=None
def js(s):return d.evaluate(s)
def check(name,evidence,ok):
 checks.append({'test':name,'passed':bool(ok),'evidence':evidence});print(('PASS 'if ok else'FAIL ')+name,flush=True);assert ok,str(evidence)
try:
 assert js('forge.state.project')==args.project;js('forge.addons.ready');original=js('forge.addons.profile')
 js("forge.addons.toggle('studio.tool.gcc','1.0.0')");error=js("native('build',{path:forge.state.root+'/main.cpp',mode:'file',options:{compiler:'gcc'}}).then(()=>'',e=>e.message)");check('Disabling compiler addon blocks native compilation',error,bool(error));js("forge.addons.toggle('studio.tool.gcc','1.0.0')")
 js("(async()=>{await native('write',{path:forge.state.root+'/module-view.md',text:'# Safe preview\\n\\n<script>window.ADDON_INJECTION=true</script>'});await forge.openFile(forge.state.root+'/module-view.md');forge.addons.host.openView();})()");value=js("({title:document.querySelector('#addonFileView h1')?.textContent,injected:!!window.ADDON_INJECTION,text:document.querySelector('#addonFileView').textContent})");check('Markdown viewer displays headings and never executes HTML',value,value['title']=='Safe preview'and not value['injected']and'<script>'in value['text']);js("document.querySelector('#addonFileView').close()")
 bundle=json.loads((ROOT/'examples/addons/cpp-workspace.studio-addon').read_text(encoding='utf-8'));bundle['manifest']['id']='input-check.workspace-pack';js('window.workspacePack='+json.dumps(bundle));js('forge.addons.install(workspacePack)');value=js('forge.addons.manager.status()');check('Local addon bundle activates a transitive C++ workspace',value,all(any(e['id']==id for e in value['active'])for id in ['input-check.workspace-pack','studio.pack.cpp-full','studio.pack.cmake','studio.tool.gcc','studio.git']));js("forge.addons.remove('input-check.workspace-pack','1.0.0')")
 name='input-check-addons-040-cmake-'+str(int(time.time()));created.append(name)
 js("forge.newProject();const form=document.querySelector('.studio-mini-form');form.elements.projectName.value="+json.dumps(name)+";form.elements.language.value='cmake-cpp';window.moduleCreateForm=form;");options=js("[...moduleCreateForm.elements.language.options].map(o=>o.value)");check('New Project UI offers addon-provided CMake and empty types',options,'cmake-cpp'in options and'empty'in options);js('moduleCreateForm.onsubmit({preventDefault(){}})');state=js("({project:forge.state.project,buildMode:forge.settings.buildMode,configured:forge.configurations.current()?.options.buildMode,cmake:forge.flatFiles().some(f=>f.path.endsWith('/CMakeLists.txt'))})");check('CMake project type creates files and selects CMake configuration',state,state['project']==name and state['buildMode']=='cmake'and state['configured']=='cmake'and state['cmake'])
 js("forge.build(false)");value=js("document.querySelector('#buildOutput').textContent");check('Created CMake addon project compiles with the runtime provider',value[-1500:],('код 0'in value or'code 0'in value)and not('Ошибка сборки'in value))
 js('forge.switchProject('+json.dumps(args.project)+')');js('forge.addons.apply([])');js("forge.addons.enableTools(['gcc','cmake','analysis'])");value=js('forge.addons.manager.status()');check('Setup bridge enables selected runtime and host providers',value,all(any(e['id']==id for e in value['active'])for id in ['studio.tool.gcc','studio.tool.cmake','studio.clangd','studio.formatter','studio.project.cmake']))
finally:
 try:
  if js('forge.state.project')!=args.project:js('forge.switchProject('+json.dumps(args.project)+')')
  if original is not None:js('forge.addons.apply('+json.dumps(original)+')')
  js("(async()=>{await forge.openFile(forge.state.root+'/main.cpp');await forge.saveAll();})()")
 except Exception:pass
 d.close();path=pathlib.Path(args.report);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps({'checks':checks,'createdProjects':created,'passed':sum(c['passed']for c in checks),'total':len(checks)},ensure_ascii=False,indent=2),encoding='utf-8')
