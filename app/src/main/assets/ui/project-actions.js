'use strict';
class StudioProjectActions {
  constructor(ide){this.ide=ide;this.legacyBuild=ide.build.bind(ide);this.legacyDebug=ide.debugBuild.bind(ide);ide.build=run=>this.dispatch(run?'run':'build');ide.debugBuild=()=>this.dispatch('debug');this.running=false;}
  descriptor(kind){return StudioProjectPolicy.action(this.ide.configurations.document,kind);}
  syncAvailability(){const build=!!this.descriptor('build');for(const button of document.querySelectorAll('[data-tool="build"],[data-panel="build"]'))button.hidden=!build;if(!build){if(this.ide.windows?.outputMode==='build')this.ide.windows.show('console');else if(!this.ide.windows&&this.ide.currentPanel==='build')this.ide.showPanel('console');}}
  provider(kind){if(this.ide.state?.capabilities?.projectReadOnly)return null;const action=this.descriptor(kind);if(!action)return null;const entry=this.ide.addons.registry.list('actionProviders').find(e=>e.value.id===action.provider&&e.value.kind===kind);if(!entry)return null;const value=entry.value;
    if(value.feature&&!this.ide.addons.host.enabled(value.feature))return null;
    if(value.compiler){const compiler=this.ide.configurations.current()?.options.compiler||this.ide.settings.compiler||'gcc';if(!this.ide.addons.host.runtimeEnabled(compiler))return null;}return value;
  }
  label(kind){const action=this.descriptor(kind),provider=this.provider(kind);return action?.label||this.ide.addons.local(provider?.label)||({build:'Build',run:'Run',debug:'Debug'})[kind];}
  async dispatch(kind){const action=this.descriptor(kind),provider=this.provider(kind);if(!action||!provider)return;if(this.running||this.ide.busy||this.ide.running)return;this.running=true;this.ide.updateRunButtons();try{return await this.execute(kind,action,provider);}catch(error){safeError(error);}finally{this.running=false;this.ide.updateRunButtons();}}
  async execute(kind,action,provider,overrides){
    const configured=this.ide.configurations.current();let options={...(configured?.options||this.ide.settings),...overrides};
    // Build is an optional action of this configuration, including for interpreted projects.
    if(kind!=='build'&&options.buildBeforeRun!==false){
      const build=this.descriptor('build'),builder=this.provider('build');
      if(build&&!builder)throw Error(this.ide.settings.language==='en'?'Enable the addon required by the build action':'Включите аддон, необходимый выбранному действию сборки');
      if(build&&builder){const result=await this.execute('build',build,builder,kind==='debug'?{optimization:'debug',debugSession:true}:undefined);if(result?.code!==undefined&&result.code!==0)return result;options.executable=result?.exists?result.executable:options.executable;}
    }
    if(typeof provider.execute==='function')return await provider.execute({ide:this.ide,configuration:configured,action,options});
    switch(provider.handler){
      case 'cpp.build':return await this.legacyBuild(false,options);
      case 'cpp.run':return await this.ide.runConfigured({...options,buildBeforeRun:false});
      case 'cpp.debug':return await this.legacyDebug({...options,buildBeforeRun:false});
      case 'cpp.executable':return await this.ide.runConfigured(options);
      case 'python.run':return await this.ide.runPython(false);
      case 'python.check':return await this.ide.runPython(true);
      case 'notebook.runAll':{if(configured?.path&&this.ide.active?.path!==configured.path)await this.ide.openFile(configured.path);const view=StudioDocumentViews.show(this.ide.editor,this.ide.active);return await view?.runAll();}
      case 'process.build':{await this.ide.saveAll();const argv=action.argv;this.ide.showPanel('build');this.ide.clearOutput('build');this.ide.buildId='custom-'+(++this.ide.sequence);const result=await native('build',{mode:'custom',options:{...options,buildCommands:argv?[argv]:options.buildCommands||[]},id:this.ide.buildId});this.ide.appendOutput('build','\n'+(result.code===0?'Build completed':'Build failed')+' · '+result.code+'\n',result.code===0?'success':'failure');return result;}
      case 'process.run':return await this.ide.runConfigured({...options,runCommand:action.argv||options.runCommand,executable:options.executable||''});
      default:throw Error('Action provider unavailable: '+provider.id);
    }
  }
}
