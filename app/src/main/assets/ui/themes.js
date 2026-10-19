'use strict';
function registerForgeThemes(m){
  m.editor.defineTheme('forge-dark',{base:'vs-dark',inherit:true,semanticHighlighting:true,rules:[
    {token:'',foreground:'BCBEC4'},{token:'comment',foreground:'7A7E85'},{token:'keyword',foreground:'CF8E6D'},
    {token:'number',foreground:'2AACB8'},{token:'string',foreground:'6AAB73'},{token:'type',foreground:'BCBEC4'},
    {token:'type.identifier',foreground:'BCBEC4'},{token:'identifier',foreground:'BCBEC4'},{token:'delimiter',foreground:'BCBEC4'},
    {token:'function',foreground:'56A8F5'},{token:'method',foreground:'56A8F5'},{token:'variable',foreground:'BCBEC4'},
    {token:'property',foreground:'C77DBB'},{token:'parameter',foreground:'BCBEC4'},{token:'macro',foreground:'B3AE60'},
    {token:'namespace',foreground:'BCBEC4'},{token:'operator',foreground:'BCBEC4'}
  ],colors:{
    'editor.background':'#1E1F22','editor.foreground':'#BCBEC4','editorGutter.background':'#1E1F22',
    'editorLineNumber.foreground':'#4B5059','editorLineNumber.activeForeground':'#A1A7B2','editor.lineHighlightBackground':'#26282E',
    'editor.selectionBackground':'#214283','editor.inactiveSelectionBackground':'#2B3447','editorCursor.foreground':'#CED0D6',
    'editorIndentGuide.background1':'#313438','editorIndentGuide.activeBackground1':'#585D66',
    'editorWidget.background':'#2B2D30','editorWidget.border':'#43454A','editorSuggestWidget.background':'#2B2D30',
    'editorSuggestWidget.border':'#43454A','editorSuggestWidget.selectedBackground':'#2E436E',
    'editorHoverWidget.background':'#2B2D30','editorHoverWidget.border':'#43454A','editorError.foreground':'#F75464',
    'editorWarning.foreground':'#E2AE63','editorInfo.foreground':'#548AF7','editorHint.foreground':'#6F737A',
    'editorUnnecessaryCode.opacity':'#000000FF','editorUnnecessaryCode.border':'#00000000',
    'editorInlayHint.foreground':'#868A91','editorInlayHint.background':'#2D2F33',
    'editorBracketMatch.background':'#3B514D','editorBracketMatch.border':'#00000000',
    'editorBracketHighlight.foreground1':'#BCBEC4','editorBracketHighlight.foreground2':'#BCBEC4','editorBracketHighlight.foreground3':'#BCBEC4',
    'scrollbarSlider.background':'#73767C44','scrollbarSlider.hoverBackground':'#73767C77',
    'list.activeSelectionBackground':'#2E436E','list.hoverBackground':'#35373B','focusBorder':'#4E74A2',
    'peekView.border':'#4E74A2','peekViewEditor.background':'#24262B','peekViewResult.background':'#2B2D30'
  }});
  m.editor.defineTheme('forge-light',{base:'vs',inherit:true,semanticHighlighting:true,rules:[{token:'keyword',foreground:'0033B3'},{token:'comment',foreground:'8C8C8C'},{token:'string',foreground:'067D17'},{token:'number',foreground:'1750EB'},{token:'function',foreground:'00627A'},{token:'property',foreground:'871094'}],colors:{'editor.background':'#FFFFFF','editor.foreground':'#080808','editor.lineHighlightBackground':'#F7F8FA','editorLineNumber.foreground':'#AEB3BB','editor.selectionBackground':'#A6D2FF','editorUnnecessaryCode.opacity':'#000000FF','editorUnnecessaryCode.border':'#00000000','editorInlayHint.background':'#F0F1F3','editorInlayHint.foreground':'#8C8C8C'}});
}
