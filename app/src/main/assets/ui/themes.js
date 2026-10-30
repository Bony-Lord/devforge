'use strict';
function registerForgeThemes(m){
  m.editor.defineTheme('forge-dark',{base:'vs-dark',inherit:true,semanticHighlighting:true,rules:[
    // Role colors follow the built-in JetBrains Dark editor scheme. UI surfaces
    // remain independent; clangd supplies C/C++ roles and declaration modifiers.
    {token:'',foreground:'BCBEC4'},{token:'comment',foreground:'7A7E85'},{token:'keyword',foreground:'CF8E6D'},
    {token:'number',foreground:'2AACB8'},{token:'string',foreground:'6AAB73'},{token:'string.escape',foreground:'CF8E6D'},
    ...['type','type.identifier','class','struct','enum','interface','namespace','identifier','delimiter','variable','parameter','operator'].map(token=>({token,foreground:'BCBEC4'})),
    {token:'typeParameter',foreground:'20999D'},
    {token:'function',foreground:'BCBEC4'},{token:'function.declaration',foreground:'56A8F5'},{token:'function.definition',foreground:'56A8F5'},
    {token:'method',foreground:'57AAF7'},{token:'method.static',foreground:'57AAF7',fontStyle:'italic'},
    {token:'property',foreground:'C77DBB'},{token:'property.static',foreground:'C77DBB',fontStyle:'italic'},
    {token:'enumMember',foreground:'C77DBB',fontStyle:'italic'},{token:'variable.readonly',foreground:'C77DBB',fontStyle:'italic'},
    {token:'macro',foreground:'B3AE60'},{token:'keyword.directive',foreground:'B3AE60'}
  ],colors:{
    'editor.background':'#1E1F22','editor.foreground':'#BCBEC4','editorGutter.background':'#1E1F22',
    'editorLineNumber.foreground':'#858585','editorLineNumber.activeForeground':'#C6C6C6','editor.lineHighlightBackground':'#242424','editor.lineHighlightBorder':'#00000000',
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
  m.editor.defineTheme('forge-light',{base:'vs',inherit:true,semanticHighlighting:true,rules:[{token:'keyword',foreground:'0033B3'},{token:'comment',foreground:'8C8C8C'},{token:'string',foreground:'067D17'},{token:'number',foreground:'1750EB'},{token:'function',foreground:'00627A'},{token:'property',foreground:'871094'}],colors:{'editor.background':'#FFFFFF','editor.foreground':'#080808','editor.lineHighlightBackground':'#F7F8FA','editor.lineHighlightBorder':'#00000000','editorLineNumber.foreground':'#AEB3BB','editor.selectionBackground':'#A6D2FF','editorUnnecessaryCode.opacity':'#000000FF','editorUnnecessaryCode.border':'#00000000','editorInlayHint.background':'#F0F1F3','editorInlayHint.foreground':'#8C8C8C'}});
}
