import quickaccess from '@codingame/monaco-vscode-quickaccess-service-override';
import {IWorkbenchThemeService} from '@codingame/monaco-vscode-api/vscode/vs/workbench/services/themes/common/workbenchThemeService.service';
import {IRemoteAgentService} from '@codingame/monaco-vscode-api/vscode/vs/workbench/services/remote/common/remoteAgentService.service';
import {VSBuffer} from '@codingame/monaco-vscode-api/vscode/vs/base/common/buffer';
import {ILanguageFeaturesService} from '@codingame/monaco-vscode-api/vscode/vs/editor/common/services/languageFeatures.service';
import {IMenuService} from '@codingame/monaco-vscode-api/vscode/vs/platform/actions/common/actions.service';
import {MenuId} from '@codingame/monaco-vscode-api/vscode/vs/platform/actions/common/actions';
import {IContextKeyService} from '@codingame/monaco-vscode-api/vscode/vs/platform/contextkey/common/contextkey.service';
import {installNativeSave} from './native-save.js';
import {ITextFileService} from '@codingame/monaco-vscode-api/vscode/vs/workbench/services/textfile/common/textfiles.service';
import {SaveReason} from '@codingame/monaco-vscode-api/vscode/vs/workbench/common/editor';
import {nativeFileOperations} from './file-operations.js';
import {installDirectFileOperations} from './direct-file-operations.js';
import {IWorkingCopyFileService} from '@codingame/monaco-vscode-api/vscode/vs/workbench/services/workingCopy/common/workingCopyFileService.service';
import {FileOperation,createFileSystemProviderError,FileSystemProviderErrorCode} from '@codingame/monaco-vscode-api/vscode/vs/platform/files/common/files';
import {CancellationToken} from '@codingame/monaco-vscode-api/vscode/vs/base/common/cancellation';
import {preferredSideBySideGroupDirection} from '@codingame/monaco-vscode-api/vscode/vs/workbench/services/editor/common/editorGroupsService';
import {columnToEditorGroup} from '@codingame/monaco-vscode-api/vscode/vs/workbench/services/editor/common/editorGroupColumn';
import {applyTextEditorOptions} from '@codingame/monaco-vscode-api/vscode/vs/workbench/common/editor/editorOptions';
import {ScrollType} from '@codingame/monaco-vscode-api/vscode/vs/editor/common/editorCommon';
import {ITextModelService} from '@codingame/monaco-vscode-api/vscode/vs/editor/common/services/resolverService.service';
import {installEditorRouting,nativeEditorOpener,installActiveSourceEditor} from './editor-routing.js';
import {installWorkspaceCreation,installWorkspaceSaving,stopExtensionHosts} from './workspace-creation.js';
import {rewriteWorkspaceFileForNewLocation} from '@codingame/monaco-vscode-api/vscode/vs/platform/workspaces/common/workspaces';
import {IUriIdentityService} from '@codingame/monaco-vscode-api/vscode/vs/platform/uriIdentity/common/uriIdentity.service';
import {IWorkspaceEditingService} from '@codingame/monaco-vscode-api/vscode/vs/workbench/services/workspaces/common/workspaceEditing.service';
import {IEditorResolverService} from '@codingame/monaco-vscode-api/vscode/vs/workbench/services/editor/common/editorResolverService.service';
import {ITestResultService} from '@codingame/monaco-vscode-api/vscode/vs/workbench/contrib/testing/common/testResultService.service';
import {ISCMService} from '@codingame/monaco-vscode-api/vscode/vs/workbench/contrib/scm/common/scm.service';
import {LanguageConfigurationFileHandler} from '@codingame/monaco-vscode-api/vscode/vs/workbench/contrib/codeEditor/common/languageConfigurationExtensionPoint';
import {IExtensionResourceLoaderService} from '@codingame/monaco-vscode-api/vscode/vs/platform/extensionResourceLoader/common/extensionResourceLoader.service';
import {ILanguageService} from '@codingame/monaco-vscode-api/vscode/vs/editor/common/languages/language.service';
import {ILanguageConfigurationService} from '@codingame/monaco-vscode-api/vscode/vs/editor/common/languages/languageConfigurationRegistry.service';
import statusbar from '@codingame/monaco-vscode-view-status-bar-service-override';
import {FileAccess} from '@codingame/monaco-vscode-api/vscode/vs/base/common/network';
import {registerUserData} from './userdata.js';
import environment from '@codingame/monaco-vscode-environment-service-override';
import {getUserConfiguration} from '@codingame/monaco-vscode-configuration-service-override';
import {parse as parseJSONC} from '@codingame/monaco-vscode-api/vscode/vs/base/common/json';
import '@codingame/monaco-vscode-github-authentication-default-extension';
import {IConfigurationService} from '@codingame/monaco-vscode-api/vscode/vs/platform/configuration/common/configuration.service';
import {IWorkspaceContextService} from '@codingame/monaco-vscode-api/vscode/vs/platform/workspace/common/workspace.service';
import {IStorageService} from '@codingame/monaco-vscode-api/vscode/vs/platform/storage/common/storage.service';
import {Emitter} from '@codingame/monaco-vscode-api/vscode/vs/base/common/event';
import '@codingame/monaco-vscode-shellscript-default-extension';
import '@codingame/monaco-vscode-yaml-default-extension';
import '@codingame/monaco-vscode-python-default-extension';
import task from '@codingame/monaco-vscode-task-service-override';
import output from '@codingame/monaco-vscode-output-service-override';
import preferences from '@codingame/monaco-vscode-preferences-service-override';
import storage from '@codingame/monaco-vscode-storage-service-override';
import authentication from '@codingame/monaco-vscode-authentication-service-override';
import secret_storage from '@codingame/monaco-vscode-secret-storage-service-override';
import extension_gallery from '@codingame/monaco-vscode-extension-gallery-service-override';
import chat from '@codingame/monaco-vscode-chat-service-override';
import comments from '@codingame/monaco-vscode-comments-service-override';
import timeline from '@codingame/monaco-vscode-timeline-service-override';
import log from '@codingame/monaco-vscode-log-service-override';
import emmet from '@codingame/monaco-vscode-emmet-service-override';
import accessibility from '@codingame/monaco-vscode-accessibility-service-override';
import workspace_trust from '@codingame/monaco-vscode-workspace-trust-service-override';
import * as monaco from 'monaco-editor';
import {initialize,getService,ICommandService,IEditorService,IFileService,IEditorGroupsService,IOpenerService,IViewsService,IViewDescriptorService,IClipboardService,IStatusbarService,ITerminalService,ITaskService} from '@codingame/monaco-vscode-api';
import {createModelReference} from '@codingame/monaco-vscode-api/monaco';
import {registerExtension,registerRemoteExtension,ExtensionHostKind} from '@codingame/monaco-vscode-api/extensions';
import 'vscode/localExtensionHost';
import configuration,{updateUserConfiguration,reinitializeWorkspace,configurationRegistry,ConfigurationScope} from '@codingame/monaco-vscode-configuration-service-override';
import extensions from '@codingame/monaco-vscode-extensions-service-override';
import remote from '@codingame/monaco-vscode-remote-agent-service-override';
import views,{MonacoEditorService,renderSidebarPart,renderPanelPart,renderEditorPart,renderStatusBarPart,renderActivitybarPar,renderAuxiliaryPart,onPartVisibilityChange,Parts} from '@codingame/monaco-vscode-views-service-override';
import theme from '@codingame/monaco-vscode-theme-service-override';
import textmate from '@codingame/monaco-vscode-textmate-service-override';
import languages from '@codingame/monaco-vscode-languages-service-override';
import model from '@codingame/monaco-vscode-model-service-override';
import keybindings from '@codingame/monaco-vscode-keybindings-service-override';
import debug from '@codingame/monaco-vscode-debug-service-override';
import terminal from '@codingame/monaco-vscode-terminal-service-override';
import testing from '@codingame/monaco-vscode-testing-service-override';
import scm from '@codingame/monaco-vscode-scm-service-override';
import notifications from '@codingame/monaco-vscode-notifications-service-override';
import dialogs from '@codingame/monaco-vscode-dialogs-service-override';
import search from '@codingame/monaco-vscode-search-service-override';
import notebook from '@codingame/monaco-vscode-notebook-service-override';
import '@codingame/monaco-vscode-json-default-extension';
import '@codingame/monaco-vscode-javascript-default-extension';
import '@codingame/monaco-vscode-markdown-basics-default-extension';
import '@codingame/monaco-vscode-cpp-default-extension';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TextmateWorker from '@codingame/monaco-vscode-textmate-service-override/worker?worker';
import ExtensionHostWorker from '@codingame/monaco-vscode-api/workers/extensionHost.worker?worker';
import ExtensionHostWorkerUrl from '@codingame/monaco-vscode-api/workers/extensionHost.worker?worker&url';
import {IExtensionService} from '@codingame/monaco-vscode-api/vscode/vs/workbench/services/extensions/common/extensions.service';
import {IWorkspaceTrustManagementService} from '@codingame/monaco-vscode-api/vscode/vs/platform/workspace/common/workspaceTrust.service';
import {getSingleFolderWorkspaceIdentifier} from '@codingame/monaco-vscode-api/vscode/vs/platform/workspaces/common/workspaceIdentifier';
class NativeStorageDatabase{
 constructor(scope){this.scope=scope;this.events=new Emitter();this.onDidChangeItemsExternal=this.events.event;this.off=globalThis.onNative('codeossStorageChanged',change=>{if(change.scope===scope)this.events.fire({changed:new Map(change.insert),deleted:new Set(change.delete)});});}
 async getItems(){return new Map(await globalThis.native('codeossStorage',{scope:this.scope,action:'read'}));}
 async updateItems(request){await globalThis.native('codeossStorage',{scope:this.scope,action:'write',insert:[...(request.insert||[])],delete:[...(request.delete||[])]});}
 async optimize(){}
 async close(){this.off();this.events.dispose();}
}
const storageOverrides=()=>storage(globalThis.StudioDesktop?{databaseFactories:{[-1]:()=>new NativeStorageDatabase('application'),[0]:(_accessor,profile)=>new NativeStorageDatabase('profile:'+profile.id),[1]:(_accessor,workspace)=>new NativeStorageDatabase('workspace:'+(workspace.uri?.fsPath||workspace.configPath?.fsPath||'empty').toLowerCase())}}:undefined);
const secretStorageProvider={type:'persisted',get:async key=>(await globalThis.native('codeossSecret',{action:'get',key}))??undefined,set:async(key,value)=>{await globalThis.native('codeossSecret',{action:'set',key,value});},delete:async key=>{await globalThis.native('codeossSecret',{action:'delete',key});},keys:()=>globalThis.native('codeossSecret',{action:'keys',key:''})};
function workspaceId(root){return 'devforge-'+getSingleFolderWorkspaceIdentifier(monaco.Uri.file(root.replaceAll('\\','/').toLowerCase())).id;}
export async function boot({info,root,workspaceFile='',workspaceFolders,workspaceChanged,checkWorkspaceFolders,createWorkspace,pickWorkspaceSave,saveWorkspaceAs,activeSourceEditor,container,openEditor,showExtensionEditor,openWorkspace,saveDocument,documentResolved,fileOperationChanged,webviewEndpoint,readOnly=false,trusted=false}){
 globalThis.devforgeWorkspaceReadOnly=readOnly;
 globalThis.MonacoEnvironment={getWorker(_id,label){return label==='extensionHostWorkerMain'?new ExtensionHostWorker():label==='TextMateWorker'?new TextmateWorker():new EditorWorker();},getWorkerUrl(_id,label){if(label==='extensionHostWorkerMain')return new URL(ExtensionHostWorkerUrl,import.meta.url).href;},getWorkerOptions(){return{type:'module'};}};
 const uri=file=>monaco.Uri.file(file).with({scheme:'vscode-remote',authority:info.authority});await registerUserData();const callbacks=new Emitter();if(globalThis.StudioDesktop)globalThis.onNative('codeossCallback',components=>callbacks.fire(monaco.Uri.from(components)));const urlCallbackProvider={onCallback:callbacks.event,create(components){const id=crypto.randomUUID();globalThis.native('codeossCallback',{id,components}).catch(console.error);return monaco.Uri.parse(info.callbackBase+id);}};
 await initialize({...configuration(),...extensions({enableWorkerExtensionHost:true}),...remote({scanRemoteExtensions:false}),...model(),...languages(),...theme(),...textmate(),...keybindings(),...views(openEditor,info.webviewDomain,state=>({...state,editor:{...state.editor,restoreEditors:false},views:{...state.views,defaults:[],containerToRestore:{}}})),...quickaccess({shouldUseGlobalPicker:()=>true,isKeybindingConfigurationVisible:()=>true}),...statusbar(),...debug(),...terminal(),...testing(),...scm(),...notifications(),...dialogs(),...search(),...notebook(),...task(),...output(),...preferences(),...storageOverrides(),...authentication(),...secret_storage(),...extension_gallery({webOnly:false}),...chat(),...comments(),...timeline(),...log(),...emmet(),...accessibility(),...workspace_trust()},container,{remoteAuthority:info.authority,serverBasePath:info.serverBasePath,connectionToken:info.token,enabledExtensionProposedApi:[],urlCallbackProvider,secretStorageProvider:globalThis.StudioDesktop?secretStorageProvider:undefined,productConfiguration:{nameShort:'DevForge',nameLong:'DevForge',applicationName:'devforge',urlProtocol:'devforge',commit:info.commit,quality:info.quality,version:'1.142.0',extensionsGallery:{serviceUrl:'https://open-vsx.org/vscode/gallery',itemUrl:'https://open-vsx.org/vscode/item'}},workspaceProvider:{workspace:workspaceFile?{workspaceUri:uri(workspaceFile),id:workspaceId(workspaceFile)}:root?{folderUri:uri(root),id:workspaceId(root)}:undefined,trusted:trusted&&!readOnly,handlesWindowOpening:!!openWorkspace,open:async(workspace,options)=>{if(!openWorkspace)throw Error('Workspace opening is unavailable');return openWorkspace(workspace,options);}},webviewEndpoint,developmentOptions:{logLevel:2},configurationDefaults:{'telemetry.telemetryLevel':'off','workbench.startupEditor':'none','terminal.integrated.enablePersistentSessions':false,'terminal.integrated.hideOnStartup':'always','workbench.editor.enablePreview':false,'security.workspace.trust.enabled':true,'workbench.enableExperiments':false,'chat.disableAIFeatures':true,'extensions.autoCheckUpdates':false,'extensions.autoUpdate':false}});
 if(globalThis.StudioDesktop){const clipboard=await getService(IClipboardService);clipboard.readText=async()=>globalThis.native('clipboardRead');clipboard.writeText=async text=>{await globalThis.native('clipboardWrite',{text});};}
 if(globalThis.StudioDesktop)(await getService(IOpenerService)).setDefaultExternalOpener({openExternal:href=>globalThis.native('codeossExternal',{url:href})});
 if(activeSourceEditor){const editorService=await getService(IEditorService),getter=Object.getOwnPropertyDescriptor(MonacoEditorService.prototype,'activeTextEditorControl').get;installActiveSourceEditor(editorService,activeSourceEditor,()=>getter.call(editorService));}
 const editorRouting=showExtensionEditor?installEditorRouting({editorService:await getService(IEditorService),resolver:await getService(IEditorResolverService),groups:await getService(IEditorGroupsService),extensions:await getService(IExtensionService),showEditor:showExtensionEditor,columnGroup:async column=>columnToEditorGroup((await getService(IEditorGroupsService)).mainPart,await getService(IConfigurationService),column),sideGroup:async()=>{const groups=await getService(IEditorGroupsService),direction=preferredSideBySideGroupDirection(await getService(IConfigurationService)),part=groups.mainPart;return part.findGroup({direction})||part.addGroup(part.activeGroup,direction);},openNative:nativeEditorOpener({textModels:await getService(ITextModelService),openEditor,applyOptions:(options,editor)=>applyTextEditorOptions(options,editor,ScrollType.Immediate)}),openWorkbench:(input,options,group)=>getService(IEditorService).then(service=>MonacoEditorService.prototype.openEditor.call(service,input,options,group))}):null;
 const normalizePath=path=>path?.replaceAll('\\','/').replace(/^\/([a-z]:\/)/i,'$1').toLowerCase();const access={};const updateWorkspaceAccess=(root,{workspaceFile='',workspaceFolders,readOnly=false}={})=>Object.assign(access,{root:normalizePath(root),roots:[...(workspaceFolders|| (root?[{path:root}]:[])).map(folder=>normalizePath(folder.path)),...workspaceFile?[normalizePath(root)+'/.devforge',normalizePath(root)+'/.forge']:[]],workspaceFile:normalizePath(workspaceFile),readOnly});updateWorkspaceAccess(root,{workspaceFile,workspaceFolders,readOnly});const managed=resource=>{if(!resource||resource.scheme!=='vscode-remote'||resource.authority!==info.authority)return false;const path=normalizePath(resource.fsPath);return !!path&&(path===access.workspaceFile||access.roots.some(own=>path===own||path.startsWith(own+'/')));};const filesService=await getService(IFileService);const guard=resource=>{if(!access.readOnly||!resource||resource.scheme!=='vscode-remote')return;if(managed(resource))throw createFileSystemProviderError('PROJECT_READ_ONLY: This project is open read-only',FileSystemProviderErrorCode.NoPermissions);};for(const method of ['writeFile','createFile','createFolder','del','move','copy','cloneFile']){const original=filesService[method];if(typeof original!=='function')continue;delete filesService[method];filesService[method]=async function(...args){if(method==='copy'||method==='cloneFile')guard(args[1]);else{guard(args[0]);if(method==='move')guard(args[1]);}return original.apply(this,args);};}
 // Extension workspace.fs can address the provider directly, bypassing IFileService.
 const protectedProviders=new WeakSet();const protectProvider=remoteProvider=>{if(!remoteProvider||protectedProviders.has(remoteProvider))return;protectedProviders.add(remoteProvider);
 const descriptors=new Map();for(const method of ['writeFile','mkdir','delete','rename','copy','cloneFile']){const original=remoteProvider[method];if(typeof original!=='function')continue;remoteProvider[method]=async function(...args){if(method==='copy'||method==='cloneFile')guard(args[1]);else{guard(args[0]);if(method==='rename')guard(args[1]);}return original.apply(this,args);};}
 if(remoteProvider.open&&remoteProvider.write){const open=remoteProvider.open,write=remoteProvider.write,close=remoteProvider.close;remoteProvider.open=async function(resource,options){if(options?.create)guard(resource);const fd=await open.call(this,resource,options);descriptors.set(fd,resource);return fd;};remoteProvider.write=async function(fd,...args){guard(descriptors.get(fd));return write.call(this,fd,...args);};remoteProvider.close=async function(fd){try{return await close.call(this,fd);}finally{descriptors.delete(fd);}};}};protectProvider(filesService.getProvider('vscode-remote'));filesService.onDidChangeFileSystemProviderRegistrations(event=>{if(event.added&&event.scheme==='vscode-remote')protectProvider(event.provider);});
 if(workspaceFile)await (await getService(IConfigurationService)).reloadConfiguration();
 const trustService=await getService(IWorkspaceTrustManagementService);await trustService.workspaceTrustInitialized;await trustService.resolveCanonicalUris();await trustService.setWorkspaceTrust(trusted&&!readOnly);
 const workspaceContext=await getService(IWorkspaceContextService);
 if(createWorkspace)installWorkspaceCreation({editing:await getService(IWorkspaceEditingService),context:workspaceContext,configuration:await getService(IConfigurationService),properties:()=>configurationRegistry.getConfigurationProperties(),windowScope:ConfigurationScope.WINDOW,create:createWorkspace});
 const uriIdentity=await getService(IUriIdentityService);
 if(pickWorkspaceSave&&saveWorkspaceAs)installWorkspaceSaving({editing:await getService(IWorkspaceEditingService),context:workspaceContext,pick:pickWorkspaceSave,save:saveWorkspaceAs,equals:(a,b)=>uriIdentity.extUri.isEqual(a,b)});
 if(workspaceChanged)workspaceContext.onDidChangeWorkspaceFolders(()=>Promise.resolve(workspaceChanged()).catch(console.error));
 if(checkWorkspaceFolders){
  const update=workspaceContext.doUpdateFolders;if(typeof update!=='function')throw Error('Pinned workspace folder update implementation changed');
  workspaceContext.doUpdateFolders=async function(add,remove,index){
   const removed=new Set(remove.map(uri=>normalizePath(uri.fsPath))),folders=this.getWorkspace().folders.filter(folder=>!removed.has(normalizePath(folder.uri.fsPath))).map(folder=>({uri:folder.uri,name:folder.name}));
   folders.splice(typeof index==='number'?index:folders.length,0,...add);
   await checkWorkspaceFolders(folders);return update.call(this,add,remove,index);
  };
 }
 const statusService=await getService(IStatusbarService);for(const id of ['status.host','status.editor.selection','status.editor.indentation','status.editor.encoding','status.editor.eol','status.editor.mode','status.editor.info'])statusService.updateEntryVisibility(id,false);
 const releaseWorkspace=async()=>{const tasks=await getService(ITaskService);for(const task of await tasks.getActiveTasks())await tasks.terminate(task);const terminals=await getService(ITerminalService);await Promise.all([...terminals.instances].map(instance=>terminals.safeDisposeTerminal(instance)));await setWorkspace('',{readOnly:true});};
 const preparedLanguages=new Map();const prepareLanguage=async language=>{const service=await getService(ILanguageService),files=service.getConfigurationFiles(language),key=language+':'+files.map(f=>f.toString()).join('|');if(!preparedLanguages.has(key))preparedLanguages.set(key,(async()=>{const loader=await getService(IExtensionResourceLoaderService),configurations=await getService(ILanguageConfigurationService);for(const file of files){const config=parseJSONC(await loader.readExtensionResource(file));configurations.register(language,LanguageConfigurationFileHandler.extractValidConfig(language,config),50);}service.requestRichLanguageFeatures(language);})());return preparedLanguages.get(key);};
 const bridge=registerExtension({publisher:'devforge-native',name:'command-bridge',version:'1.0.0',engines:{vscode:'*'}},ExtensionHostKind.LocalProcess,{system:true});await bridge.whenReady();
 let changes=Promise.resolve();const serialize=action=>{const task=changes.catch(()=>{}).then(action);changes=task;return task;};
 const disposeExtension=registration=>serialize(async()=>{const service=await getService(IExtensionService),description=service.extensions.find(e=>e.identifier.value.toLowerCase()===registration.id.toLowerCase());if(!description||service.canRemoveExtension(description))return registration.dispose();const status=service.getExtensionsStatus()[registration.id],kind=status?.runningLocation?.kind;if(!kind||!service._extensionHostManagers?.getByKind||!service._extensionStatus)throw Error('Pinned Code OSS lifecycle implementation changed');await stopExtensionHosts(service,[kind]);for(const item of service._extensionStatus.values())if(service._runningLocations.getRunningLocation(item.id)?.kind===kind)item.clearRuntimeStatus();try{await registration.dispose();}finally{if(!access.readOnly){service._startExtensionHostsIfNecessary(false,Array.from(service._allRequestedActivateEvents.keys()));service._startOnDemandExtensionHosts();}}});
 const prepareWorkspaceSave=()=>serialize(async()=>{const service=await getService(IExtensionService);await stopExtensionHosts(service,[ExtensionHostKind.Remote,ExtensionHostKind.LocalWebWorker]);await (await getService(IStorageService)).flush();});
 const setWorkspace=(root,{trusted=false,readOnly=false,workspaceFile='',workspaceFolders}={})=>serialize(async()=>{globalThis.devforgeWorkspaceReadOnly=readOnly;updateWorkspaceAccess(root,{workspaceFile,workspaceFolders,readOnly});const service=await getService(IExtensionService);for(const kind of [ExtensionHostKind.Remote,ExtensionHostKind.LocalWebWorker]){await stopExtensionHosts(service,[kind]);for(const status of service._extensionStatus.values())if(service._runningLocations.getRunningLocation(status.id)?.kind===kind)status.clearRuntimeStatus();}const identifier=workspaceFile?{id:workspaceId(workspaceFile),configPath:uri(workspaceFile)}:root?getSingleFolderWorkspaceIdentifier(uri(root),workspaceId(root)):{id:'devforge-empty'},storageService=await getService(IStorageService);if(!storageService.hasScope(identifier))await storageService.switch(identifier,false);await reinitializeWorkspace(identifier);await (await getService(IConfigurationService)).reloadConfiguration();const trust=await getService(IWorkspaceTrustManagementService);await trust.resolveCanonicalUris();await trust.setWorkspaceTrust(trusted&&!readOnly);if(!readOnly){service._startExtensionHostsIfNecessary(false,Array.from(service._allRequestedActivateEvents.keys()));service._startOnDemandExtensionHosts();}});

 if(documentResolved)(await getService(ITextFileService)).files.onDidResolve(({model})=>{if(!model.isDirty()&&model.textEditorModel)documentResolved(model.resource,model.textEditorModel.getValue());});
 const nativeSave=saveDocument?installNativeSave({textFiles:await getService(ITextFileService),fileService:filesService,commit:saveDocument}):null;
 const fileOperation=nativeFileOperations(await getService(IWorkingCopyFileService),{uri,operations:{create:FileOperation.CREATE,move:FileOperation.MOVE,copy:FileOperation.COPY,delete:FileOperation.DELETE},token:CancellationToken.None});
 if(fileOperationChanged){const direct=installDirectFileOperations({fileService:filesService,workingCopies:await getService(IWorkingCopyFileService),notify:fileOperationChanged,managed});direct.wrapProvider(filesService.getProvider('vscode-remote'));filesService.onDidChangeFileSystemProviderRegistrations(event=>{if(event.added&&event.scheme==='vscode-remote')direct.wrapProvider(event.provider);});}
 if(fileOperationChanged){const service=await getService(IWorkingCopyFileService),names={[FileOperation.CREATE]:'create',[FileOperation.MOVE]:'move',[FileOperation.COPY]:'copy',[FileOperation.DELETE]:'delete'};for(const [phase,event]of [['before',service.onWillRunWorkingCopyFileOperation],['after',service.onDidRunWorkingCopyFileOperation],['failed',service.onDidFailWorkingCopyFileOperation]])event(e=>{if(!fileOperation.isNativeEvent(e))e.waitUntil(Promise.resolve(fileOperationChanged({transaction:'upstream-'+e.correlationId,phase,operation:names[e.operation],files:e.files})));});}
 const remoteConfiguration=async()=>{const environment=await(await getService(IRemoteAgentService)).getEnvironment();if(!environment?.settingsPath)throw Error('Remote extension settings are unavailable');return environment.settingsPath;};
 const getRemoteUserConfiguration=async()=>{try{return parseJSONC((await filesService.readFile(await remoteConfiguration())).value.toString())||{};}catch(error){if(error.fileOperationResult===1)return{};throw error;}};
 return {monaco,configurationScope:key=>configurationRegistry.getConfigurationProperties()[key]?.scope,getRemoteUserConfiguration,updateRemoteUserConfiguration:async values=>{await filesService.writeFile(await remoteConfiguration(),VSBuffer.fromString(JSON.stringify(values,null,2)));await(await getService(IConfigurationService)).reloadConfiguration();},
  getWorkbenchTheme:async()=>{const theme=(await getService(IWorkbenchThemeService)).getColorTheme();return Object.fromEntries(['editor.background','editor.foreground','sideBar.background','sideBar.foreground','panel.background','activityBar.background','input.background','input.foreground','button.background','focusBorder'].map(id=>[id,theme.getColor(id)?.toString()]));},
  hasLanguageProvider:async(model,feature='documentSymbolProvider')=>(await getService(ILanguageFeaturesService))[feature]?.has(model)===true,
  explorerActions:async(resource,folder,allowed,selected=[resource])=>{const context=(await getService(IContextKeyService)).createOverlay([['resource',resource],['resourceScheme',resource.scheme],['resourceFilename',resource.path.split('/').pop()],['resourceDirname',resource.path.slice(0,resource.path.lastIndexOf('/'))],['resourceExtname',/\.[^.\/]+$/.exec(resource.path)?.[0]||''],['explorerResourceIsFolder',folder],['explorerResourceReadonly',access.readOnly],['resourceLangId',monaco.editor.getModel(resource)?.getLanguageId()||'']]),menu=(await getService(IMenuService)).createMenu(MenuId.ExplorerContext,context);try{const ids=new Set(allowed),walk=actions=>actions.flatMap(action=>action.actions?walk(action.actions):ids.has(action.id)?[{id:action.id,label:action.label,enabled:action.enabled,run:()=>action.run(selected)}]:[]);return menu.getActions({arg:resource,shouldForwardArgs:true}).flatMap(([,actions])=>walk(actions));}finally{menu.dispose();context.dispose?.();}},
  prepareWorkspaceSave,workspaceIdentity:file=>file?workspaceId(file):'devforge-empty',workspaceStorageScope:file=>'workspace:'+(file?uri(file).fsPath:'empty').toLowerCase(),revertWorkspaceDocument:async resource=>(await getService(ITextFileService)).files.get(resource)?.revert(),rewriteWorkspace:(text,from,to)=>{const errors=[];parseJSONC(text,errors,{allowTrailingComma:true});if(errors.length)throw Error('Invalid workspace JSONC');return rewriteWorkspaceFileForNewLocation(text,monaco.Uri.file(from),false,monaco.Uri.file(to),uriIdentity.extUri);},fileOperation,saveDocument:(resource,reason=SaveReason.EXPLICIT)=>nativeSave(resource,reason),openResource:(resource,options)=>editorRouting?.openResource(resource,options)??false,prepareLanguage,vscode:await bridge.getApi(),resourceUrl:file=>FileAccess.asBrowserUri(uri(file)).toString(),getUserConfiguration:async()=>{try{return parseJSONC(await getUserConfiguration())||{};}catch(error){if(error.fileOperationResult===1)return{};throw error;}},uri,createModelReference,registerExtension,registerRemoteExtension,ExtensionHostKind,updateUserConfiguration:async value=>{await updateUserConfiguration(value);await(await getService(IConfigurationService)).reloadConfiguration();},reinitializeWorkspace,getService,IWorkspaceEditingService,ICommandService,IEditorService,IFileService,IExtensionService,IEditorGroupsService,IViewsService,IViewDescriptorService,ISCMService,ITestResultService,disposeExtension,setWorkspace,updateWorkspaceAccess,releaseWorkspace,renderSidebarPart,renderPanelPart,renderEditorPart,renderStatusBarPart,renderActivitybarPar,renderAuxiliaryPart,onPartVisibilityChange,Parts,execute:async(command,...args)=>(await bridge.getApi()).commands.executeCommand(command,...args)};
}
