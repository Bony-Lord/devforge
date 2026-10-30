using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace DevForge.Native;

internal sealed class DebugView : UserControl, IDisposable
{
    readonly MainWindow window;
    readonly ListBox frames = new();
    readonly TreeView variables = new();
    readonly TextBlock status = Ui.Label("");
    readonly Dictionary<string,Button> controls = new();
    readonly string session = Guid.NewGuid().ToString("N");
    bool paused, active;
    int generation;
    public DebugView(MainWindow window)
    {
        this.window = window; var panel = new DockPanel(); var bar = Ui.Row(); DockPanel.SetDock(bar,System.Windows.Controls.Dock.Top);
        foreach(var (id,label,tip) in new[]{("continue","Продолжить","Ctrl+Alt+F5"),("over","Шаг с обходом","Ctrl+Alt+Right"),("into","Шаг внутрь","Ctrl+Alt+Down"),("out","Шаг наружу","Ctrl+Alt+Up"),("pause","Пауза","Приостановить"),("stop","Остановить","Завершить отладку")}) { var button=Ui.Button(label,()=>Action(id),tip);controls[id]=button;bar.Children.Add(button); } panel.Children.Add(bar);DockPanel.SetDock(status,System.Windows.Controls.Dock.Top);panel.Children.Add(status);
        var split=new Grid();split.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(1,GridUnitType.Star)});split.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(5)});split.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(1.4,GridUnitType.Star)});
        split.Children.Add(frames);var divider=new GridSplitter{Width=5,HorizontalAlignment=HorizontalAlignment.Stretch,Background=Ui.Brush("#3B3B40")};Grid.SetColumn(divider,1);split.Children.Add(divider);Grid.SetColumn(variables,2);split.Children.Add(variables);panel.Children.Add(split);Content=panel;
        frames.SelectionChanged+=async(_,_)=>{if(frames.SelectedItem is ListBoxItem{Tag:JsonNode frame}&&int.TryParse(frame.Str("level"),out var level))await Refresh(level);};
        window.Backend.Event+=Receive;
    }
    public async Task Start(string executable,JsonNode options,IReadOnlyDictionary<string,int[]> breakpoints)
    {
        active=true;RenderControls();try{await window.Call("nativeDebugStart",Json.Obj(("id",session),("executable",executable),("options",options),("args",options["args"]??new JsonArray()),("breakpoints",breakpoints)));}catch{active=false;RenderControls();throw;}
    }
    public async Task Action(string action)
    {
        if(!active)return;
        if(action=="stop"){await window.Call("nativeDebugStop");active=false;paused=false;status.Text="Отладка завершена";}
        else{await window.Call("nativeDebugCommand",Json.Obj(("action",action)));paused=false;status.Text="Выполняется…";}
        RenderControls();
    }
    void Receive(string id,string type,JsonNode? data)
    {
        if(id!=window.WindowId||type!="nativeDebugStopped"||data.Str("session")!=session)return;
        window.Dispatcher.BeginInvoke(async()=>
        {
            try{var reason=data.Str("reason");if(reason.StartsWith("exited")){active=false;paused=false;status.Text="Процесс завершён";RenderControls();return;}paused=true;status.Text=reason=="signal-received"?"[Runtime] "+data.Str("signal-name")+": "+data.Str("signal-meaning"):"Остановлено";status.Foreground=Ui.Brush(reason=="signal-received"?"#D0B06A":"#B6BCC4");RenderControls();await Refresh();}
            catch(Exception error){status.Text=error.Message;}
        });
    }
    async Task Refresh(int? level=null)
    {
        var serial=++generation;var snapshot=await window.Call("nativeDebugSnapshot",level is {} frame?Json.Obj(("frame",frame)):null);if(serial!=generation||!paused)return;
        if(level is null){frames.Items.Clear();foreach(var entry in snapshot?["frames"]?.AsArray()??new JsonArray())if(entry is not null)frames.Items.Add(new ListBoxItem{Content=entry.Str("func")+" · "+System.IO.Path.GetFileName(entry.Str("fullname",entry.Str("file")))+":"+entry.Str("line"),Tag=entry,Padding=new Thickness(7,4,7,4)});}
        variables.Items.Clear();foreach(var variable in snapshot?["variables"]?.AsArray()??new JsonArray())if(variable is not null)variables.Items.Add(Variable(variable));
        var current=level is null?snapshot?["frames"]?.AsArray().FirstOrDefault():snapshot?["frames"]?.AsArray().FirstOrDefault(f=>f.Str("level")==level.ToString());if(current is not null&&int.TryParse(current.Str("line"),out var line)){var file=current.Str("fullname",current.Str("file"));if(file.Replace('\\','/').StartsWith(window.Root.TrimEnd('/')+"/",StringComparison.OrdinalIgnoreCase)){await window.OpenFile(file);if(window.ActiveFile is {} doc){doc.Source.ExecutionLine=line;doc.Source.Editor.ScrollToLine(line);doc.Source.Editor.TextArea.TextView.InvalidateLayer(ICSharpCode.AvalonEdit.Rendering.KnownLayer.Background);}}}
    }
    TreeViewItem Variable(JsonNode value)
    {
        var item=new TreeViewItem{Header=Ui.Row(Ui.Label(value.Str("name")),Ui.Label(value.Str("value"),"#B4C7A9"),Ui.Label(value.Str("type"),"#929299")),Tag=value.Str("reference"),Padding=new Thickness(2,2,2,2)};
        if(value["children"]?.ToString() is not ("0" or "false" or null)){item.Items.Add(new TreeViewItem{Header="…"});item.Expanded+=async(_,e)=>{if(!ReferenceEquals(e.OriginalSource,item)||item.Items.Count!=1||(item.Items[0]as TreeViewItem)?.Header?.ToString()!="…")return;try{var children=await window.Call("nativeDebugChildren",Json.Obj(("reference",value.Str("reference"))));item.Items.Clear();foreach(var child in children?.AsArray()??new JsonArray())if(child is not null)item.Items.Add(Variable(child));}catch(Exception error){item.Items.Clear();item.Items.Add(new TreeViewItem{Header=error.Message});}};}
        return item;
    }
    void RenderControls(){foreach(var pair in controls)pair.Value.IsEnabled=active&&(pair.Key is "stop" or "pause"||paused);controls["pause"].IsEnabled=active&&!paused;}
    public void Dispose(){window.Backend.Event-=Receive;}
}
