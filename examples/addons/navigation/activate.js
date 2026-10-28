// Authoring example for trusted host integration. Not a user-installable plugin.
function activate(ctx){
  ctx.contribute('commands','example.navigation/focus',{
    label:{ru:'Фокус в редактор',en:'Focus editor'},action:'editor.focus'
  });
}
if(typeof module!=='undefined')module.exports=activate;
