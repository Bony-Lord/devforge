using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Diagnostics;
using AvalonDock.Layout;

namespace DevForge.Native;

public partial class MainWindow
{
    Task OpenExtensions() { ShowUtility("extensions", "Дополнения", new AddonPage(this)); return Task.CompletedTask; }
    public async Task QuickOpen(string query)
    {
        var panel = new DockPanel { Margin = new Thickness(10) }; var input = new TextBox { Text = query }; DockPanel.SetDock(input, System.Windows.Controls.Dock.Top); panel.Children.Add(input); var results = new ListBox(); panel.Children.Add(results);
        void Search() { results.Items.Clear(); foreach (var file in Flatten(State["tree"]).Where(p => p.Contains(input.Text, StringComparison.OrdinalIgnoreCase)).Take(300)) results.Items.Add(new ListBoxItem { Content = Path.GetRelativePath(Root, file), Tag = file, Padding = new Thickness(6) }); }
        input.TextChanged += (_, _) => Search(); results.MouseDoubleClick += async (_, _) => { if ((results.SelectedItem as ListBoxItem)?.Tag is string path) await OpenFile(path); };
        input.KeyDown += async (_, e) => { if (e.Key == Key.Enter && (results.SelectedItem ?? results.Items.Cast<object>().FirstOrDefault()) is ListBoxItem { Tag: string path }) await OpenFile(path); };
        Search(); ShowUtility("search", "Поиск файлов", panel); input.Focus(); await Task.CompletedTask;
    }
    async Task OpenGit()
    {
        await EnsureTrust(); var response = await Call("git", Json.Obj(("action", "status")));
        var text = new TextBox { Text = response?.ToJsonString(new JsonSerializerOptions { WriteIndented = true }) ?? "", IsReadOnly = true, FontFamily = new FontFamily("Consolas"), AcceptsReturn = true, BorderThickness = new Thickness(0) }; ShowUtility("git", "Git", text);
    }
    public Task OpenSettings()
    {
        var panel = new StackPanel { Margin = new Thickness(20), MaxWidth = 800, HorizontalAlignment = HorizontalAlignment.Left };
        panel.Children.Add(new TextBlock { Text = "Настройки", FontSize = 20, Margin = new Thickness(0, 0, 0, 16) });
        var floating = new CheckBox { Content = "Разрешить плавающие окна", IsChecked = Settings["nativeDocking"]?.GetValue<bool>() != false, Foreground = Ui.Brush("#D4D4D4"), Margin = new Thickness(4, 8, 4, 12) };
        floating.Checked += async (_, _) => await DockingMode(true); floating.Unchecked += async (_, _) => await DockingMode(false); panel.Children.Add(floating);
        var size = new Slider { Minimum = 9, Maximum = 30, Value = Settings["fontSize"]?.GetValue<double>() ?? 14, Width = 280, HorizontalAlignment = HorizontalAlignment.Left }; size.ValueChanged += async (_, _) => { foreach (var file in files.Values) file.Source.Editor.FontSize = size.Value; Settings["fontSize"] = Math.Round(size.Value); await Call("settingsCommit", Settings); };
        panel.Children.Add(Ui.Label("Размер шрифта")); panel.Children.Add(size);
        panel.Children.Add(Ui.Button("Пути инструментов…", OpenTools)); panel.Children.Add(Ui.Button("Сочетания клавиш", OpenKeybindings)); panel.Children.Add(Ui.Button("Дополнения", OpenExtensions));
        ShowUtility("settings", "Настройки", new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled }); return Task.CompletedTask;
    }
    async Task DockingMode(bool enabled)
    {
        foreach (var tab in Documents.Children) tab.CanFloat = enabled;
        foreach (var pane in Dock.Layout.Descendents().OfType<AvalonDock.Layout.LayoutAnchorable>()) pane.CanFloat = enabled;
        Settings["nativeDocking"] = enabled; await Call("settingsCommit", Settings);
    }
    Task OpenKeybindings()
    {
        var panel=new StackPanel{Margin=new Thickness(20),MaxWidth=720,HorizontalAlignment=HorizontalAlignment.Left};var inputs=new Dictionary<string,TextBox>();
        panel.Children.Add(new TextBlock{Text="Сочетания клавиш",FontSize=20,Margin=new Thickness(0,0,0,12)});
        var presets=new ComboBox{ItemsSource=new[]{"DevForge","CLion","VS Code"},SelectedIndex=0,Width=180,HorizontalAlignment=HorizontalAlignment.Left};panel.Children.Add(presets);
        foreach(var command in NativeKeymap.Commands){var row=new Grid();row.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(260)});row.ColumnDefinitions.Add(new ColumnDefinition{Width=new GridLength(220)});row.Children.Add(Ui.Label(command.Label));var input=new TextBox{Text=NativeKeymap.Gesture(Settings,command.Id),ToolTip="Например Ctrl+Alt+Space. Пустое поле отключает сочетание."};Grid.SetColumn(input,1);row.Children.Add(input);panel.Children.Add(row);inputs[command.Id]=input;}
        presets.SelectionChanged+=(_,_)=>{var values=NativeKeymap.Preset(presets.SelectedItem?.ToString()??"DevForge");foreach(var pair in inputs)pair.Value.Text=values.Str(pair.Key);};
        var apply=Ui.Button("Применить",async()=>{var values=new JsonObject();foreach(var pair in inputs)values[pair.Key]=pair.Value.Text;Settings["nativeKeybindings"]=NativeKeymap.Validate(values);await Call("settingsCommit",Settings);});apply.Background=Ui.Brush("#355571");panel.Children.Add(apply);
        ShowUtility("keybindings","Сочетания клавиш",new ScrollViewer{Content=panel,VerticalScrollBarVisibility=ScrollBarVisibility.Auto,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled});return Task.CompletedTask;
    }
    async Task OpenTools()
    {
        var tools = await Call("toolLocations"); var panel = new StackPanel { Margin = new Thickness(20), MaxWidth = 850, HorizontalAlignment = HorizontalAlignment.Stretch }; var entries = new Dictionary<string, TextBox>();
        foreach (var (key, title) in new[] { ("gxx", "GCC C++"), ("gcc", "GCC C"), ("clangxx", "Clang C++"), ("clangd", "clangd"), ("format", "clang-format"), ("cmake", "CMake"), ("ninja", "Ninja"), ("gdb", "GDB"), ("git", "Git"), ("python", "Python") })
        {
            panel.Children.Add(Ui.Label(title)); var input = new TextBox { Text = tools.Str(key), MinWidth = 350 }; entries[key] = input; var browse = Ui.Button("Обзор…", () => { var dialog = new Microsoft.Win32.OpenFileDialog(); if (dialog.ShowDialog(this) == true) input.Text = dialog.FileName; return Task.CompletedTask; }); var row = new DockPanel(); DockPanel.SetDock(browse, System.Windows.Controls.Dock.Right); row.Children.Add(browse); row.Children.Add(input); panel.Children.Add(row);
        }
        var save = Ui.Button("Применить", async () => { var values = new JsonObject(); foreach (var entry in entries) if (!string.IsNullOrWhiteSpace(entry.Value.Text)) values[entry.Key] = entry.Value.Text; Settings["toolPaths"] = values; Settings["pythonExecutable"] = entries["python"].Text; await Call("settingsCommit", Settings); status.Text = "Пути сохранены"; }); save.Background = Ui.Brush("#355571"); panel.Children.Add(save);
        ShowUtility("tools", "Инструменты", new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled });
    }
    public async Task OpenIntelligence()
    {
        var path = ActiveFile?.Path ?? ""; var python = ActiveFile?.Source.LanguageId=="python"||ActiveFile?.Notebook is {IsRaw:false};
        var panel = new StackPanel { Margin = new Thickness(18) };
        panel.Children.Add(new TextBlock { Text = python ? "Python · анализ и подсказки" : "Анализ кода", FontSize = 18, Margin = new Thickness(0, 0, 0, 14) });
        if (python)
        {
            var info = await Call("pythonInfo", Json.Obj(("options", await EffectiveOptions()))); panel.Children.Add(Ui.Label(info.Str("path")));
            panel.Children.Add(Ui.Button("Установить / включить Jedi", async () => { await EnsureTrust(); await Call("nativeAddonToggle", Json.Obj(("id", "studio.python-intelligence"), ("enable", true))); status.Text = "Jedi включён"; }));
            panel.Children.Add(Ui.Button("Установить / включить PEP 8", async () => { await EnsureTrust(); await Call("nativeAddonToggle", Json.Obj(("id", "studio.python-style"), ("enable", true))); }));
        }
        else if (path.EndsWith(".json") || path.EndsWith(".ipynb")) panel.Children.Add(Ui.Button("Проверить JSON", () => { JsonNode.Parse(ActiveFile!.Source.Editor.Text); status.Text = "JSON корректен"; return Task.CompletedTask; }));
        else if(ActiveFile?.Source.LanguageId=="cpp")panel.Children.Add(Ui.Button("Запустить clangd", StartCppIntelligence));
        else panel.Children.Add(Ui.Label(ActiveFile is {} current?"Подсветка: "+current.Source.LanguageId:"Выберите файл для анализа"));
        panel.Children.Add(Ui.Button("Пути инструментов…", OpenTools)); panel.Children.Add(Ui.Button("Дополнения", OpenExtensions)); ShowUtility("intelligence", "Анализ кода", panel);
    }
    async Task StartCppIntelligence() { await EnsureTrust();await Call("nativeAddonToggle",Json.Obj(("id","studio.clangd"),("enable",true))); await LanguageServices.Start(this); status.Text = "clangd подключён"; }
    public async Task OpenRunSettings()
    {
        if (Root.Length == 0) return;
        var configuration = await Configuration(); if (configuration is not null) ShowUtility("run-settings", "Конфигурации запуска", new ConfigurationEditor(this, configuration));
    }
    ContextMenu ProjectMenu(string id)
    {
        var menu = new ContextMenu(); AddMenu(menu, "Открыть здесь", () => OpenProject(id)); AddMenu(menu, "Открыть в новом окне", () => OpenProjectWindow(id));
        AddMenu(menu, "Показать папку", () => { Process.Start(new ProcessStartInfo("explorer.exe", '"' + State["projectPaths"].Str(id).Replace('/', '\\') + '"') { UseShellExecute = true }); return Task.CompletedTask; });
        AddMenu(menu, "Убрать из списка", async () => { await SaveAll(); var description = await Call("projectDescribe", Json.Obj(("id", id))); await Call("projectRemove", Json.Obj(("id", id), ("path", description.Str("path")), ("mode", "forget"))); State = await Call("state") ?? State; await ApplyState(); });
        AddMenu(menu, "Удалить вместе с файлами…", async () => { if (MessageBox.Show(this, "Перенести проект вместе с файлами в корзину DevForge?\n\n" + State["projectPaths"].Str(id), "Удаление проекта", MessageBoxButton.OKCancel, MessageBoxImage.Warning) != MessageBoxResult.OK) return; await SaveAll(); var description = await Call("projectDescribe", Json.Obj(("id", id))); await Call("projectRemove", Json.Obj(("id", id), ("path", description.Str("path")), ("mode", "trash"))); State = await Call("state") ?? State; await ApplyState(); });
        AddMenu(menu, "Восстановить удалённый проект…", async () => { var archive = (await Call("projectArchive"))?.AsArray() ?? new JsonArray(); var panel = new StackPanel { Margin = new Thickness(18) }; foreach (var item in archive) if (item is not null) panel.Children.Add(Ui.Button(item.Str("label") + " · " + item.Str("path"), async () => { State = await Call("projectRestore",Json.Obj(("id",item.Str("id")))) ?? State; await ApplyState(); })); ShowUtility("project-trash","Корзина проектов",new ScrollViewer { Content=panel, VerticalScrollBarVisibility=ScrollBarVisibility.Auto }); }); return menu;
    }
    public async Task OpenProjectWindow(string id)
    {
        var result = await Call("projectOpenWindow", Json.Obj(("id", id)));
        if (result.Flag("conflict"))
        {
            if (MessageBox.Show(this, "Этот проект уже редактируется в другом окне. Открыть только для чтения?", "Проект занят", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            result = await Call("projectOpenWindow", Json.Obj(("id", id), ("readOnly", true)));
        }
        if (result?.Str("window") is { Length: > 0 } key) { var window = new MainWindow(Backend, key, result["state"]); window.Show(); }
    }
    public async Task OpenTemplates(bool create)
    {
        if (!create && Root.Length == 0) return;
        var templates = (await Call("nativeTemplates"))?.AsArray() ?? new JsonArray();
        var panel = new DockPanel { Margin = new Thickness(16) }; var header = new StackPanel(); DockPanel.SetDock(header, System.Windows.Controls.Dock.Top);
        header.Children.Add(new TextBlock { Text = create ? "Новый проект" : "Подключить к проекту", FontSize = 20, Margin = new Thickness(0, 0, 0, 12) }); var name = new TextBox { Text = "my-project", MinWidth = 260 }; if (create) header.Children.Add(name);
        var list = new ComboBox { MinWidth = 280, Margin = new Thickness(2, 10, 2, 8), DisplayMemberPath = "Name", SelectedValuePath = "Id" }; var parameterPanel = new StackPanel(); header.Children.Add(list); header.Children.Add(parameterPanel);
        foreach (var template in templates.Where(t => t.Str("kind") == (create ? "project" : "attachment"))) if (template is not null) list.Items.Add(new TemplateEntry(template.Str("id"), Local(template["name"]), template));
        var inputs = new Dictionary<string, TextBox>(); var description = new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(4, 8, 4, 12) }; header.Children.Add(description);
        list.SelectionChanged += (_, _) => { parameterPanel.Children.Clear(); inputs.Clear(); if (list.SelectedItem is not TemplateEntry selected) return; description.Text = Local(selected.Value["description"]); foreach (var p in selected.Value["parameters"]?.AsArray() ?? new JsonArray()) { if (p is null) continue; parameterPanel.Children.Add(Ui.Label(Local(p["label"]))); var input = new TextBox { Text = p.Str("default") }; inputs[p.Str("id")] = input; parameterPanel.Children.Add(input); } };
        var requirements = new CheckBox { Content = "Включить необходимые инструменты", IsChecked = true, Foreground = Ui.Brush("#D4D4D4"), Margin = new Thickness(4, 6, 4, 8) }; header.Children.Add(requirements);
        var apply = Ui.Button(create ? "Создать" : "Подключить", async () =>
        {
            if (list.SelectedItem is not TemplateEntry selected) return;
            await SaveAll(); var values = new JsonObject(); foreach (var pair in inputs) values[pair.Key] = pair.Value.Text;
            var result = await Call("nativeTemplateApply", Json.Obj(("id", selected.Id), ("name", name.Text.Trim()), ("parameters", values), ("installRequirements", requirements.IsChecked == true)));
            if (result?["conflicts"] is JsonArray { Count: > 0 }) throw new IOException("Существующие файлы сохранены. Конфликт: " + string.Join(", ", result["conflicts"]!.AsArray()));
            if (result?["state"] is { } state) State = state.DeepClone(); await ApplyState(); if (result?.Str("entryFile") is { Length: > 0 } file) await OpenFile(Path.Combine(Root, file));
        }); apply.Background = Ui.Brush("#355571"); header.Children.Add(apply); panel.Children.Add(header); list.SelectedIndex = 0; ShowUtility(create ? "new-project" : "templates", create ? "Новый проект" : "Шаблоны проекта", panel);
    }
    public string Local(JsonNode? value) => value is JsonObject ? value.Str(Settings.Str("language", "ru"), value.Str("en")) : value?.ToString() ?? "";
    record TemplateEntry(string Id, string Name, JsonNode Value) { public override string ToString()=>Name; }
}

