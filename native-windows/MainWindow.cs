using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using System.Text;
using System.Runtime.InteropServices;
using System.Windows.Interop;
using AvalonDock;
using AvalonDock.Layout;
using AvalonDock.Themes;

namespace DevForge.Native;

public sealed class FileDocument
{
    public required string Path { get; set; }
    public required LayoutDocument Tab { get; set; }
    public required NativeEditor Source { get; init; }
    public string Saved { get; set; } = "";
    public bool ReadOnly { get; init; }
    public NotebookView? Notebook { get; set; }
}

public partial class MainWindow : Window
{
    public readonly BackendClient Backend;
    public string WindowId { get; }
    public JsonNode State { get; private set; } = new JsonObject();
    public JsonNode Settings => State["settings"] ?? new JsonObject();
    public string Root => State.Str("root");
    public bool ReadOnly => State["capabilities"].Flag("projectReadOnly");
    public readonly DockingManager Dock = new();
    public LayoutDocumentPane Documents {get;private set;} = new();
    readonly LayoutAnchorablePane sidePane = new() { DockWidth = new GridLength(230), DockMinWidth = 150 };
    readonly LayoutAnchorablePane outputPane = new() { DockHeight = new GridLength(185), DockMinHeight = 80 };
    LayoutAnchorable explorer;
    LayoutAnchorable output;
    readonly DockPanel consoleView=new();
    string outputKind="console";
    readonly TreeView tree = new();
    readonly TextBox console = new() { IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.NoWrap, FontFamily = new FontFamily("Consolas"), FontSize = 12, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, BorderThickness = new Thickness(0), Margin = new Thickness(0) };
    readonly ComboBox projects = new() { MinWidth = 110, MaxWidth = 230, Height = 28, Margin = new Thickness(8, 0, 4, 0), DisplayMemberPath = "Label", SelectedValuePath = "Id" };
    readonly TextBlock status = Ui.Label("Загрузка…");
    readonly Button intelligence;
    readonly Button buildButton;
    readonly Button runButton;
    readonly Button stopButton;
    readonly ComboBox runChoice = new() { Width = 112, Height = 28, Margin = new Thickness(3), DisplayMemberPath = "Label", SelectedValuePath = "Id" };
    readonly ComboBox profileChoice = new() { Width = 90, Height = 28, Margin = new Thickness(3), DisplayMemberPath = "Label", SelectedValuePath = "Id" };
    JsonNode? projectDocument;
    string? lastExecutable;
    bool lastBuildSucceeded;
    string lastBuildConfiguration="";
    DebugView? debugView;
    readonly Button debugButton;
    readonly Dictionary<string, FileDocument> files = new(StringComparer.OrdinalIgnoreCase);
    internal IEnumerable<FileDocument> OpenDocuments => files.Values;
    readonly Dictionary<string, LayoutDocument> utilities = new();
    JsonArray? nativeSnippets;
    readonly DispatcherTimer treeTimer = new() { Interval = TimeSpan.FromMilliseconds(250) };
    readonly Dictionary<string, string> outputKinds = new();
    readonly HashSet<string> expanded = new(StringComparer.OrdinalIgnoreCase);
    readonly StringBuilder outputBuffer = new();
    readonly object outputLock = new();
    readonly DispatcherTimer outputTimer = new() { Interval = TimeSpan.FromMilliseconds(50) };
    bool selecting, closing, initialized;
    string? selectedTreePath;
    long openRequest;
    long treeRequest;
    public FileDocument? ActiveFile => Dock.ActiveContent is FrameworkElement element && element.Tag is FileDocument doc ? doc : files.Values.FirstOrDefault(f => ReferenceEquals(f.Tab.Content, Dock.ActiveContent));

