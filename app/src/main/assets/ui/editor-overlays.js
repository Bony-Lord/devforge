'use strict';
// Monaco's widgets must escape both pane clipping and dockview stacking contexts.
const StudioEditorOverlays={
  element:null,
  root(){
    if(this.element)return this.element;
    const root=document.createElement('div');root.id='studioEditorOverlays';root.className='monaco-editor studio-editor-overlays';root.setAttribute('popover','manual');document.body.append(root);this.element=root;
    if(root.showPopover)root.showPopover();
    const lift=()=>{if(!root.showPopover)return;const visible=root.querySelector('.suggest-widget.visible,.parameter-hints-widget.visible,.monaco-hover');if(visible!==this.lastWidget&&visible&&getComputedStyle(visible).display!=='none'){if(root.matches(':popover-open'))root.hidePopover();root.showPopover();}this.lastWidget=visible;};
    this.observer=new MutationObserver(()=>{if(this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;lift();});});this.observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});return root;
  },
  theme(name){this.root().className='monaco-editor studio-editor-overlays '+(name==='forge-light'?'vs':'vs-dark');}
};
