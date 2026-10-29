'use strict';
function registerForgeThemes(m){
  m.editor.defineTheme('forge-dark',{base:'vs-dark',inherit:true,semanticHighlighting:true,rules:[
    {token:'',foreground:'E3ECF9'},{token:'comment',foreground:'8297B3'},{token:'keyword',foreground:'C1A2FF'},
    {token:'number',foreground:'EFC47D'},{token:'string',foreground:'71DFB4'},{token:'type',foreground:'78D6E0'},
    {token:'type.identifier',foreground:'78D6E0'},{token:'identifier',foreground:'E3ECF9'},{token:'delimiter',foreground:'E3ECF9'},
    {token:'function',foreground:'83B3FF'},{token:'method',foreground:'83B3FF'},{token:'variable',foreground:'E3ECF9'},
    {token:'property',foreground:'C1A2FF'},{token:'parameter',foreground:'E3ECF9'},{token:'macro',foreground:'EFC47D'},
    {token:'namespace',foreground:'E3ECF9'},{token:'operator',foreground:'E3ECF9'}
  ],colors:{
    'editor.background':'#101827','editor.foreground':'#E3ECF9','editorGutter.background':'#101827',
    'editorLineNumber.foreground':'#60738F','editorLineNumber.activeForeground':'#B7C9E3','editor.lineHighlightBackground':'#17263B',
    'editor.selectionBackground':'#2C4972','editor.inactiveSelectionBackground':'#26364E','editorCursor.foreground':'#D5E6FF',
    'editorIndentGuide.background1':'#2A3B54','editorIndentGuide.activeBackground1':'#537093',
    'editorWidget.background':'#1D2C44','editorWidget.border':'#3B5273','editorSuggestWidget.background':'#1D2C44',
    'editorSuggestWidget.border':'#3B5273','editorSuggestWidget.selectedBackground':'#2B456B',
    'editorHoverWidget.background':'#1D2C44','editorHoverWidget.border':'#3B5273','editorError.foreground':'#FF8A96',
    'editorWarning.foreground':'#EFC47D','editorInfo.foreground':'#83B3FF','editorHint.foreground':'#71819A',
    'editorUnnecessaryCode.opacity':'#000000FF','editorUnnecessaryCode.border':'#00000000',
    'editorInlayHint.foreground':'#9AAEC8','editorInlayHint.background':'#1B2D47',
    'editorBracketMatch.background':'#244E48','editorBracketMatch.border':'#00000000',
    'editorBracketHighlight.foreground1':'#E3ECF9','editorBracketHighlight.foreground2':'#E3ECF9','editorBracketHighlight.foreground3':'#E3ECF9',
    'scrollbarSlider.background':'#7B96BB44','scrollbarSlider.hoverBackground':'#7B96BB77',
    'list.activeSelectionBackground':'#2B456B','list.hoverBackground':'#253953','focusBorder':'#83B3FF',
    'peekView.border':'#83B3FF','peekViewEditor.background':'#16243A','peekViewResult.background':'#1D2C44'
  }});
  m.editor.defineTheme('forge-light',{base:'vs',inherit:true,semanticHighlighting:true,rules:[{token:'keyword',foreground:'0033B3'},{token:'comment',foreground:'8C8C8C'},{token:'string',foreground:'067D17'},{token:'number',foreground:'1750EB'},{token:'function',foreground:'00627A'},{token:'property',foreground:'871094'}],colors:{'editor.background':'#FFFFFF','editor.foreground':'#080808','editor.lineHighlightBackground':'#F7F8FA','editorLineNumber.foreground':'#AEB3BB','editor.selectionBackground':'#A6D2FF','editorUnnecessaryCode.opacity':'#000000FF','editorUnnecessaryCode.border':'#00000000','editorInlayHint.background':'#F0F1F3','editorInlayHint.foreground':'#8C8C8C'}});
}