    public MainWindow(BackendClient? backend = null, string windowId = "main", JsonNode? state = null)
    {
        WindowId = windowId;
        Title = "DevForge · Native"; Width = 1360; Height = 870; MinWidth = 700; MinHeight = 480;
        Icon = BitmapFrame.Create(new Uri("pack://application:,,,/Assets/icon.png"));
        SourceInitialized += (_, _) => { var enabled = 1; DwmSetWindowAttribute(new WindowInteropHelper(this).Handle, 20, ref enabled, sizeof(int)); };
        var source = LocateSource();
        var data = App.Arguments.FirstOrDefault(a => a.StartsWith("--data-dir="))?[11..] ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DevForge.Native");
        if (backend is null) ImportProjectReferences(data);
        Backend = backend ?? new BackendClient(data, source);
        var grid = new Grid(); grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(42) }); grid.RowDefinitions.Add(new RowDefinition()); grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(23) });
        var header = new DockPanel { Background = Ui.Brush("#181818"), LastChildFill = true };
        var logo = new Image { Source = new BitmapImage(new Uri("pack://application:,,,/Assets/icon.png")), Width = 26, Height = 26, Margin = new Thickness(9, 0, 3, 0) }; header.Children.Add(logo); header.Children.Add(Ui.Label("DevForge"));
        header.Children.Add(Ui.Icon("folder", PickFolder, "Открыть папку проекта · Ctrl+O")); header.Children.Add(projects);
        header.Children.Add(Ui.Icon("plus", () => OpenTemplates(true), "Создать проект"));
        var actions = Ui.Row(); DockPanel.SetDock(actions, System.Windows.Controls.Dock.Right);
        actions.Children.Add(runChoice); actions.Children.Add(profileChoice);
        actions.Children.Add(Ui.Icon("run-config", OpenRunSettings, "Конфигурации запуска"));
        buildButton = Ui.Icon("build", () => Build(false), "Собрать · Ctrl+Shift+B", "#D5AE69"); actions.Children.Add(buildButton);
        runButton = Ui.Button("Запустить", Run, "Запустить · Ctrl+F5"); runButton.Background = Ui.Brush("#365B44"); actions.Children.Add(runButton);
        debugButton=Ui.Icon("debug",Debug,"Отладка · Ctrl+Alt+D","#70BC91");actions.Children.Add(debugButton);
        stopButton = Ui.Icon("stop", Stop, "Остановить", "#CA7777"); actions.Children.Add(stopButton);
        actions.Children.Add(Ui.Icon("save", SaveAll, "Сохранить всё · Ctrl+S"));actions.Children.Add(Ui.Icon("format",FormatActive,"Форматировать · Ctrl+Alt+L")); actions.Children.Add(Ui.Icon("settings", OpenSettings, "Настройки")); header.Children.Add(actions);
        var search = new TextBox { Text = "", ToolTip = "Найти файл · Ctrl+P", MinWidth = 120, MaxWidth = 520, Margin = new Thickness(18, 6, 18, 6), HorizontalAlignment = HorizontalAlignment.Center };
        search.KeyDown += async (_, e) => { if (e.Key == Key.Enter) await QuickOpen(search.Text); }; header.Children.Add(search); grid.Children.Add(header);
        SizeChanged += (_, _) => { search.Visibility = ActualWidth < 1100 ? Visibility.Collapsed : Visibility.Visible; profileChoice.Visibility = ActualWidth < 950 ? Visibility.Collapsed : Visibility.Visible; projects.MaxWidth = ActualWidth < 900 ? 130 : 230; };
        runChoice.SelectionChanged += async (_, _) => { if (!selecting && projectDocument is not null && runChoice.SelectedValue is string id) { projectDocument["active"] = id; await Call("nativeProjectSave", Json.Obj(("document", projectDocument))); await ReloadConfiguration(); } };
        profileChoice.SelectionChanged += async (_, _) => { if (!selecting && CurrentConfiguration is { } configuration && profileChoice.SelectedValue is string id) { configuration["profile"] = id; await Call("nativeProjectSave", Json.Obj(("document", projectDocument))); UpdateActions(); } };
        projects.DropDownOpened += (_, _) => { foreach (var item in projects.Items.OfType<ProjectEntry>()) if (projects.ItemContainerGenerator.ContainerFromItem(item) is ComboBoxItem container) container.ContextMenu = ProjectMenu(item.Id); };

        var area = new Grid(); area.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(44) }); area.ColumnDefinitions.Add(new ColumnDefinition()); Grid.SetRow(area, 1); grid.Children.Add(area);
        var rail = new StackPanel { Background = Ui.Brush("#181818"), Margin = new Thickness(0, 0, 1, 0) };
        foreach (var button in new[] { Ui.Icon("folder", ToggleExplorer, "Файлы проекта"), Ui.Icon("search", () => QuickOpen(""), "Поиск · Ctrl+P"), Ui.Icon("git", OpenGit, "Git"), Ui.Icon("extensions", OpenExtensions, "Дополнения"), Ui.Icon("console", ToggleOutput, "Консоль") }) { button.Width = 38; button.Height = 36; rail.Children.Add(button); } area.Children.Add(rail);
        var treeContainer = new DockPanel(); var treeTools = Ui.Row(Ui.Icon("plus", NewItemMenu, "Создать файл или папку"), Ui.Icon("refresh", RefreshTree, "Обновить дерево")); DockPanel.SetDock(treeTools, System.Windows.Controls.Dock.Top); treeContainer.Children.Add(treeTools); treeContainer.Children.Add(tree);
        explorer = new LayoutAnchorable { Title = "Проект", ContentId = "project", Content = treeContainer, CanClose = false, CanHide = true, CanDockAsTabbedDocument = false };
        sidePane.Children.Add(explorer);
        var consoleContainer = consoleView; var input = new TextBox { ToolTip = "Ввод программы · Enter — отправить", Margin = new Thickness(4) }; DockPanel.SetDock(input, System.Windows.Controls.Dock.Bottom); input.KeyDown += async (_, e) => { if (e.Key == Key.Enter) { try{await Call("stdin", Json.Obj(("text", input.Text + "\n")));input.Clear();}catch(Exception error){Ui.Error(input,error.Message);} } }; consoleContainer.Children.Add(input); consoleContainer.Children.Add(console);
        output = new LayoutAnchorable { Title = "Консоль", ContentId = "output", Content = consoleContainer, CanClose = false, CanHide = true, CanDockAsTabbedDocument = false };
        outputPane.Children.Add(output);
        var center = new LayoutPanel { Orientation = Orientation.Horizontal }; center.Children.Add(sidePane); center.Children.Add(new LayoutDocumentPaneGroup(Documents));
        var vertical = new LayoutPanel { Orientation = Orientation.Vertical }; vertical.Children.Add(center); vertical.Children.Add(outputPane);
        Dock.Layout = new LayoutRoot { RootPanel = vertical }; Dock.Theme = new Vs2013DarkTheme(); Dock.Background = Ui.Brush("#1E1E1E"); Dock.BorderThickness = new Thickness(0); Dock.ShowSystemMenu = false;
        Dock.ActiveContentChanged += (_, _) => UpdateActions();
        Grid.SetColumn(Dock, 1); area.Children.Add(Dock);
        var footer = new DockPanel { Background = Ui.Brush("#181818") }; intelligence = Ui.Button("Анализ кода", OpenIntelligence); intelligence.MinHeight = 20; intelligence.Padding = new Thickness(6, 0, 6, 0); footer.Children.Add(intelligence); footer.Children.Add(status); Grid.SetRow(footer, 2); grid.Children.Add(footer); Content = grid;
        tree.SelectedItemChanged += (_, _) => selectedTreePath = (tree.SelectedItem as TreeViewItem)?.Tag as string;
        VirtualizingStackPanel.SetIsVirtualizing(tree,true);VirtualizingStackPanel.SetVirtualizationMode(tree,VirtualizationMode.Recycling);ScrollViewer.SetCanContentScroll(tree,true);
        tree.MouseDoubleClick += async (_, e) => { if ((tree.SelectedItem as TreeViewItem)?.Tag is string path && File.Exists(path)) { await OpenFile(path); e.Handled = true; } };
        treeTimer.Tick += async (_, _) => { treeTimer.Stop(); await RefreshTree(); await RefreshExternalFiles(); };
        outputTimer.Tick += (_, _) => { string text; lock(outputLock){text=outputBuffer.ToString();outputBuffer.Clear();} if(text.Length==0)return;console.BeginChange();try{console.AppendText(text);if(console.Text.Length>1048576){console.Select(0,console.Text.Length-786432);console.SelectedText="";console.CaretIndex=console.Text.Length;}}finally{console.EndChange();}console.ScrollToEnd(); }; outputTimer.Start();
        Backend.Event += ReceiveEvent;
        PreviewKeyDown += async (_, e) =>
        {
            var command=NativeKeymap.Commands.FirstOrDefault(c=>c.Id is not ("complete" or "zoomIn" or "zoomOut")&&NativeKeymap.Matches(Settings,c.Id,e.Key==Key.System?e.SystemKey:e.Key,Keyboard.Modifiers)).Id;
            if(command is null)return;e.Handled=true;
            try { switch(command) { case "save":await SaveAll();break;case "files":await QuickOpen("");break;case "open":await PickFolder();break;case "build":await Build(false);break;case "run":await Run();break;case "debug":await Debug();break;case "format":await FormatActive();break;default:if(debugView is not null)await debugView.Action(command);break; } }
            catch(Exception error){Ui.Error(Dock,error.Message);}
        };
        Loaded += async (_, _) => { try { State = state?.DeepClone() ?? await Call("state") ?? new JsonObject(); await Call("nativeAddonInit"); await ApplyState();await RestoreNativeWorkspace(); initialized = true; if (App.IsSelfTest) await NativeChecks.Run(this); } catch (Exception e) { status.Text = e.Message; if (App.IsSelfTest) App.FailTest(e); } };
        Closing += OnWindowClosing;
    }

    public Task<JsonNode?> Call(string op, JsonNode? data = null) => Backend.Call(op, data, WindowId);
    static string LocateSource()
    {
        var supplied = App.Arguments.FirstOrDefault(a => a.StartsWith("--source-root="))?[14..]; if (supplied is not null) return Path.GetFullPath(supplied);
        foreach (var origin in new[] { Environment.CurrentDirectory, AppContext.BaseDirectory }) for (var dir = new DirectoryInfo(origin); dir is not null; dir = dir.Parent) if (File.Exists(Path.Combine(dir.FullName, "desktop", "host.cjs"))) return dir.FullName;
        return AppContext.BaseDirectory;
    }
    static void ImportProjectReferences(string data)
    {
        var file = Path.Combine(data, "settings.json"); if (File.Exists(file) || App.Arguments.Contains("--isolated")) return;
        var old = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DevForge", "settings.json"); if (!File.Exists(old)) return;
        var source = JsonNode.Parse(File.ReadAllText(old)); Directory.CreateDirectory(data);
        var prefs = Json.Obj(("projects", source?["projects"]), ("current", ""), ("projectSelectionCleared", true), ("settings", new JsonObject { ["language"] = source?["settings"]?.Str("language", "ru"), ["pythonExecutable"] = source?["settings"]?.Str("pythonExecutable") }), ("session", new JsonObject()));
        File.WriteAllText(file, prefs.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }
    async Task ApplyState()
    {
        foreach (var doc in files.Values.Where(d => Root.Length == 0 || !d.Path.StartsWith(Root.TrimEnd('/', '\\') + "/", StringComparison.OrdinalIgnoreCase)).ToArray()) { doc.Tab.Close(); doc.Notebook?.Dispose(); files.Remove(doc.Path); }
        selecting = true; projects.Items.Clear(); foreach (var id in State["projects"]?.AsArray() ?? new JsonArray()) { var key = id!.ToString(); var item = new ProjectEntry(key, State["projectLabels"].Str(key, key)); projects.Items.Add(item); }
        projects.SelectedValue = State.Str("project"); selecting = false;
        projects.SelectionChanged -= ProjectChanged; projects.SelectionChanged += ProjectChanged;
        Title = "DevForge · " + (State["projectLabels"].Str(State.Str("project"), "Native")) + (ReadOnly ? " · Только чтение" : "");
        await RefreshTree(); await ReloadConfiguration(); status.Text = "";
        if(!initialized)output.Hide();
        if (Root.Length == 0 && !utilities.ContainsKey("welcome")) ShowUtility("welcome", "Начало работы", Welcome());
    }
    async void ProjectChanged(object sender, SelectionChangedEventArgs args) { if (!selecting && projects.SelectedValue is string id && id != State.Str("project")) try { await OpenProject(id); } catch (Exception e) { Ui.Error(projects, e.Message); } }
    public async Task OpenProject(string id)
    {
        await SaveAll();await SaveNativeState(); State = await Call("project", Json.Obj(("name", id))) ?? State;
        ++openRequest; LanguageServices.Reset(this);
        foreach (var document in files.Values.ToArray()) { document.Notebook?.Dispose(); document.Tab.Close(); } files.Clear();
        foreach (var key in new[] { "search", "run-settings", "intelligence", "git", "templates", "notebook-resources" }) if (utilities.Remove(key, out var tab)) Documents.Children.Remove(tab);
        await ApplyState();
        var first = Flatten(State["tree"]).FirstOrDefault(p => p.EndsWith(".ipynb") || p.EndsWith(".py") || p.EndsWith(".cpp")); if (first is not null) await OpenFile(first);
        await RestoreNativeWorkspace();
    }
    public async Task OpenFile(string path)
    {
        path = Path.GetFullPath(path).Replace('\\', '/');
        var request = ++openRequest;
        var root = Root;
        if (files.TryGetValue(path, out var previous)) { previous.Tab.IsActive = true; return; }
        var result = await Call("read", Json.Obj(("path", path))); if (result is null) return;
        if (root != Root || closing) return;
        // Concurrent opens can finish out of order. Reuse a document created by
        // the other request and never steal focus from a newer selection.
        if (files.TryGetValue(path, out previous)) { if (request == openRequest) previous.Tab.IsActive = true; return; }
        var source = new NativeEditor(path, result.Str("text"), ReadOnly || result.Flag("readonly"));
        source.KeymapSettings=()=>Settings;source.Editor.FontSize=Settings["fontSize"]?.GetValue<double>()??14;
        var tab = new LayoutDocument { Title = Path.GetFileName(path), ContentId = path, ToolTip = path, Content = source, CanFloat = Settings["nativeDocking"]?.GetValue<bool>() != false };
        var doc = new FileDocument { Path = path, Tab = tab, Source = source, Saved = result.Str("text"), ReadOnly = ReadOnly || result.Flag("readonly") }; source.Tag = doc;
        files[path] = doc;
        source.Changed += () => doc.Tab.Title = Path.GetFileName(doc.Path) + (source.Editor.Text == doc.Saved ? "" : " •");
        source.CompletionRequested += async editor => await Complete(doc, editor);
        if(source.LanguageId=="python")PythonHover.Attach(this,source,()=>(doc.Path,source.Editor.Text,0,false));
        AttachTabHandlers(doc);
        if (path.EndsWith(".ipynb", StringComparison.OrdinalIgnoreCase)) { doc.Notebook = new NotebookView(this, doc); tab.Content = doc.Notebook; doc.Notebook.Tag = doc; }
        Documents.Children.Add(tab); if (request == openRequest) tab.IsActive = true;
        if (request == openRequest && doc.Notebook is null) source.Editor.Focus(); UpdateActions();
    }
    async Task SaveAndClose(FileDocument doc) { await Save(doc); doc.Tab.Close(); }
    public async Task Save(FileDocument doc)
    {
        if (doc.ReadOnly || doc.Source.Editor.Text == doc.Saved) return;
        await Call("write", Json.Obj(("path", doc.Path), ("text", doc.Source.Editor.Text))); doc.Saved = doc.Source.Editor.Text; doc.Source.MarkSaved(); doc.Tab.Title = Path.GetFileName(doc.Path);
    }
    public async Task SaveAll() { foreach (var doc in files.Values.ToArray()) await Save(doc); }
    void AttachTabHandlers(FileDocument doc){var tab=doc.Tab;tab.Closing+=(_,e)=>{if(doc.Source.Editor.Text!=doc.Saved&&!doc.ReadOnly){e.Cancel=true;_=SaveAndClose(doc);}};tab.Closed+=(_,_)=>{if(!ReferenceEquals(doc.Tab,tab))return;files.Remove(doc.Path);LanguageServices.CloseDocument(this,doc);doc.Notebook?.Dispose();};}
    public LayoutDocument ShowUtility(string id, string title, FrameworkElement content)
    {
        if (utilities.TryGetValue(id, out var old)) { old.IsActive = true; return old; }
        var tab = new LayoutDocument { Title = title, ContentId = "utility:" + id, Content = content, CanFloat = Settings["nativeDocking"]?.GetValue<bool>() != false }; utilities[id] = tab;AttachUtilityHandlers(id,tab);Documents.Children.Add(tab); tab.IsActive = true; return tab;
    }
    void AttachUtilityHandlers(string id,LayoutDocument tab) { tab.Closed+=(_,_)=>{if(utilities.GetValueOrDefault(id)==tab)utilities.Remove(id);}; }
    FrameworkElement Welcome()
    {
        var panel = new StackPanel { Margin = new Thickness(36), MaxWidth = 580, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        panel.Children.Add(new TextBlock { Text = "DevForge", FontSize = 30, Margin = new Thickness(0, 0, 0, 20) }); panel.Children.Add(Ui.Button("Открыть папку…", PickFolder)); panel.Children.Add(Ui.Button("Новый проект…", () => OpenTemplates(true))); panel.Children.Add(Ui.Button("Дополнения", OpenExtensions)); return panel;
    }
    public async Task RefreshTree()
    {
        if (Root.Length == 0) { tree.Items.Clear(); return; }
        var root=Root;var request=++treeRequest;var data = await Call("tree");
        async Task Restore(JsonArray items){foreach(var item in items){if(item is null||!item.Flag("dir")||!expanded.Contains(item.Str("path")))continue;if(item.Flag("unloaded")){item["children"]=await Call("tree",Json.Obj(("path",item.Str("path"))));item["unloaded"]=false;}await Restore(item["children"]?.AsArray()??new JsonArray());}}
        await Restore(data?.AsArray()??new JsonArray());if(root!=Root||request!=treeRequest)return;State["tree"] = data?.DeepClone(); tree.Items.Clear(); foreach (var item in data?.AsArray() ?? new JsonArray()) if (item is not null) tree.Items.Add(TreeItem(item));
    }
    TreeViewItem TreeItem(JsonNode item, bool hidden = false)
    {
        var path = item.Str("path"); var name = item.Str("name"); hidden |= name.StartsWith('.') || name == "build" || name.StartsWith("cmake-build-");
        var row = new TreeViewItem { Header = name, Tag = path, Foreground = Ui.Brush(hidden ? "#D4B36B" : "#D4D4D4"), Background = hidden ? Ui.Brush("#302E26") : Brushes.Transparent, Padding = new Thickness(3, 3, 3, 3) };
        if (item.Flag("dir"))
        {
            row.Items.Add(new TreeViewItem{Header="…"});var populated=false;
            row.Expanded += async (_, e) => { if (!ReferenceEquals(e.OriginalSource, row)) return; expanded.Add(path);if(populated)return;try{var children=item.Flag("unloaded")?await Call("tree",Json.Obj(("path",path))):item["children"];if(!path.StartsWith(Root.TrimEnd('/')+"/",StringComparison.OrdinalIgnoreCase))return;row.Items.Clear();foreach(var child in children?.AsArray()??new JsonArray())if(child is not null)row.Items.Add(TreeItem(child,hidden));populated=true;}catch(Exception error){Ui.Error(tree,error.Message);} };
            row.Collapsed += (_, e) => { if (ReferenceEquals(e.OriginalSource, row)) expanded.Remove(path); };
            row.IsExpanded=expanded.Contains(path);
        }
        row.ContextMenu = TreeMenu(path, item.Flag("dir")); return row;
    }
    ContextMenu TreeMenu(string path, bool folder)
    {
        var menu = new ContextMenu();
        AddMenu(menu, "Открыть", async () => { if (!folder) await OpenFile(path); });
        AddMenu(menu, "Создать здесь…", async () => { selectedTreePath = folder ? path : Path.GetDirectoryName(path); await NewItemMenu(); });
        AddMenu(menu, "Переименовать…", () => Rename(path));
        AddMenu(menu, "Показать в проводнике", () => { Process.Start(new ProcessStartInfo("explorer.exe", "/select,\"" + path.Replace('/', '\\') + "\"") { UseShellExecute = true }); return Task.CompletedTask; });
        if (!folder) AddMenu(menu, "Удалить в корзину проекта", async () => { await Call("deleteFile", Json.Obj(("path", path))); await RefreshTree(); });
        return menu;
    }
    static void AddMenu(ContextMenu menu, string title, Func<Task> action) { var item = new MenuItem { Header = title }; item.Click += async (_, _) => { try { await action(); } catch (Exception e) { Ui.Error(menu, e.Message); } }; menu.Items.Add(item); }
    async Task Rename(string path)
    {
        TreeViewItem? Find(ItemsControl parent) { foreach (var item in parent.Items.OfType<TreeViewItem>()) { if (item.Tag is string value && string.Equals(value.Replace('\\','/'), path.Replace('\\','/'), StringComparison.OrdinalIgnoreCase)) return item; if (Find(item) is { } nested) return nested; } return null; }
        var row = Find(tree); if (row is null) return; var oldHeader = row.Header; var input = new TextBox { Text = Path.GetFileName(path), MinWidth = 100, Padding = new Thickness(2, 0, 2, 0), Margin = new Thickness(0) }; row.Header = input; var completed = false;
        async Task Finish(bool apply)
        {
            if (completed) return; completed = true;
            try
            {
                var name = input.Text.Trim(); if (!apply || name == Path.GetFileName(path)) { row.Header = oldHeader; return; }
                if (name.Length == 0 || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || name is "." or "..") throw new IOException("Недопустимое имя");
                await SaveAll(); var target = Path.Combine(Path.GetDirectoryName(path)!, name).Replace('\\','/'); await Call("renameFile", Json.Obj(("path", path), ("to", target)));
                foreach (var doc in files.Values.Where(d => string.Equals(d.Path,path.Replace('\\','/'),StringComparison.OrdinalIgnoreCase) || d.Path.StartsWith(path.Replace('\\','/').TrimEnd('/')+"/",StringComparison.OrdinalIgnoreCase)).ToArray()) { files.Remove(doc.Path); doc.Path = target + doc.Path[path.Length..]; doc.Tab.ContentId = doc.Path; doc.Tab.Title = Path.GetFileName(doc.Path); files[doc.Path] = doc; await Call("read",Json.Obj(("path",doc.Path))); }
                selectedTreePath = target; await RefreshTree();
            }
            catch (Exception error) { row.Header = oldHeader; Ui.Error(tree,error.Message); }
        }
        input.KeyDown += async (_, e) => { if (e.Key is Key.Enter or Key.Escape) { e.Handled = true; await Finish(e.Key == Key.Enter); } }; input.LostKeyboardFocus += async (_, _) => await Finish(true);
        await Dispatcher.InvokeAsync(() => { input.Focus(); input.Select(0, Directory.Exists(path) ? input.Text.Length : Path.GetFileNameWithoutExtension(path).Length); }, DispatcherPriority.Input);
    }
    Task NewItemMenu()
    {
        var menu = new ContextMenu { PlacementTarget = tree, Placement = System.Windows.Controls.Primitives.PlacementMode.MousePoint };
        foreach (var (label, kind, extension) in new[] { ("Папка", "folder", ""), ("C++ файл", "cpp", ""), ("Заголовок C++", "hpp", ""), ("Python файл", "empty", "py"), ("Markdown", "empty", "md"), ("JSON", "empty", "json"), ("Другой файл…", "empty", "") })
            AddMenu(menu, label, async () => { var folder = selectedTreePath is { } selection && Directory.Exists(selection) ? selection : selectedTreePath is { } file ? Path.GetDirectoryName(file)! : Root; var result = await Call("createTreeItem", Json.Obj(("directory", Path.GetRelativePath(Root, folder).Replace('\\', '/')), ("kind", kind), ("extension", extension)));expanded.Add(folder.Replace('\\','/')); await RefreshTree(); var path = result?.Str("path") ?? ""; if (path.Length > 0) await Rename(path); });
        menu.IsOpen = true; return Task.CompletedTask;
    }
    async Task PickFolder()
    {
        var dialog = new Microsoft.Win32.OpenFolderDialog { Title = "Открыть проект", Multiselect = false }; if (dialog.ShowDialog(this) != true) return;
        var project = await Call("openFolder", Json.Obj(("path", dialog.FolderName))); State = await Call("state") ?? State; await OpenProject(project!.Str("project"));
    }
    public async Task EnsureTrust()
    {
        if ((await Call("workspaceTrust")).Flag("trusted")) return;
        if (MessageBox.Show(this, "Разрешить запуск инструментов и кода в этой папке?\n\n" + Root, "Доверие проекту", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) throw new InvalidOperationException("Папка открыта без разрешения на выполнение.");
        await Call("workspaceTrustSet", Json.Obj(("trusted", true)));
    }
    void UpdateActions()
    {
        var path = ActiveFile?.Path ?? ""; var python = path.EndsWith(".py") || path.EndsWith(".ipynb"); buildButton.Visibility = CurrentConfiguration?["actions"]?["build"] is null ? Visibility.Collapsed : Visibility.Visible; buildButton.IsEnabled = !ReadOnly; runButton.Visibility = CurrentConfiguration?["actions"]?["run"] is null ? Visibility.Collapsed : Visibility.Visible; runButton.IsEnabled = Root.Length > 0 && !ReadOnly;debugButton.Visibility=CurrentConfiguration?["actions"]?["debug"] is null?Visibility.Collapsed:Visibility.Visible;debugButton.IsEnabled=!ReadOnly&&State["capabilities"].Flag("debugger"); stopButton.IsEnabled = Root.Length > 0; intelligence.Content = ActiveFile?.Notebook is {IsRaw:false} || ActiveFile?.Source.LanguageId=="python" ? "Python · анализ и подсказки" : ActiveFile?.Source.LanguageId switch {"json"=>"JSON · проверка", "cpp"=>"C/C++ · анализ и подсказки", "markdown"=>"Markdown · подсветка", "cmake"=>"CMake · подсветка", _=>"Анализ кода"};
    }
    JsonNode? CurrentConfiguration => projectDocument?["configurations"]?.AsArray().FirstOrDefault(c => c.Str("id") == projectDocument.Str("active"));
    public async Task ReloadConfiguration()
    {
        projectDocument = await Configuration(); selecting = true; runChoice.Items.Clear(); profileChoice.Items.Clear();
        foreach (var configuration in projectDocument?["configurations"]?.AsArray() ?? new JsonArray()) if (configuration is not null) runChoice.Items.Add(new ProjectEntry(configuration.Str("id"), configuration.Str("name")));
        foreach (var profile in projectDocument?["profiles"]?.AsArray() ?? new JsonArray()) if (profile is not null) profileChoice.Items.Add(new ProjectEntry(profile.Str("id"), profile.Str("name")));
        runChoice.SelectedValue = projectDocument?.Str("active"); profileChoice.SelectedValue = CurrentConfiguration?.Str("profile"); selecting = false; UpdateActions();
    }
    public async Task<JsonObject> EffectiveOptions()
    {
        if(Root.Length==0)return Settings.DeepClone().AsObject();
        var resolved=await Call("nativeResolveConfiguration",Json.Obj(("path",ActiveFile?.Path)));var options=resolved?["options"]?.DeepClone().AsObject()??Settings.DeepClone().AsObject();options["nativeSource"]=resolved?.Str("path");return options;
    }
    public async Task Build(bool run,bool debug=false)
    {
        if (CurrentConfiguration?["actions"]?["build"] is null) return; await EnsureTrust(); await SaveAll(); ShowOutput("build"); console.Clear();
        lastBuildSucceeded=false;lastExecutable=null;var current = CurrentConfiguration; var options = await EffectiveOptions(); options["buildDirectory"] ??= "build"; options["target"] = current?.Str("target"); options["optimization"] ??= "debug";options["debugSession"]=debug;
        var mode = current?.Str("type", File.Exists(Path.Combine(Root, "CMakeLists.txt")) ? "cmake" : "file") ?? "file"; var source = options.Str("nativeSource",Path.Combine(Root,"main.cpp"));
        status.Text = "Сборка…"; var result = await Call(mode == "python" ? "pythonCheck" : "build", Json.Obj(("id", "build"), ("mode", mode), ("path", source), ("options", options))); await RefreshTree();lastBuildSucceeded=result?["code"]?.ToString()=="0"; status.Text = lastBuildSucceeded ? "Сборка завершена" : "Ошибка сборки"; lastExecutable = result.Str("executable");
        if(lastBuildSucceeded)lastBuildConfiguration=Root+"|"+current.Str("id")+"|"+current.Str("profile");
        if (run && result?["code"]?.ToString() == "0" && result.Str("executable").Length > 0) { ShowOutput("console");await Call("run", Json.Obj(("id", "run"), ("executable", result.Str("executable")), ("args", options["args"] ?? new JsonArray()), ("cwd", Path.GetFullPath(Path.Combine(Root,options.Str("workingDirectory",".")))),("environment",options["environment"]??new JsonObject()))); }
    }
    async Task Debug(){await Build(false,true);if(!lastBuildSucceeded||string.IsNullOrEmpty(lastExecutable))return;debugView?.Dispose();debugView=new DebugView(this);output.Content=debugView;output.Title="Отладка";output.Show();output.IsActive=true;await debugView.Start(lastExecutable,await EffectiveOptions(),files.Values.ToDictionary(d=>d.Path,d=>d.Source.Breakpoints.ToArray()));}
    public async Task Run()
    {
        if (CurrentConfiguration is not { } configuration || configuration["actions"]?["run"] is null) return;
        await EnsureTrust(); await SaveAll(); var options = await EffectiveOptions();
        if (configuration.Str("type") == "custom") { ShowOutput("console"); await Call("runCommand", Json.Obj(("id", "custom"), ("options", options))); return; }
        if(configuration.Str("type") is "cmake" or "file") {
            if(options["buildBeforeRun"]?.GetValue<bool>()!=false){await Build(true);return;}
            var executable=options.Str("executable");if(executable.Length==0&&lastBuildConfiguration==Root+"|"+configuration.Str("id")+"|"+configuration.Str("profile"))executable=lastExecutable??"";
            if(executable.Length==0)throw new IOException("Сначала соберите эту конфигурацию или укажите исполняемый файл.");
            ShowOutput("console");await Call("run",Json.Obj(("id","run"),("executable",Path.GetFullPath(Path.Combine(Root,executable))),("args",options["args"]??new JsonArray()),("cwd",Path.GetFullPath(Path.Combine(Root,options.Str("workingDirectory",".")))),("environment",options["environment"]??new JsonObject())));return;
        }
        if (configuration.Str("type") == "executable") { ShowOutput("console"); await Call("run", Json.Obj(("id", "run"), ("executable", Path.GetFullPath(Path.Combine(Root, options.Str("executable")))), ("args", options["args"] ?? new JsonArray()), ("cwd",Path.GetFullPath(Path.Combine(Root,options.Str("workingDirectory",".")))),("environment",options["environment"]??new JsonObject()))); return; }
        var source = options.Str("nativeSource",ActiveFile?.Path??"").Replace('\\', '/');
        if (!files.TryGetValue(source, out var doc)) { await OpenFile(source); doc = files.GetValueOrDefault(source); } if (doc is null) return;
        if (doc.Notebook is not null) { await doc.Notebook.RunAll(); return; }
        if (doc.Path.EndsWith(".py")) { await Call("nativeAddonToggle", Json.Obj(("id", "studio.python"), ("enable", true))); ShowOutput("console"); await Call("pythonRun", Json.Obj(("id", "python"), ("path", doc.Path), ("options", options), ("args", configuration["args"] ?? new JsonArray()))); return; }
        await Build(true);
    }
    Task Stop() => Call("stop");
    Task ToggleExplorer() { if (explorer.IsHidden) { explorer.Show(); explorer.IsActive = true; } else explorer.Hide(); return Task.CompletedTask; }
    void ShowOutput(string kind){outputKind=kind;output.Content=consoleView;output.Title=kind=="build"?"Сборка":kind=="terminal"?"Терминал":"Консоль";output.Show();output.IsActive=true;}
    Task ToggleOutput() { if (output.IsHidden||!ReferenceEquals(output.Content,consoleView)) ShowOutput("console"); else output.Hide(); return Task.CompletedTask; }
    void ReceiveEvent(string window, string type, JsonNode? data)
    {
        if (window != WindowId || Dispatcher.HasShutdownStarted) return;
        if(type=="output"){lock(outputLock){outputBuffer.Append(data.Str("text"));if(outputBuffer.Length>262144)outputBuffer.Remove(0,outputBuffer.Length-196608);}return;}
        Dispatcher.BeginInvoke(() => { try { if(type=="addonsChanged"){nativeSnippets=null;_=RefreshAddonFeatures();}else if (type == "treeChanged") { treeTimer.Stop(); treeTimer.Start(); } else if (type == "notebook") foreach (var document in files.Values) document.Notebook?.Receive(data); else if (type == "exit") status.Text = "Процесс завершён · код " + data?["code"]; } catch (Exception e) { status.Text = e.Message; } });
    }
    async Task RefreshAddonFeatures(){try{var catalog=(await Call("nativeAddonCatalog"))?.AsArray()??new JsonArray();if(!catalog.Any(e=>e?["manifest"].Str("id")=="studio.clangd"&&e.Flag("enabled")))LanguageServices.Reset(this);}catch(IOException error){status.Text=error.Message;}}
    public static IEnumerable<string> Flatten(JsonNode? data) { foreach (var entry in data?.AsArray() ?? new JsonArray()) { if (entry is null) continue; if (!entry.Flag("dir")) yield return entry.Str("path"); else foreach (var child in Flatten(entry["children"])) yield return child; } }
    public Task<JsonNode?> Configuration() => Root.Length == 0 ? Task.FromResult<JsonNode?>(null) : Call("nativeProjectConfiguration");
    async Task RefreshExternalFiles()
    {
        foreach (var doc in files.Values.ToArray())
        {
            try { var latest = await Call("read", Json.Obj(("path", doc.Path), ("observeOnly", true))); var text = latest.Str("text"); if (text == doc.Saved) continue; if (doc.Source.Editor.Text == doc.Saved) { await Call("read", Json.Obj(("path", doc.Path))); doc.Saved = text; doc.Source.SetText(text); } else { doc.Tab.Title = Path.GetFileName(doc.Path) + " · конфликт"; Ui.Error(Dock, "Файл изменён снаружи: " + Path.GetFileName(doc.Path) + ". Несохранённый текст оставлен в редакторе."); } } catch (IOException) { }
        }
    }
    async Task<IReadOnlyList<CompletionItem>> Complete(FileDocument doc, NativeEditor editor)
    {
        if (doc.Path.EndsWith(".py"))
        {
            var location = editor.Editor.Document.GetLocation(editor.Editor.CaretOffset);
            var response = await Call("pythonIntelligence", Json.Obj(("action", "complete"), ("root", Root), ("path", doc.Path), ("text", editor.Editor.Text), ("line", location.Line), ("column", PythonHover.Column(editor.Editor.Text,editor.Editor.CaretOffset)), ("options", await EffectiveOptions())));
            return (response?["items"]?.AsArray() ?? new JsonArray()).Where(i => i is not null).Select(i => new CompletionItem(i.Str("label"), i.Str("kind"))).Concat(await Snippets(editor.LanguageId)).ToArray();
        }
        if (editor.LanguageId == "cpp") return (await LanguageServices.Complete(this, doc, editor)).Concat(await Snippets(editor.LanguageId)).ToArray();
        return System.Text.RegularExpressions.Regex.Matches(editor.Editor.Text, @"\b[A-Za-z_]\w{2,}\b").Select(m => m.Value).Distinct().Take(200).Select(s => new CompletionItem(s)).Concat(await Snippets(editor.LanguageId)).ToArray();
    }
    internal async Task<CompletionItem[]> Snippets(string language) { nativeSnippets??=(await Call("nativeSnippets"))?.AsArray()??new JsonArray();return nativeSnippets.Where(s=>s.Str("language")==language||s.Str("language")=="plaintext"||(language=="cpp"&&s.Str("language")=="c")).Select(s=>new CompletionItem(s.Str("prefix"),s.Str("description"),s.Str("body"))).ToArray(); }
    public record ProjectEntry(string Id, string Label) { public override string ToString()=>Label; }
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
}

internal sealed class InputDialog : Window
{
    public static Task<string?> Ask(Window owner, string title, string value, int selectLength = -1)
    {
        var completion = new TaskCompletionSource<string?>(); var dialog = new InputDialog { Owner = owner, Title = title, Width = 400, Height = 155, ResizeMode = ResizeMode.NoResize, WindowStartupLocation = WindowStartupLocation.CenterOwner };
        var input = new TextBox { Text = value, Margin = new Thickness(12) }; var panel = new DockPanel(); DockPanel.SetDock(input, System.Windows.Controls.Dock.Top); panel.Children.Add(input);
        var ok = Ui.Button("Применить", () => { completion.TrySetResult(input.Text.Trim()); dialog.Close(); return Task.CompletedTask; }); ok.Background = Ui.Brush("#355571"); var cancel = Ui.Button("Отмена", () => { dialog.Close(); return Task.CompletedTask; }); panel.Children.Add(Ui.Row(ok, cancel)); dialog.Content = panel;
        dialog.Closed += (_, _) => completion.TrySetResult(null); dialog.Loaded += (_, _) => { input.Focus(); input.Select(0, selectLength < 0 ? value.Length : selectLength); }; dialog.Show(); return completion.Task;
    }
}