public sealed class AddonPage : UserControl
{
    readonly MainWindow window;
    readonly ListBox list = new();
    readonly ContentControl details = new();
    readonly TextBox search = new() { Margin = new Thickness(10), ToolTip = "Поиск по названию, описанию и id" };
    readonly ComboBox filter = new() { ItemsSource = new[] { "Все", "Включены", "Установлены", "Не установлены", "Паки", "Библиотеки" }, SelectedIndex = 0, Margin = new Thickness(10, 0, 10, 8) };
    JsonArray entries = new();
    bool gallery;
    int loadRevision,detailRevision;
    public AddonPage(MainWindow window)
    {
        this.window = window;
        var grid = new Grid(); grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(300) }); grid.ColumnDefinitions.Add(new ColumnDefinition());
        var side = new DockPanel { Background = Ui.Brush("#252526") }; var toolbar = new StackPanel(); toolbar.Children.Add(search); toolbar.Children.Add(filter); toolbar.Children.Add(Ui.Row(Ui.Button("DevForge", async () => { gallery = false; await Load(); }), Ui.Button("Open VSX", async () => { gallery = true; await Load(); }))); DockPanel.SetDock(toolbar, System.Windows.Controls.Dock.Top); side.Children.Add(toolbar); side.Children.Add(list); grid.Children.Add(side); Grid.SetColumn(details, 1); grid.Children.Add(details); Content = grid;
        search.TextChanged += async (_, _) => { if (gallery) { var text=search.Text;await Task.Delay(350);if(gallery&&text==search.Text)await Load(); } else Paint(); }; filter.SelectionChanged += (_, _) => Paint(); list.SelectionChanged += async (_, _) => { if (list.SelectedItem is ListBoxItem { Tag: JsonNode entry })try{await Detail(entry);}catch(Exception error){Ui.Error(details,error.Message);} }; Loaded += async (_, _) => await Load();
    }
    async Task Load()
    {
        var request=++loadRevision;var mode=gallery;
        try
        {
            if (gallery)
            {
                await window.Call("nativeAddonToggle", Json.Obj(("id", "studio.vsix"), ("enable", true)));
                var result = await window.Call("extensionGallerySearch", Json.Obj(("query", search.Text), ("category", "all"), ("sortBy", "relevance")));if(request!=loadRevision||mode!=gallery)return;entries = (result?["extensions"] as JsonArray ?? result?["results"] as JsonArray ?? new JsonArray()).DeepClone().AsArray();
            }
            else {var result=(await window.Call("nativeAddonCatalog"))?.AsArray()??new JsonArray();if(request!=loadRevision||mode!=gallery)return;entries=result;}
            Paint();
        }
        catch (Exception error) { Ui.Error(this, error.Message); }
    }
    void Paint()
    {
        list.Items.Clear();
        foreach (var entry in entries)
        {
            if (entry is null || entry["compatible"]?.ToString()=="false") continue; var manifest = entry["manifest"] ?? entry; var name = window.Local(manifest["name"]); var description = window.Local(manifest["description"]); var enabled = entry.Flag("enabled"); var installed = entry.Flag("installed");
            if (!(name + " " + description + " " + manifest.Str("id")).Contains(search.Text, StringComparison.OrdinalIgnoreCase) || filter.SelectedIndex == 1 && !enabled || filter.SelectedIndex == 2 && !installed || filter.SelectedIndex == 3 && installed || filter.SelectedIndex == 4 && manifest.Str("kind") != "pack" || filter.SelectedIndex == 5 && manifest.Str("kind") != "library") continue;
            var body = new StackPanel { Margin = new Thickness(10, 7, 6, 8) }; body.Children.Add(new TextBlock { Text = name.Length > 0 ? name : manifest.Str("displayName", manifest.Str("name")), FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap }); body.Children.Add(new TextBlock { Text = description, TextWrapping = TextWrapping.Wrap, MaxHeight = 36, Margin = new Thickness(0, 5, 0, 5), Foreground = Ui.Brush("#B6B6BA") }); body.Children.Add(Ui.Label(entry.Flag("core") ? "Встроено" : enabled ? "Включено" : installed ? "Установлено" : "Доступно", enabled ? "#78C391" : installed ? "#8BB6DC" : "#ACACB0"));
            var row = new ListBoxItem { Tag = entry, Content = new Border { BorderBrush = Ui.Brush(enabled ? "#78C391" : installed ? "#6E9FCA" : "#444448"), BorderThickness = new Thickness(3, 0, 0, 0), Child = body }, HorizontalContentAlignment = HorizontalAlignment.Stretch, VerticalContentAlignment = VerticalAlignment.Top, Padding = new Thickness(0), MinHeight = 90 }; list.Items.Add(row);
        }
    }
    async Task Detail(JsonNode entry)
    {
        ++detailRevision;
        if (gallery) { await GalleryDetail(entry); return; }
        var manifest = entry["manifest"]!; var id = manifest.Str("id"); var panel = new StackPanel { Margin = new Thickness(24) };
        panel.Children.Add(new TextBlock { Text = window.Local(manifest["name"]), FontSize = 23, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap }); panel.Children.Add(new TextBlock { Text = window.Local(manifest["description"]), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 12, 0, 14) });
        var actions = Ui.Row();
        if (entry.Flag("core")) actions.Children.Add(Ui.Label("Встроенный оконник"));
        else
        {
            var toggle = Ui.Button(entry.Flag("enabled") ? "Отключить" : entry.Flag("installed") ? "Включить" : "Установить", async () => { var enable = !entry.Flag("enabled"); if (!enable && !await Confirm(id, false)) return; await window.Call("nativeAddonToggle", Json.Obj(("id", id), ("enable", enable), ("confirm", true))); await Load(); }); toggle.Background = Ui.Brush("#355571"); actions.Children.Add(toggle);
            if (entry.Flag("installed")) actions.Children.Add(Ui.Button(entry.Flag("builtin") ? "Отключить компонент" : "Удалить", async () => { if (!await Confirm(id, true)) return; await window.Call("nativeAddonRemove", Json.Obj(("id", id), ("confirm", true))); await Load(); }));
        }
        actions.Children.Add(Ui.Button("Настройки", () => window.OpenSettings())); panel.Children.Add(actions); panel.Children.Add(Ui.Label(id + " · " + manifest.Str("version")));
        panel.Children.Add(new TextBlock { Text = window.Local(manifest["readme"]), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 20, 0, 14) });
        if (manifest["dependencies"] is JsonObject dependencies && dependencies.Count > 0) { panel.Children.Add(Ui.Label("Зависимости")); foreach (var dep in dependencies) panel.Children.Add(Ui.Button(dep.Key, async () => { var match = entries.FirstOrDefault(e => e?["manifest"].Str("id") == dep.Key); if (match is not null) await Detail(match); })); }
        details.Content = new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled };
    }
    async Task<bool> Confirm(string id, bool removing)
    {
        var relations = await window.Call("nativeAddonRelations", Json.Obj(("id", id)));
        string Names(string key) => string.Join("\n", (relations?[key]?.AsArray() ?? new JsonArray()).Select(m => "• " + window.Local(m?["name"])));
        return MessageBox.Show(Window.GetWindow(this), (removing ? "Удалить / отключить " : "Отключить ") + id + "?\n\nТребуется этому дополнению:\n" + Names("requires") + "\n\nЗависимые дополнения будут отключены:\n" + Names("dependents"), "Зависимости", MessageBoxButton.OKCancel, MessageBoxImage.Warning) == MessageBoxResult.OK;
    }
    async Task GalleryDetail(JsonNode entry)
    {
        var request=detailRevision;
        var info = await window.Call("extensionGalleryInfo", Json.Obj(("namespace", entry.Str("namespace")), ("name", entry.Str("name")), ("version", entry.Str("version"))));
        if(request!=detailRevision||!gallery)return;
        var panel = new StackPanel { Margin = new Thickness(24) }; panel.Children.Add(new TextBlock { Text = info.Str("displayName", info.Str("name")), FontSize = 23, TextWrapping = TextWrapping.Wrap }); panel.Children.Add(new TextBlock { Text = info.Str("description"), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 12, 0, 12) });
        var supported = info.Flag("supported"); var button = Ui.Button(supported ? "Установить совместимые компоненты" : "Требуется VS Code Extension Host", async () => { if (MessageBox.Show(Window.GetWindow(this), "Установить сниппеты / JSON-тему этого автора?\n\n" + info.Str("publisher") + "\n" + info.Str("license"), "Стороннее расширение", MessageBoxButton.OKCancel, MessageBoxImage.Question) != MessageBoxResult.OK) return; await window.Call("nativeVsixInstall", Json.Obj(("namespace", entry.Str("namespace")), ("name", entry.Str("name")), ("version", entry.Str("version")), ("accepted", true))); gallery = false; await Load(); }); button.IsEnabled = supported; button.ToolTip = supported ? "Сниппеты и JSON-темы" : "Исполняемый Extension Host VS Code пока отсутствует"; panel.Children.Add(button); details.Content = panel;
    }
}
