// Resolve extension editors before the standalone Monaco fallback can consume
// their text model. Keep URI schemes intact: a virtual document is not a file.
// Always ask the native layout to reveal a source. Upstream wrapOpenEditor
// returns any cached standalone editor, even a hidden tab, and ignores Beside.
// openEditor owns the supplied reference on every path, as the views fallback does.
export function nativeEditorOpener({textModels,openEditor,applyOptions}){
 return async(input,optionsOrGroup,group)=>{
  const preferred=group??(typeof optionsOrGroup==='number'||optionsOrGroup&&'id'in optionsOrGroup?optionsOrGroup:undefined);
  const options=optionsOrGroup&&typeof optionsOrGroup==='object'&&!('id'in optionsOrGroup)?optionsOrGroup:input.options;
  const resource=input.resource;if(!resource||!textModels.canHandleResource(resource))return;
  const reference=await textModels.createModelReference(resource),editor=await openEditor(reference,options,preferred===-2,preferred);
  if(!editor)return;
  if(options)applyOptions(options,editor);
  return{input,getControl:()=>editor,focus:()=>editor.focus(),hasFocus:()=>editor.hasWidgetFocus(),isVisible:()=>true};
 };
}
export function installEditorRouting({editorService,resolver,groups,extensions,showEditor,openWorkbench,openNative,sideGroup=()=>groups.mainPart.sideGroup}) {
 const normalOpen=openNative||editorService.openEditor.bind(editorService);
 const textTypes=new Set(['workbench.editors.resourceEditorInput','workbench.editors.files.fileEditorInput','workbench.editors.untitledEditorInput']);
 async function usesWorkbench(input,options) {
  if(input.original&&input.modified||input.primary&&input.secondary||input.base&&input.input1&&input.input2)return true;
  if(input.typeId&&!textTypes.has(input.typeId))return true;
  const resource=input.resource;
  if(resource&&!['file','vscode-remote'].includes(resource.scheme))return true;
  const override=input.options?.override??options?.override;
  // EditorResolution.PICK is zero, not a false/absent override.
  if(override!==undefined&&override!==1)return override!=='default';
  if(!resource)return false;
  await extensions.whenInstalledExtensionsRegistered();
  const matches=resolver.getEditorMatches(resource);
  // showTextDocument requests text while still allowing exclusive editors.
  if(override===1)return !!matches.hasExclusiveMatch;
  return !!matches.defaultRule&&matches.defaultRule.editor.id!=='default';
 }
 async function open(input,optionsOrGroup,group) {
  await showEditor();
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const preferred=group??(typeof optionsOrGroup==='number'?optionsOrGroup:undefined);
  const target=preferred===-2?await sideGroup():groups.mainPart.getGroup(preferred?.id??preferred)||groups.mainPart.activeGroup;
  const options=optionsOrGroup&&typeof optionsOrGroup==='object'&&!('openEditor'in optionsOrGroup)?optionsOrGroup:undefined;
  return openWorkbench(input,options,target);
 }
 editorService.openEditor=async(input,optionsOrGroup,group)=>await usesWorkbench(input,optionsOrGroup)?open(input,optionsOrGroup,group):normalOpen(input,optionsOrGroup,group);
 return {
  async openResource(resource,options={}) {
   const input={resource,options};
   if(!await usesWorkbench(input))return false;
   await open(input);
   return true;
  }
 };
}
