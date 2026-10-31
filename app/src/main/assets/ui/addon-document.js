'use strict';
class StudioAddonDocument {
 constructor(ide,doc){this.ide=ide;this.doc=doc;}
 open(container,editor){this.editor=editor;const page=document.createElement('section');page.className='notebook-document studio-settings-document';page.id='addonsDialog';page.dataset.noI18n='';page.open=true;page.close=()=>this.ide.closeTab(this.doc);container.append(page);this.dialog=page;page.addEventListener('pointerdown',()=>StudioDocumentViews.activate(editor,this.doc));this.ide.addons.render();}
 focus(){this.dialog.querySelector('input,button')?.focus({preventScroll:true});}
 optionsChanged(){}
 dispose(){this.ide.addons.captureViewport(this.dialog);this.dialog.remove();}
 static rail(ide){let button=document.querySelector('#extensionsButton');if(!button){button=document.createElement('button');button.id='extensionsButton';button.className='activity';button.type='button';button.innerHTML=svg('blocks');document.querySelector('.activitybar').insertBefore(button,document.querySelector('.activitybar .activity-spacer')||document.querySelector('.activitybar .top-spacer')||document.querySelector('#helpButton'));}button.title=button.ariaLabel=ide.settings.language==='en'?'Extensions':'Дополнения';button.onclick=()=>{const current=window.forge||ide;return current.active?.virtual==='addons'?current.closeTab(current.active):current.addons.open();};}
}
