using System.Text.Json;
using System.IO;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace DevForge.Native;

internal sealed class ConfigurationEditor : UserControl
{
    readonly MainWindow window;
    readonly JsonNode document;
    readonly ListBox list = new();
    readonly StackPanel form = new() { Margin = new Thickness(18) };
    readonly CheckBox profiles = new() { Content = "Профили инструментов", Foreground = Ui.Brush("#D4D4D4"), Margin = new Thickness(7) };
    readonly NativeEditor raw;
    readonly Grid content = new();
    bool rawMode;
    JsonNode? selected;
    Action? flush;
    JsonArray Items => document[profiles.IsChecked == true ? "profiles" : "configurations"]!.AsArray();
    public ConfigurationEditor(MainWindow window, JsonNode value)
    {
        this.window = window; document = value.DeepClone(); raw = new NativeEditor("project.json", document.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        var layout = new DockPanel(); var toolbar = Ui.Row(Ui.Button("Применить", Save), Ui.Button("Подключить шаблон…", () => window.OpenTemplates(false)), Ui.Button("JSON ↔ форма", ToggleRaw)); ((Button)toolbar.Children[0]).Background = Ui.Brush("#355571"); DockPanel.SetDock(toolbar, System.Windows.Controls.Dock.Top); layout.Children.Add(toolbar);
        var grid = new Grid(); grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(200) }); grid.ColumnDefinitions.Add(new ColumnDefinition());
        var side = new DockPanel { Background = Ui.Brush("#252526") }; var controls = new StackPanel(); controls.Children.Add(profiles); controls.Children.Add(Ui.Row(Ui.Icon("plus", Add, "Добавить"), Ui.Button("Копия", Duplicate), Ui.Icon("trash", Remove, "Удалить"))); DockPanel.SetDock(controls, System.Windows.Controls.Dock.Top); side.Children.Add(controls); side.Children.Add(list); grid.Children.Add(side); Grid.SetColumn(form, 1); var scroll = new ScrollViewer { Content = form, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled }; Grid.SetColumn(scroll, 1); grid.Children.Add(scroll);
        content.Children.Add(grid); raw.Visibility = Visibility.Collapsed; content.Children.Add(raw); layout.Children.Add(content); Content = layout;
        profiles.Checked += (_, _) => PaintList(); profiles.Unchecked += (_, _) => PaintList(); list.SelectionChanged += (_, _) => { flush?.Invoke(); selected = (list.SelectedItem as ListBoxItem)?.Tag as JsonNode; PaintForm(); }; PaintList();
    }
    void PaintList()
    {
        flush?.Invoke(); flush = null; selected = null; list.Items.Clear();
        foreach (var item in Items) if (item is not null) list.Items.Add(new ListBoxItem { Content = item.Str("name", item.Str("id")), Tag = item, Padding = new Thickness(10, 7, 8, 7) });
        list.SelectedIndex = Items.Count == 0 ? -1 : 0;
    }
    void PaintForm()
    {
        form.Children.Clear(); flush = null; if (selected is null) return;
        var value = selected; var actions = new List<Action>();
        void Text(string key, string label, string fallback = "")
        {
            form.Children.Add(Ui.Label(label)); var input = new TextBox { Text = value.Str(key, fallback) }; form.Children.Add(input); actions.Add(() => value[key] = input.Text);
        }
        void Pick(string key, string label, string[] choices)
        {
            form.Children.Add(Ui.Label(label));var values=choices.Select(c=>new Choice(c,key=="cppStandard"?c.Replace("c++","C++").Replace("gnu++","GNU++"):key=="cStandard"?c.ToUpperInvariant():c)).ToArray();var input = new ComboBox { ItemsSource = values,DisplayMemberPath="Label",SelectedValuePath="Value", SelectedValue = value.Str(key, choices[0]), MinHeight = 28, Margin = new Thickness(2, 3, 2, 7) }; form.Children.Add(input); actions.Add(() => value[key] = input.SelectedValue?.ToString() ?? choices[0]);
            if(key=="type")input.SelectionChanged+=(_,_)=>{if(input.SelectedValue is not string type)return;flush?.Invoke();value["type"]=type;value["actions"]=DefaultActions(type);PaintForm();};
        }
        void Raw(string key, string label, JsonNode fallback)
        {
            form.Children.Add(Ui.Label(label)); var input = new TextBox { Text = (value[key] ?? fallback).ToJsonString(), AcceptsReturn = true, MinHeight = 50, TextWrapping = TextWrapping.Wrap }; form.Children.Add(input); actions.Add(() => value[key] = JsonNode.Parse(input.Text));
        }
        Text("name", "Название");
        if (profiles.IsChecked == true)
        {
            Pick("kind", "Тип профиля", ["cmake", "interpreter", "generic"]);
            if(value.Str("kind")!="interpreter"){Pick("compiler", "Компилятор C/C++", ["gcc", "clang"]); Pick("optimization", "Режим", ["debug", "release"]); Pick("cppStandard", "Стандарт C++", ["c++17", "c++20", "c++23", "gnu++23", "c++26"]); Pick("cStandard", "Стандарт C", ["c11", "c17", "c23"]);}
            Text("pythonExecutable", "Интерпретатор Python"); Text("buildDirectory", "Папка сборки", "build"); Raw("flags", "Флаги компилятора · JSON", new JsonArray()); Raw("cmakeOptions", "Параметры CMake · JSON", new JsonArray());
        }
        else
        {
            Pick("type", "Тип запуска", ["cmake", "project", "file", "python", "notebook", "executable", "custom"]);
            Pick("profile", "Профиль", document["profiles"]!.AsArray().Select(p => p.Str("id")).ToArray()); Text("source", "Исходный файл"); Text("target", "Цель CMake"); Text("workingDirectory", "Рабочая папка", "."); Text("executable", "Исполняемый файл"); Raw("args", "Аргументы программы · JSON", new JsonArray()); Raw("buildCommands", "Команды сборки · массив массивов JSON", new JsonArray()); Raw("runCommand", "Команда запуска · JSON", new JsonArray());
            var before = new CheckBox { Content = "Собирать перед запуском", IsChecked = value.Flag("buildBeforeRun"), Foreground = Ui.Brush("#D4D4D4"), Margin = new Thickness(5, 8, 5, 8) }; form.Children.Add(before); actions.Add(() => value["buildBeforeRun"] = before.IsChecked == true);
            Raw("actions", "Действия конфигурации · JSON", new JsonObject());
        }
        Raw("environment", "Переменные окружения · JSON", new JsonObject());
        flush = () => { foreach (var action in actions) action(); if (list.SelectedItem is ListBoxItem item) item.Content = value.Str("name"); };
    }
    Task Add()
    {
        flush?.Invoke(); var id = (profiles.IsChecked == true ? "profile-" : "run-") + Guid.NewGuid().ToString("N")[..8];
        Items.Add(profiles.IsChecked == true ? Json.Obj(("id", id), ("name", "Новый профиль"), ("kind", "generic"), ("compiler", "gcc"), ("optimization", "debug"), ("environment", new JsonObject())) : Json.Obj(("id", id), ("name", "Новый запуск"), ("type", "custom"), ("profile", document["profiles"]!.AsArray()[0].Str("id")), ("source", ""), ("target", ""), ("executable", ""), ("workingDirectory", "."), ("args", new JsonArray()), ("buildCommands", new JsonArray()), ("runCommand", new JsonArray()), ("environment", new JsonObject()), ("actions", new JsonObject()), ("buildBeforeRun", false)));
        PaintList(); list.SelectedIndex = Items.Count - 1; return Task.CompletedTask;
    }
    Task Duplicate() { if (selected is null) return Task.CompletedTask; flush?.Invoke(); var copy = selected.DeepClone(); copy["id"] = "copy-" + Guid.NewGuid().ToString("N")[..8]; copy["name"] = copy.Str("name") + " · копия"; Items.Add(copy); PaintList(); list.SelectedIndex = Items.Count - 1; return Task.CompletedTask; }
    Task Remove() { if (selected is null || Items.Count <= 1) return Task.CompletedTask; if (profiles.IsChecked == true && document["configurations"]!.AsArray().Any(c => c.Str("profile") == selected.Str("id"))) throw new InvalidOperationException("Этот профиль используется конфигурацией запуска."); var removed = selected; flush = null; Items.Remove(removed); if (removed.Str("id") == document.Str("active")) document["active"] = Items[0].Str("id"); PaintList(); return Task.CompletedTask; }
    Task ToggleRaw()
    {
        if (!rawMode) { flush?.Invoke(); raw.SetText(document.ToJsonString(new JsonSerializerOptions { WriteIndented = true })); }
        else { var parsed = JsonNode.Parse(raw.Editor.Text) ?? throw new InvalidDataException("Пустой JSON"); document.AsObject().Clear(); foreach (var pair in parsed.AsObject()) document[pair.Key] = pair.Value?.DeepClone(); PaintList(); }
        rawMode = !rawMode; raw.Visibility = rawMode ? Visibility.Visible : Visibility.Collapsed; content.Children[0].Visibility = rawMode ? Visibility.Collapsed : Visibility.Visible; return Task.CompletedTask;
    }
    async Task Save() { if (!rawMode) flush?.Invoke(); var value = rawMode ? JsonNode.Parse(raw.Editor.Text)! : document; await window.Call("nativeProjectSave", Json.Obj(("document", value))); await window.ReloadConfiguration(); }
    static JsonObject DefaultActions(string type)=>type switch{"python"=>Json.Obj(("run",Json.Obj(("provider","python.run")))),"notebook"=>Json.Obj(("run",Json.Obj(("provider","notebook.runAll")))),"cmake" or "project" or "file"=>Json.Obj(("build",Json.Obj(("provider","cpp.build"))),("run",Json.Obj(("provider","cpp.run"))),("debug",Json.Obj(("provider","cpp.debug")))),"executable"=>Json.Obj(("run",Json.Obj(("provider","cpp.executable"))),("debug",Json.Obj(("provider","cpp.debug")))),_=>new JsonObject()};
    sealed record Choice(string Value,string Label){public override string ToString()=>Label;}
}
