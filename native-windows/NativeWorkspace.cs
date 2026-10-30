using System.IO;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using AvalonDock.Layout;
using AvalonDock.Layout.Serialization;

namespace DevForge.Native;

public partial class MainWindow
{
    bool restoringWorkspace;
    internal string CaptureLayout()
    {
        using var writer=new StringWriter();new XmlLayoutSerializer(Dock).Serialize(writer);return writer.ToString();
    }
    async Task SaveNativeState()
    {
        if(restoringWorkspace)return;
        var views=new JsonObject();foreach(var doc in files.Values)views[doc.Path]=Json.Obj(("caret",doc.Source.Editor.CaretOffset),("vertical",doc.Source.Editor.VerticalOffset),("horizontal",doc.Source.Editor.HorizontalOffset));
        var session=Json.Obj(("project",State.Str("project")),("tabs",files.Keys.ToArray()),("active",ActiveFile?.Path),("layout",CaptureLayout()),("views",views));
        await Call("sessionCommit",session);
        if(Root.Length>0&&!ReadOnly){Settings["projectInterfaces"]??=new JsonObject();Settings["projectInterfaces"]![State.Str("project")]??=new JsonObject();Settings["projectInterfaces"]![State.Str("project")]!["nativeWorkspace"]=session.DeepClone();await Call("settingsCommit",Settings);}
    }
    async Task RestoreNativeWorkspace()
    {
        if(Root.Length==0)return;
        var saved=Settings["projectInterfaces"]?[State.Str("project")]?["nativeWorkspace"]??State["session"];
        if(saved is null||saved.Str("project")!=State.Str("project"))return;
        restoringWorkspace=true;
        try
        {
            foreach(var path in saved["tabs"]?.AsArray().Take(20)??Enumerable.Empty<JsonNode?>())if(path is not null)try{await OpenFile(path.ToString());}catch(IOException){}
            foreach(var pair in saved["views"]?.AsObject()??new JsonObject())if(files.TryGetValue(pair.Key,out var doc)&&pair.Value is {} view){doc.Source.Editor.CaretOffset=Math.Clamp(view["caret"]?.GetValue<int>()??0,0,doc.Source.Editor.Text.Length);doc.Source.Editor.ScrollToVerticalOffset(view["vertical"]?.GetValue<double>()??0);doc.Source.Editor.ScrollToHorizontalOffset(view["horizontal"]?.GetValue<double>()??0);}
            var xml=saved.Str("layout");if(xml.Length>0&&xml.Length<262144)RestoreLayout(xml);
            if(saved.Str("active") is {Length:>0} active&&files.ContainsKey(active))await OpenFile(active);
        }
        finally{restoringWorkspace=false;}
    }
    internal void RestoreLayout(string xml)
    {
        var contents=Dock.Layout.Descendents().OfType<LayoutContent>().Where(c=>c.ContentId is not null).GroupBy(c=>c.ContentId).ToDictionary(g=>g.Key,g=>g.First().Content);
        var serializer=new XmlLayoutSerializer(Dock);
        serializer.LayoutSerializationCallback+=(_,e)=>{if(contents.TryGetValue(e.Model.ContentId??"",out var content))e.Content=content;else e.Cancel=true;};
        using var reader=new StringReader(xml);serializer.Deserialize(reader);
        var all=Dock.Layout.Descendents().OfType<LayoutContent>().ToArray();
        foreach(var model in all.OfType<LayoutDocument>())
        {
            if(files.TryGetValue(model.ContentId,out var doc)){doc.Tab=model;AttachTabHandlers(doc);}
            else if(model.ContentId.StartsWith("utility:",StringComparison.Ordinal)){var id=model.ContentId[8..];utilities[id]=model;AttachUtilityHandlers(id,model);}
        }
        Documents=Dock.Layout.Descendents().OfType<LayoutDocumentPane>().FirstOrDefault()??Documents;
        explorer=all.OfType<LayoutAnchorable>().FirstOrDefault(p=>p.ContentId=="project")??explorer;
        output=all.OfType<LayoutAnchorable>().FirstOrDefault(p=>p.ContentId=="output")??output;
        foreach(var window in Dock.FloatingWindows){if(window.Left+64>SystemParameters.VirtualScreenLeft+SystemParameters.VirtualScreenWidth)window.Left=SystemParameters.VirtualScreenLeft+SystemParameters.VirtualScreenWidth-window.Width;if(window.Top+32>SystemParameters.VirtualScreenTop+SystemParameters.VirtualScreenHeight)window.Top=SystemParameters.VirtualScreenTop+SystemParameters.VirtualScreenHeight-64;}
    }
    protected override void OnClosed(EventArgs e)
    {
        outputTimer.Stop();treeTimer.Stop();Backend.Event-=ReceiveEvent;LanguageServices.Reset(this);debugView?.Dispose();foreach(var doc in files.Values)doc.Notebook?.Dispose();base.OnClosed(e);
    }
}
