using System.Text;
using System.Text.Json.Nodes;
using System.Windows.Input;

namespace DevForge.Native;

internal static class PythonHover
{
    internal static int Column(string text,int offset) { offset=Math.Clamp(offset,0,text.Length);var start=offset==0?-1:text.LastIndexOf('\n',offset-1);var count=0;foreach(var rune in text.AsSpan(start+1,offset-start-1).EnumerateRunes())count++;return count; }
    internal static void Attach(MainWindow window,NativeEditor editor,Func<(string Path,string Text,int Lines,bool Notebook)> source)
    {
        editor.Editor.MouseHover+=async(_,e)=>
        {
            var position=editor.Editor.GetPositionFromPoint(e.GetPosition(editor.Editor));if(position is null)return;
            var root=window.Root;var snapshot=source();var original=editor.Editor.Text;var offset=editor.Editor.Document.GetOffset(position.Value.Location);
            try
            {
                var response=await window.Call("pythonIntelligence",Json.Obj(("action","hover"),("root",root),("path",snapshot.Path),("text",snapshot.Text),("notebook",snapshot.Notebook),("line",snapshot.Lines+position.Value.Line),("column",Column(original,offset)),("options",await window.EffectiveOptions())));
                if(root!=window.Root||editor.Editor.Text!=original||position!=editor.Editor.GetPositionFromPoint(Mouse.GetPosition(editor.Editor)))return;
                var text=string.Join("\n\n",(response?["contents"]?.AsArray()??new JsonArray()).Select(c=>c.Str("title")+"\n"+string.Join("\n",c?["signatures"]?.AsArray()??new JsonArray())+"\n"+c.Str("text")));
                if(!string.IsNullOrWhiteSpace(text))editor.ShowHover("[Jedi] "+text.Trim());
            }
            catch(System.IO.IOException){}catch(OperationCanceledException){}
        };
    }
}
