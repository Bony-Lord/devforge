'use strict';
// Run against a disposable workspace after the ordinary notebook execution checks.
async function notebookEditing({evaluate,until,check,window}){
 const key=async(keyCode,modifiers=[])=>{window.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});if(keyCode==='Enter'&&!modifiers.length)window.webContents.sendInputEvent({type:'char',keyCode:'\r'});window.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await new Promise(r=>setTimeout(r,20));};
 await evaluate("(()=>{window.notebookView=StudioDocumentViews.pane(forge.editor).documentView;window.originalNotebook=StudioNotebook.serialize(notebookView.value);window.inputSource=notebookView.rows.get(notebookView.value.cells[0]).source;inputSource.apply({text:'if ready:',start:9,end:9},'paste');inputSource.input.focus();})()");
 await key('Enter');
 await check('Notebook Enter inserts the Python block indentation',"inputSource.input.value==='if ready:\\n    '");
 await evaluate("window.originalCellInput=inputSource.input;inputSource.insert('print(42)');inputSource.input.setSelectionRange(0,inputSource.input.value.length)");
 await key('Tab');await key('Tab',['shift']);
 await check('Notebook selected lines support Tab and Shift+Tab',"inputSource.input.value==='if ready:\\n    print(42)'&&document.activeElement===originalCellInput");
 await key('Z',['control']);
 await check('Notebook undo restores the previous cell transaction',"inputSource.input.value==='    if ready:\\n        print(42)'");
 await key('Z',['control','shift']);
 await check('Notebook redo restores the cell transaction',"inputSource.input.value==='if ready:\\n    print(42)'");
 await until("inputSource.paint.querySelector('[class^=mtk]')!==null");
 await check('Notebook Python syntax uses existing Monaco tokens',"inputSource.element.classList.contains('has-syntax')&&new Set([...inputSource.paint.querySelectorAll('[class^=mtk]')].map(e=>getComputedStyle(e).color)).size>1");
 await evaluate("window.initialScale=forge.settings.codeScale;forge.setCodeScale(150,false)");
 await check('Code zoom updates the notebook input and colored layer together',"parseFloat(getComputedStyle(inputSource.input).fontSize)===forge.settings.fontSize*1.5&&getComputedStyle(inputSource.input).fontSize===getComputedStyle(inputSource.paint).fontSize");
 await evaluate("forge.setCodeScale(initialScale,false)");
 await evaluate("inputSource.input.setSelectionRange(3,8);notebookView.value.cells.push(StudioNotebook.cell());notebookView.commit();notebookView.render();notebookView.move(notebookView.value.cells[0],1)");
 await check('Notebook structural changes retain the textarea and selection',"notebookView.rows.get(notebookView.value.cells[1]).input===originalCellInput&&document.activeElement===originalCellInput&&originalCellInput.selectionStart===3&&originalCellInput.selectionEnd===8");
 await evaluate("notebookView.remove(notebookView.value.cells[0]);window.cellChanges=[];window.cellSubscription=notebookView.doc.model.onDidChangeContent(e=>cellChanges.push(...e.changes));inputSource.input.setSelectionRange(inputSource.input.value.length,inputSource.input.value.length);inputSource.insert(' # ok');cellSubscription.dispose();");
 await check('Notebook typing sends a short JSON edit rather than replacing the entire file',"cellChanges.length===1&&cellChanges[0].rangeLength<8&&cellChanges[0].text.length<20");
 await evaluate("notebookView.doc.model.undo()");
 await check('Notebook raw-model undo preserves the field and updates its source',"notebookView.rows.get(notebookView.value.cells[0]).input===originalCellInput&&!originalCellInput.value.endsWith('# ok')");
 await evaluate("inputSource.apply({text:'long_line'.repeat(150)+'\\n'+Array.from({length:80},()=> 'print(42)').join('\\n'),start:0,end:0},'paste');inputSource.input.scrollLeft=200;inputSource.input.scrollTop=80;inputSource.input.dispatchEvent(new Event('scroll'))");
 await check('Notebook token rendering follows horizontal and vertical scroll',"Math.abs(inputSource.paint.scrollLeft-inputSource.input.scrollLeft)<1&&Math.abs(inputSource.paint.scrollTop-inputSource.input.scrollTop)<1");
 await evaluate("inputSource.apply({text:'<img src=x onerror=alert(1)>',start:0,end:0},'paste')");await until("inputSource.paint.textContent.includes('<img')");
 await check('Notebook source cannot inject HTML elements',"!inputSource.paint.querySelector('img,iframe,script')");
 await evaluate("inputSource.apply({text:'safe',start:4,end:4},'paste');window.cellBeforeReject=notebookView.doc.model.getValue();inputSource.insert('x'.repeat(4*1024*1024));");
 await check('Rejected oversized cell input preserves the saved model and visible text',"inputSource.input.value==='safe'&&notebookView.doc.model.getValue()===cellBeforeReject&&notebookView.value.cells[0].source==='safe'");
 await evaluate("notebookView.doc.readonly=true;notebookView.render();window.readonlyCells=notebookView.value.cells.length;notebookView.add('code');inputSource.insert('blocked');notebookView.remove(notebookView.value.cells[0])");
 await check('Read-only notebooks reject editing and structural changes',"notebookView.value.cells.length===readonlyCells&&inputSource.input.readOnly&&inputSource.input.value==='safe'");
 await evaluate("(async()=>{notebookView.doc.readonly=false;notebookView.value=StudioNotebook.parse(originalNotebook);notebookView.commit();notebookView.render();await forge.saveAll();})()");
}
module.exports={notebookEditing};
