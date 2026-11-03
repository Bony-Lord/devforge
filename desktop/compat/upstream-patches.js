function replace(source,before,after,label){if(!source.includes(before))throw Error('Pinned upstream patch no longer applies: '+label);return source.replace(before,after);}
export function upstreamPatches(){return{name:'devforge-upstream-integration',enforce:'pre',transform(source,file){const id=file.replaceAll('\\','/');
 if(id.endsWith('/vs/workbench/contrib/extensions/browser/extensionsWorkbenchService.js')){
 source=replace(source,'const resourceExtensions = await this.extensionManagementService.getExtensions(locations);',`const resourceExtensions = (await Promise.all(locations.map(async location => {
            try { return (await this.extensionManagementService.getExtensions([location]))[0]; }
            catch (error) {
                // A queued additions event can outlive an intentional unload.
                if (error.fileOperationResult === 1 && !this.extensionService.extensions.some(e => e.extensionLocation.toString() === location.toString())) return undefined;
                throw error;
            }
        }))).filter(Boolean);`,'ignore only stale resource lookups for extensions removed during an asynchronous running-extension update');
 source=replace(source,'const extensions = await this.getExtensions(extensionsToFetch.map(e => ({\n                id: e.identifier.value,\n                uuid: e.uuid\n            })), CancellationToken.None);','const extensions = await this.getResourceExtensions(extensionsToFetch.map(e => e.extensionLocation), true);','local registered extensions do not require a gallery connection');
 return replace(source,'const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();\n        const pager = await this.galleryService.query(options, token);','const [extensionsControlManifest, pager] = await Promise.all([this.galleryService.getExtensionsControlManifest(), this.galleryService.query(options, token)]);','catalog uses its own gallery metadata in parallel; installation still validates through remote management');
 }
 if(id.endsWith('/@codingame/monaco-vscode-views-service-override/index.js')){
  source=replace(source,'const observer = new ResizeObserver(() => layoutPart(part));','let frame; const observer = new ResizeObserver(() => { if (frame === undefined) frame = requestAnimationFrame(() => { frame = undefined; layoutPart(part); }); });','defer workbench layout outside ResizeObserver delivery');
  return replace(source,'return observer.disconnect();','if (frame !== undefined) cancelAnimationFrame(frame); return observer.disconnect();','cancel detached workbench layout');
 }
 if(id.endsWith('/@xterm/addon-ligatures/lib/addon-ligatures.mjs'))return replace(source,'import{tracingChannel as $p,channel as Xp}from"node:diagnostics_channel";var Ce=Xp("lru-cache:metrics"),Mn=$p("lru-cache"),','import{metrics as Ce,tracing as Mn}from"devforge-terminal-cache-browser";var ','use the cache publisher browser diagnostics implementation in the ligatures browser bundle');
 if(id.endsWith('/@codingame/monaco-vscode-api/extensions.js')){
  source=replace(source,'const location = URI.from({ scheme: CustomSchemas.extensionFile, authority: id, path });','const location = URI.from({ scheme: extHostKind === ExtensionHostKind.Remote ? Schemas.vscodeRemote : CustomSchemas.extensionFile, authority: extHostKind === ExtensionHostKind.Remote ? StandaloneServices.get(IWorkbenchEnvironmentService).remoteAuthority : id, path });','remote registration identity');
  source=replace(source,'...extension,\n                    manifest: await translator.translateManifest','...extension,\n                    location: realLocation,\n                    manifest: await translator.translateManifest','remote resource location');
  return replace(source,'await deltaExtensions({ toAdd: [localizedExtension]','extension.location = realLocation;\n                await deltaExtensions({ toAdd: [localizedExtension]','remote removal identity');
 }
 if(id.endsWith('/@codingame/monaco-vscode-extensions-service-override/index.js'))return replace(source,'    createExtensionHost(runningLocations, runningLocation, isInitialStart) {','    createExtensionHost(runningLocations, runningLocation, isInitialStart) {\n        if (globalThis.devforgeWorkspaceReadOnly && runningLocation.kind !== ExtensionHostKind.LocalProcess) return null;','read-only windows keep the local command bridge without launching Node or worker extension hosts');
 if(id.endsWith('/vs/workbench/contrib/extensions/browser/extensionEditor.js')){
  source=replace(source,'import { editorBackground }', 'import { editorBackground, editorForeground }','README uses the active editor palette');
  return replace(source,'                        padding-bottom: 75px;','                        padding-bottom: 75px;\n                        background-color: ${this.themeService.getColorTheme().getColor(editorBackground)};\n                        color: ${this.themeService.getColorTheme().getColor(editorForeground)};','README has an explicit theme background in the webview');
 }
 if(id.endsWith('/vs/workbench/contrib/extensions/browser/extensionsViews.js')){
  source=replace(source,'request.finally(() => this.queryRequest = null);','const clearRequest = () => { if (this.queryRequest?.request === request) this.queryRequest = null; };\n        request.then(clearRequest, clearRequest);','observe search cancellation without an orphan finally rejection or clearing a newer query');
  source=replace(source,'this.queryResult = await this.query(parsedQuery, options, token);','const result = await this.query(parsedQuery, options, token);\n                if (token.isCancellationRequested) { result.disposables.dispose(); return new PagedModel([]); }\n                this.queryResult = result;','discard cancelled gallery responses before touching a replacement view');
  source=replace(source,'this.searchWaitPromise = queryPromise.then(null, null);','this.searchWaitPromise = queryPromise.then(() => undefined, () => undefined);','telemetry observes completion without duplicating the caller-owned query rejection');
  return replace(source,'this.reportSearchFinishedDelayer.trigger(() => this.reportSearchFinished());','this.reportSearchFinishedDelayer.trigger(() => this.reportSearchFinished()).catch(error => { if (!isCancellationError(error)) this.logService.error(error); });','observe a pending search report cancelled by view disposal');
 }
 if(id.endsWith('/vs/workbench/contrib/extensions/browser/extensionsViewlet.js')){
  source=replace(source,'this.showExtensionsViews(addedViews);','this.showExtensionsViews(addedViews).catch(error => this.onError(error));','observe pending searches when contributed views are disposed or replaced');
  source=replace(source,'this.doSearch(true);','this.doSearch(true).catch(error => this.onError(error));','observe a refresh cancelled by another gallery query');
  return replace(source,'}, () => promise);','}, () => promise.catch(error => { if (!isCancellationError(error)) throw error; }));','settle expected gallery cancellation before handing the task to progress cleanup');
 }
 if(id.endsWith('/backgroundTokenization/textMateWorkerTokenizerController.js')){
  const start=source.indexOf('        if (!this._applyStateStackDiffFn || !this._initialState) {');const end=source.indexOf('        for (const d of stateDeltas)',start);if(start<0||end<start)throw Error('Pinned upstream tokenizer initialization changed');const initialization=replace(source.slice(start,end),"await import('@codingame/monaco-vscode-api/_virtual/main').then(function (n) { return n.main; })",'devforgeTextmateImplementation','synchronous state-stack implementation');source="import {main as devforgeTextmateImplementation} from '@codingame/monaco-vscode-api/_virtual/main';\n"+source.slice(0,start)+source.slice(end);
  return replace(source,'        let tokens = ContiguousMultilineTokensBuilder.deserialize',initialization+'        if (this._model.isDisposed()) return;\n        let tokens = ContiguousMultilineTokensBuilder.deserialize','load TextMate state implementation before rebasing pending edits');
 }
 if(id.endsWith('/vs/workbench/services/host/browser/browserHostService.js'))return replace(source,'    async doOpen(workspace, options) {','    async doOpen(workspace, options) {\n        if (this.workspaceProvider.handlesWindowOpening) return this.workspaceProvider.open(workspace, options);','native workspace opening does not shut down the hosting page');
 if(id.endsWith('/vs/platform/workspaces/common/workspaces.js'))return replace(source,'        if (uri) {\n            const comparisonKey = extUri.getComparisonKey(uri);',"        if (uri?.scheme === 'file' && workspaceConfigFile.scheme === 'vscode-remote') uri = uri.with({scheme:workspaceConfigFile.scheme, authority:workspaceConfigFile.authority});\n        if (uri) {\n            const comparisonKey = extUri.getComparisonKey(uri);",'local workspace file URI roots use the same local-machine agent as path roots');
 if(id.endsWith('/vs/workbench/browser/parts/editor/editorCommands.js')){
  source=replace(source,'columnToEditorGroup(editorGroupsService, configurationService, column)\n                );','undefined\n                );','defer vscode.open native group allocation');
  source=replace(source,'                await editorService.openEditor(\n                    input,','                input.options = {...input.options, devforgeViewColumn: column};\n                await editorService.openEditor(\n                    input,','carry vscode.open column through editor routing');
  source=replace(source,'            options\n        }, columnToEditorGroup(editorGroupsService, configurationService, column));','            options: {...options, devforgeViewColumn: column}\n        });','resolve diff columns using genuine workbench groups');
  return replace(source,'                    override: id\n                }\n            }, columnToEditorGroup(editorGroupsService, configurationService, columnArg));','                    override: id,\n                    devforgeViewColumn: columnArg\n                }\n            });','route vscode.openWith through the same deferred columns');
 }
 if(id.endsWith('/vs/workbench/services/editor/common/editorGroupColumn.js'))return replace(source,'    return ( editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE).indexOf(group ?? editorGroupService.activeGroup));','    const nativeColumn = globalThis.devforgeEditorColumn?.(group?.editor);\n    return nativeColumn ?? (editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE).indexOf(group ?? editorGroupService.activeGroup));','report physical native groups rather than standalone tab creation order');
 if(id.endsWith('/vs/workbench/api/browser/mainThreadEditors.js')){
  source=replace(source,'            preserveFocus: options.preserveFocus,','            devforgeViewColumn: options.position,\n            preserveFocus: options.preserveFocus,','carry the original requested column until native/workbench routing');
  source=replace(source,'columnToEditorGroup(this._editorGroupService, this._configurationService, options.position)','undefined','defer group allocation until the actual editor owner is known');
  source=replace(source,'                    preserveFocus: false','                    devforgeViewColumn: position,\n                    preserveFocus: false','route TextEditor.show through the same column selection');
  source=replace(source,'}, columnToEditorGroup(this._editorGroupService, this._configurationService, position));','});','defer TextEditor.show group allocation');
  return replace(source,'        this._registeredDecorationTypes = Object.create(null);\n    }',"        const layout = () => this._updateActiveAndVisibleTextEditors();\n        globalThis.addEventListener('devforge:editor-visibility-changed', layout);\n        this._toDispose.add({dispose:()=>globalThis.removeEventListener('devforge:editor-visibility-changed', layout)});\n        this._registeredDecorationTypes = Object.create(null);\n    }",'refresh reported columns after native group moves');
 }
 if(id.endsWith('/vs/workbench/api/browser/mainThreadDocumentsAndEditors.js')){
  source="function devforgeEditorVisible(editor){const node=editor.getDomNode();if(!node?.checkVisibility({visibilityProperty:true}))return false;const rect=node.getBoundingClientRect();if(rect.width<=0||rect.height<=0||rect.right<=0||rect.bottom<=0||rect.left>=innerWidth||rect.top>=innerHeight)return false;for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.inert||getComputedStyle(parent).visibility==='hidden')return false;return true;}\n"+source;
  source=replace(source,'if (editor.isSimpleWidget) {',"if (editor.isSimpleWidget || editor.getModel()?.uri.scheme === 'devforge' || !devforgeEditorVisible(editor)) {",'publish only visible text editors, excluding native view placeholders');
  source=replace(source,'        this._updateState();\n    }\n    dispose() {',"        const visibility = () => this._updateState();\n        globalThis.addEventListener('devforge:editor-visibility-changed', visibility);\n        this._toDispose.add({dispose:()=>globalThis.removeEventListener('devforge:editor-visibility-changed', visibility)});\n        this._updateState();\n    }\n    dispose() {",'refresh extension editor snapshots when Dockview visibility changes');
  const count=source.split('shouldSynchronizeModel(model)').length-1;if(count!==3)throw Error('Pinned editor model synchronization changed');
  return source.replaceAll('shouldSynchronizeModel(model)',"(shouldSynchronizeModel(model) && model.uri.scheme !== 'devforge')");
 }
 if(id.endsWith('/vs/workbench/contrib/notebook/browser/notebookEditor.js')){
  source="import {isCancellationError as devforgeIsCancellationError} from '@codingame/monaco-vscode-api/vscode/vs/base/common/errors';\n"+source;
  return replace(source,'                this._handlePerfMark(perf, input);\n            });','                this._handlePerfMark(perf, input);\n            }, error => { if (!devforgeIsCancellationError(error)) throw error; });','handle the cancelled notebook performance timer without masking other errors');
 }
 if(id.endsWith('/vs/workbench/api/browser/mainThreadStorage.js'))return replace(source,'this._extensionStorageService.setExtensionState(key, value, shared);','this._extensionStorageService.setExtensionState(key, value, shared);\n        await this._storageService.flush();','await persisted extension mementos');
 if(id.endsWith('/vs/workbench/services/extensions/common/abstractExtensionService.js')){
  source="import {isCancellationError as devforgeIsHostShutdownCancellation} from '@codingame/monaco-vscode-api/vscode/vs/base/common/errors';\n"+source;
  source=replace(source,'            this._activateAddedExtensionIfNeeded(toAdd[i]);','            this._activateAddedExtensionIfNeeded(toAdd[i]).catch(error => { if (!devforgeIsHostShutdownCancellation(error)) this._logService.error(error); });','observe activation of a newly registered extension canceled by unloading its host');
  return replace(source,'                    extensions.map(extension => extension.identifier)\n                );','                    extensions.map(extension => extension.identifier)\n                ).catch(error => { if (!devforgeIsHostShutdownCancellation(error)) this._logService.error(error); });','observe on-demand host startup canceled by an intentional extension restart');
 }
 if(id.endsWith('/vs/workbench/services/extensions/common/rpcProtocol.js')){
  source=replace(source,'this._pendingRPCReplies[callId] = ( new PendingRPCReply(result, disposable));','this._pendingRPCReplies[callId] = Object.assign(new PendingRPCReply(result, disposable), {devforgeMethod:methodName});','retain the pending RPC method in shutdown diagnostics');
  return replace(source,'            pending.resolveErr(canceled());',"            const error = canceled(); error.stack += '\\nRPC pending at shutdown: ' + pending.devforgeMethod; pending.resolveErr(error);",'identify the canceled RPC in its shutdown stack');
 }
 if(id.endsWith('/vs/workbench/api/browser/mainThreadDiagnostics.js'))return replace(source,'if (marker.origin === undefined) {','if (!marker.source) marker.source = "VSX / " + owner;\n                    if (marker.origin === undefined) {','diagnostic source labels');
}};}
