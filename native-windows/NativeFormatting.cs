using System.IO;
using System.Text.Json.Nodes;

namespace DevForge.Native;

public partial class MainWindow
{
    internal async Task FormatActive()
    {
        if(ActiveFile is not {} doc || doc.ReadOnly)return;
        if(doc.Notebook is {} notebook) { await notebook.FormatCurrent();return; }
        await FormatEditor(doc.Source,doc.Path,false);
    }
    internal async Task FormatEditor(NativeEditor editor,string path,bool notebook)
    {
        if(editor.Editor.IsReadOnly)return;
        await EnsureTrust();var original=editor.Editor.Text;var project=Root;JsonNode? result;
        status.Text="Форматирование…";
        try
        {
            if(editor.LanguageId=="python")
            {
                await Call("nativeAddonToggle",Json.Obj(("id","studio.python-formatting"),("enable",true)));
                result=await Call("pythonStyleFormat",Json.Obj(("root",Root),("path",path),("text",original),("notebook",notebook),("options",await EffectiveOptions())));
            }
            else if(editor.LanguageId=="cpp")
            {
                await Call("nativeAddonToggle",Json.Obj(("id","studio.formatter"),("enable",true)));
                result=await Call("formatDocument",Json.Obj(("path",path),("text",original)));
                if(result?["code"]?.ToString()!="0")throw new IOException(result.Str("text","Ошибка clang-format"));
            }
            else if(editor.LanguageId=="json")result=Json.Obj(("text",JsonNode.Parse(original)?.ToJsonString(new System.Text.Json.JsonSerializerOptions{WriteIndented=true})));
            else return;
            if(Root!=project||editor.Editor.Text!=original)throw new IOException("Текст изменился во время форматирования. Повторите команду.");
            if(result?["text"] is {} text)editor.SetText(text.ToString(),false);
        }
        finally { status.Text=""; }
    }
}
