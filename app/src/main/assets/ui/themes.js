'use strict';
function registerForgeThemes(m){
  m.editor.defineTheme('forge-dark',{base:'vs-dark',inherit:true,semanticHighlighting:true,rules:[
    {token:'',foreground:'D4D4D4'},{token:'comment',foreground:'7C8A7A'},{token:'keyword',foreground:'C586C0'},
    {token:'number',foreground:'B5CEA8'},{token:'string',foreground:'CE9178'},{token:'type',foreground:'8CBEB5'},
    {token:'type.identifier',foreground:'8CBEB5'},{token:'identifier',foreground:'D4D4D4'},{token:'delimiter',foreground:'D4D4D4'},
    {token:'function',foreground:'DCDCAA'},{token:'method',foreground:'DCDCAA'},{token:'variable',foreground:'D4D4D4'},
    {token:'property',foreground:'C586C0'},{token:'parameter',foreground:'D4D4D4'},{token:'macro',foreground:'B5CEA8'},
    {token:'namespace',foreground:'D4D4D4'},{token:'operator',foreground:'D4D4D4'}
  ],colors:{
    'editor.background':'#1E1E1E','editor.foreground':'#D4D4D4','editorGutter.background':'#1E1E1E',
    'editorLineNumber.foreground':'#858585','editorLineNumber.activeForeground':'#C6C6C6','editor.lineHighlightBackground':'#242424',
    'editor.selectionBackground':'#394C63','editor.inactiveSelectionBackground':'#36363B','editorCursor.foreground':'#AEAFAD',
    'editorIndentGuide.background1':'#353535','editorIndentGuide.activeBackground1':'#626262',
    'editorWidget.background':'#252526','editorWidget.border':'#454545','editorSuggestWidget.background':'#252526',
    'editorSuggestWidget.border':'#454545','editorSuggestWidget.selectedBackground':'#373E46',
    'editorHoverWidget.background':'#252526','editorHoverWidget.border':'#454545','editorError.foreground':'#CF7B7B',
    'editorWarning.foreground':'#B5CEA8','editorInfo.foreground':'#9AB4CF','editorHint.foreground':'#777777',
    'editorUnnecessaryCode.opacity':'#000000FF','editorUnnecessaryCode.border':'#00000000',
    'editorInlayHint.foreground':'#8D8D8D','editorInlayHint.background':'#2A2A2A',
    'editorBracketMatch.background':'#37403B','editorBracketMatch.border':'#00000000',
    'editorBracketHighlight.foreground1':'#D4D4D4','editorBracketHighlight.foreground2':'#D4D4D4','editorBracketHighlight.foreground3':'#D4D4D4',
    'scrollbarSlider.background':'#79797944','scrollbarSlider.hoverBackground':'#79797977',
    'list.activeSelectionBackground':'#373E46','list.hoverBackground':'#2E2E30','focusBorder':'#9AB4CF',
    'peekView.border':'#9AB4CF','peekViewEditor.background':'#252526','peekViewResult.background':'#252526'
  }});
  m.editor.defineTheme('forge-light',{base:'vs',inherit:true,semanticHighlighting:true,rules:[{token:'keyword',foreground:'0033B3'},{token:'comment',foreground:'8C8C8C'},{token:'string',foreground:'067D17'},{token:'number',foreground:'1750EB'},{token:'function',foreground:'00627A'},{token:'property',foreground:'871094'}],colors:{'editor.background':'#FFFFFF','editor.foreground':'#080808','editor.lineHighlightBackground':'#F7F8FA','editorLineNumber.foreground':'#AEB3BB','editor.selectionBackground':'#A6D2FF','editorUnnecessaryCode.opacity':'#000000FF','editorUnnecessaryCode.border':'#00000000','editorInlayHint.background':'#F0F1F3','editorInlayHint.foreground':'#8C8C8C'}});
}
