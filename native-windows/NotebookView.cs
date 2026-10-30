using System.Text.Json;
using System.Diagnostics;
using System.IO;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using Markdig;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;

namespace DevForge.Native;

/// <summary>A notebook is a document of native code/Markdown cells, not a modal.</summary>
public sealed class NotebookView : UserControl, IDisposable
{
    readonly MainWindow window;
    readonly FileDocument document;
    readonly StackPanel cells = new();
    readonly Grid body = new();
    readonly TextBlock status = Ui.Label("");
    readonly Button sourceToggle;
    readonly Dictionary<JsonNode, Cell> views = new();
    readonly Dictionary<string, (JsonNode cell, TaskCompletionSource<bool> done)> pending = new();
    JsonNode notebook;
    bool raw, writing, busy;
    int? session;
    Cell? focusedCell;
    public int CellCount => notebook["cells"]?.AsArray().Count ?? 0;
    public bool IsRaw => raw;
    public NotebookView(MainWindow window, FileDocument document)
    {
        this.window = window; this.document = document;
        // A damaged notebook must remain editable as JSON, without leaving a
        // half-created document or silently replacing the user's source.
        notebook = new JsonObject { ["cells"] = new JsonArray(), ["nbformat"] = 4 };
        var layout = new DockPanel(); var header = new StackPanel(); DockPanel.SetDock(header, System.Windows.Controls.Dock.Top);
        var toolbar = Ui.Row(Ui.Button("Выполнить всё", RunAll), Ui.Icon("refresh", Stop, "Перезапустить ядро"), Ui.Icon("plus", () => Add("code"), "Добавить код"), Ui.Button("Markdown", () => Add("markdown")), Ui.Icon("settings", ResourceSettings, "Ресурсы notebook"), Ui.Icon("save", () => window.Save(document), "Сохранить notebook"));
        sourceToggle = Ui.Button("JSON", ToggleSource, "JSON ↔ ячейки"); toolbar.Children.Add(sourceToggle); header.Children.Add(toolbar); header.Children.Add(status); layout.Children.Add(header);
        body.Children.Add(new ScrollViewer { Content = cells, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled });
        document.Source.Visibility = Visibility.Collapsed; body.Children.Add(document.Source); layout.Children.Add(body); Content = layout;
        document.Source.Changed += SourceChanged;
        try { notebook=Parse(document.Source.Editor.Text); Render(); }
        catch(Exception error) when(error is JsonException or InvalidDataException or InvalidOperationException) { raw=true; status.Text="[Notebook] "+error.Message; UpdateMode(); }
    }
    static JsonNode Parse(string text)
    {
        var result = JsonNode.Parse(text) ?? throw new InvalidDataException("Пустой notebook");
        if (result is not JsonObject || result["nbformat"]?.ToString() != "4" || result["cells"] is not JsonArray array) throw new InvalidDataException("Ожидается notebook формата 4.");
        foreach(var cell in array) if(cell is not JsonObject || cell.Str("cell_type") is not ("code" or "markdown" or "raw") || cell["source"] is not (JsonArray or JsonValue) || (cell["outputs"] is not null && cell["outputs"] is not JsonArray)) throw new InvalidDataException("Некорректная структура ячейки notebook.");
        return result;
    }
    public Task ToggleSource()
    {
        if (raw) { notebook = Parse(document.Source.Editor.Text); Render(); status.Text=""; }
        raw = !raw; UpdateMode(); return Task.CompletedTask;
    }
    void UpdateMode() { document.Source.Editor.IsReadOnly=document.ReadOnly||busy;document.Source.Visibility=raw?Visibility.Visible:Visibility.Collapsed;body.Children[0].Visibility=raw?Visibility.Collapsed:Visibility.Visible;sourceToggle.Content=raw?"Ячейки":"JSON"; }
    void SourceChanged() { if (!writing && !raw && !busy) try { notebook = Parse(document.Source.Editor.Text); Render(); } catch (Exception error) { raw=true;UpdateMode();status.Text = "[Notebook] "+error.Message; } }
    void Commit()
    {
        writing = true; try { var text = notebook.ToJsonString(new JsonSerializerOptions { WriteIndented = true }); document.Source.SetText(text, false); document.Tab.Title = System.IO.Path.GetFileName(document.Path) + " •"; } finally { writing = false; }
    }
    Task Add(string kind)
    {
        if (busy || raw || document.ReadOnly) return Task.CompletedTask;
        var cell = new JsonObject { ["cell_type"] = kind, ["metadata"] = new JsonObject(), ["source"] = new JsonArray(), ["id"] = Guid.NewGuid().ToString("N")[..12] };
        if (kind == "code") { cell["outputs"] = new JsonArray(); cell["execution_count"] = null; }
        notebook["cells"]!.AsArray().Add(cell); Commit(); Render(); return Task.CompletedTask;
    }
    void Render()
    {
        cells.Children.Clear(); views.Clear();
        var array = notebook["cells"]!.AsArray();
        foreach (var (node, index) in array.Select((value, index) => (value!, index)))
        {
            var source = Source(node); var markdown = node.Str("cell_type") == "markdown";
            var container = new DockPanel(); var bar = Ui.Row(); DockPanel.SetDock(bar, System.Windows.Controls.Dock.Top);
            bar.Children.Add(Ui.Label(markdown ? "Markdown" : "In [" + (node["execution_count"]?.ToString() ?? " ") + "]", markdown ? "#C1ACCA" : "#96969E"));
            if (!markdown) bar.Children.Add(Ui.Icon("play", () => Run(node), "Выполнить ячейку · Shift+Enter", "#70BC91"));
            bar.Children.Add(Ui.Icon("up", () => Move(node, -1), "Переместить выше")); bar.Children.Add(Ui.Icon("down", () => Move(node, 1), "Переместить ниже"));
            bar.Children.Add(Ui.Icon("trash", () => { if (!busy && !document.ReadOnly) { array.Remove(node); Commit(); Render(); } return Task.CompletedTask; }, "Удалить ячейку")); container.Children.Add(bar);
            var inner = new StackPanel(); var editor = new NativeEditor(markdown ? "cell.md" : "cell.py", source, document.ReadOnly) { MinHeight = 32 };
            editor.KeymapSettings=()=>window.Settings;editor.Editor.FontSize=window.Settings["fontSize"]?.GetValue<double>()??14;
            if(!markdown)PythonHover.Attach(window,editor,()=>{var previous=string.Join("\n\n",array.Take(array.IndexOf(node)).Where(c=>c.Str("cell_type")=="code").Select(c=>Source(c!)));var prefix=previous.Length>0?previous+"\n\n":"";return(document.Path,prefix+editor.Editor.Text,prefix.Count(c=>c=='\n'),true);});
            editor.Editor.ShowLineNumbers = false; editor.Editor.Options.AllowScrollBelowDocument = false; editor.Editor.VerticalScrollBarVisibility = ScrollBarVisibility.Disabled;
            void Height() { var lines=editor.Editor.Document.LineCount;if(!editor.IsKeyboardFocusWithin&&editor.Editor.Text.EndsWith('\n'))lines=Math.Max(1,lines-1);var measured=lines*editor.Editor.TextArea.TextView.DefaultLineHeight+editor.Editor.Padding.Top+editor.Editor.Padding.Bottom+2;editor.Height=Math.Clamp(measured,34,520);editor.Editor.VerticalScrollBarVisibility=measured>520?ScrollBarVisibility.Auto:ScrollBarVisibility.Disabled; }
            Height(); var cell = new Cell(node, editor, new TextBox { IsReadOnly = true, AcceptsReturn = true, FontFamily = new FontFamily("Consolas"), FontSize = 12, Background = Brushes.Transparent, BorderThickness = new Thickness(0), Visibility = Visibility.Collapsed, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(8, 4, 8, 5) });
            editor.Changed += () => { node["source"] = Lines(editor.Editor.Text); Height(); Commit(); };
            editor.Loaded+=(_,_)=>Height();
            editor.GotKeyboardFocus+=(_,_)=>Height();editor.LostKeyboardFocus+=(_,_)=>Height();
            editor.GotKeyboardFocus+=(_,_)=>focusedCell=cell;
            editor.Editor.PreviewKeyDown += async (_, e) => { if (e.Key == Key.Enter && Keyboard.Modifiers.HasFlag(ModifierKeys.Shift)) { e.Handled = true; if (!markdown) await Run(node); else Keyboard.ClearFocus(); } };
            editor.CompletionRequested += async input =>
            {
                var location = input.Editor.Document.GetLocation(input.Editor.CaretOffset);
                if (markdown) return new[] { "**strong**", "*emphasis*", "[title](https://)", "```python\n\n```", "# Heading", "- item" }.Select(s => new CompletionItem(s)).ToArray();
                var preceding=string.Join("\n\n",array.Take(array.IndexOf(node)).Where(c=>c.Str("cell_type")=="code").Select(c=>Source(c!)));var prefix=preceding.Length>0?preceding+"\n\n":"";
                var response = await window.Call("pythonIntelligence", Json.Obj(("action", "complete"), ("root", window.Root), ("path", document.Path), ("text", prefix+input.Editor.Text), ("notebook", true), ("line", prefix.Count(c=>c=='\n')+location.Line), ("column", PythonHover.Column(input.Editor.Text,input.Editor.CaretOffset)), ("options", await window.EffectiveOptions())));
                return (response?["items"]?.AsArray() ?? new JsonArray()).Select(i => new CompletionItem(i.Str("label"), i.Str("kind"))).Concat(await window.Snippets("python")).ToArray();
            };
            if (markdown)
            {
                var preview = new FlowDocumentScrollViewer { Document = MarkdownDocument.Render(source), IsToolBarVisible = false, VerticalScrollBarVisibility = ScrollBarVisibility.Disabled, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled, MinHeight = 38 };
                editor.Visibility = Visibility.Collapsed; preview.PreviewMouseLeftButtonDown += (_, e) => { preview.Visibility = Visibility.Collapsed; editor.Visibility = Visibility.Visible; editor.Editor.Focus(); e.Handled = true; };
                editor.LostKeyboardFocus += (_, _) => { if (!editor.IsKeyboardFocusWithin) { preview.Document = MarkdownDocument.Render(editor.Editor.Text); preview.Visibility = Visibility.Visible; editor.Visibility = Visibility.Collapsed; } }; inner.Children.Add(preview);
            }
            inner.Children.Add(editor); inner.Children.Add(cell.Output); container.Children.Add(inner); views[node] = cell;
            cells.Children.Add(new Border { Child = container, BorderBrush = Ui.Brush(markdown ? "#7D6E85" : "#3D4952"), BorderThickness = new Thickness(markdown ? 3 : 1, 1, 1, 1), CornerRadius = new CornerRadius(5), Margin = new Thickness(18, 8, 18, 8), Padding = new Thickness(7, 3, 7, 4), Background = Ui.Brush(markdown ? "#242127" : "#202021") }); RenderOutput(node);
        }
    }
    Task Move(JsonNode node, int by) { var array = notebook["cells"]!.AsArray(); var from = array.IndexOf(node); var to = from + by; if (!busy && to >= 0 && to < array.Count) { array.RemoveAt(from); array.Insert(to, node); Commit(); Render(); } return Task.CompletedTask; }
    internal Task FormatCurrent() => !busy&&!raw&&focusedCell is {} cell&&views.ContainsKey(cell.Node)?window.FormatEditor(cell.Editor,document.Path,true):Task.CompletedTask;
    public async Task RunAll() { if(busy)return;if(raw)await ToggleSource();foreach (var cell in notebook["cells"]!.AsArray().ToArray()) if (cell.Str("cell_type") == "code") { if (!await Run(cell!)) break; } }
    async Task<bool> Run(JsonNode node)
    {
        if (busy || document.ReadOnly) return false;
        if(raw)return false;
        busy = true; UpdateMode(); var code=Source(node);
        try
        {
            await window.EnsureTrust();
            await window.Call("nativeAddonToggle", Json.Obj(("id", "studio.notebooks"), ("enable", true)));
            await window.Call("nativeAddonToggle", Json.Obj(("id", "studio.python"), ("enable", true)));
            Commit(); await window.Save(document); var options=await ResourceOptions();var start = await window.Call("notebookStart", Json.Obj(("path", document.Path), ("options", options))); session = start?["session"]?.GetValue<int>();
            node["outputs"] = new JsonArray(); node["execution_count"] = null; RenderOutput(node); var id = Guid.NewGuid().ToString("N"); var done = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously); pending[id] = (node, done); status.Text = "Выполняется…";
            await window.Call("notebookExecute", Json.Obj(("path", document.Path), ("id", id), ("cell", notebook["cells"]!.AsArray().IndexOf(node) + 1), ("code", code))); return await done.Task;
        }
        finally { busy = false; UpdateMode(); }
    }
    public void Receive(JsonNode? data)
    {
        if (data.Str("path") != document.Path || data?["session"]?.GetValue<int>() != session) return;
        var type = data.Str("type");
        if (type == "stopped") { foreach (var item in pending.Values) item.done.TrySetException(new IOException("Ядро остановлено")); pending.Clear(); status.Text = "Ядро остановлено"; return; }
        if (!pending.TryGetValue(data.Str("id"), out var pendingCell)) return;
        var node = pendingCell.cell; var outputs = node["outputs"]!.AsArray();
        if (type == "stream") outputs.Add(new JsonObject { ["output_type"] = "stream", ["name"] = data.Str("name", "stdout"), ["text"] = Lines(data.Str("text")) });
        else if (type == "result" || type == "display") outputs.Add(new JsonObject { ["output_type"] = "display_data", ["data"] = data?["data"]?.DeepClone() ?? new JsonObject { ["text/plain"] = data.Str("text") }, ["metadata"] = new JsonObject() });
        else if (type == "error") outputs.Add(new JsonObject { ["output_type"] = "error", ["ename"] = data.Str("ename"), ["evalue"] = data.Str("evalue"), ["traceback"] = data?["traceback"]?.DeepClone() ?? new JsonArray() });
        else if (type == "idle") { node["execution_count"] = data?["count"]?.DeepClone() ?? data?["execution_count"]?.DeepClone(); pending.Remove(data.Str("id")); status.Text = ""; Commit(); pendingCell.done.TrySetResult(!outputs.Any(o => o.Str("output_type") == "error")); }
        RenderOutput(node);
    }
    void RenderOutput(JsonNode node)
    {
        if (!views.TryGetValue(node, out var view)) return;
        view.Output.Text = string.Join("", (node["outputs"]?.AsArray() ?? new JsonArray()).Select(o => o.Str("output_type") == "error" ? "[Runtime] " + o.Str("ename") + ": " + o.Str("evalue") + "\n" + string.Join("\n", o?["traceback"]?.AsArray() ?? new JsonArray()) : o?["text"] is { } text ? Text(text) : Text(o?["data"]?["text/plain"])));
        view.Output.Visibility = view.Output.Text.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
    }
    public async Task Stop() { await window.Call("notebookStop"); session = null; status.Text = "Ядро остановлено"; }
    async Task ResourceSettings()
    {
        if(busy||raw||document.ReadOnly)return;
        var capacity = await window.Call("notebookResourceInfo");var options=await ResourceOptions(); var panel = new StackPanel { Margin = new Thickness(18) }; var entries = new List<(string key, TextBox input)>();
        foreach (var (key, label, maximum) in new[] { ("notebookMemoryMb", "Оперативная память · МиБ", capacity?["totalMemoryMb"]?.GetValue<double>() ?? 32768), ("notebookCpuPercent", "CPU · %", 100d), ("notebookDiskMb", "Рабочая папка · МиБ", capacity?["diskFreeMb"]?.GetValue<double>() ?? 1000000), ("notebookTimeoutSeconds", "Время ячейки · с", 3600d), ("notebookTotalSeconds", "Время notebook · с", 86400d) })
        {
            panel.Children.Add(Ui.Label(label)); var initial = options[key]?.GetValue<double>() ?? 0; var slider = new Slider { Minimum = 0, Maximum = maximum, Value = initial, Width = 300, TickFrequency = maximum / 100, Margin = new Thickness(6, 5, 6, 8) }; var input = new TextBox { Text = initial == 0 ? "∞" : initial.ToString("0"), Width = 90 };
            slider.ValueChanged += (_, _) => input.Text = slider.Value < 1 ? "∞" : Math.Round(slider.Value).ToString(); input.LostFocus += (_, _) => { if (double.TryParse(input.Text, out var value)) slider.Value = Math.Clamp(value, 0, maximum); }; entries.Add((key, input)); panel.Children.Add(Ui.Row(slider, input));
        }
        panel.Children.Add(Ui.Button("Применить и перезапустить ядро", async () => { var limits=new JsonObject();foreach (var (key, input) in entries) { var text = input.Text.Trim(); if (text == "∞") limits[key] = 0; else if (int.TryParse(text, out var value) && value >= 0) limits[key] = value; else throw new IOException("Введите число или ∞"); }notebook["metadata"]??=new JsonObject();notebook["metadata"]!["devforge"]??=new JsonObject();notebook["metadata"]!["devforge"]!["limits"]=limits;Commit();await window.Save(document); await Stop(); }));
        window.ShowUtility("notebook-resources", "Ресурсы notebook", panel);
    }
    async Task<JsonObject> ResourceOptions(){var options=await window.EffectiveOptions();foreach(var pair in notebook["metadata"]?["devforge"]?["limits"]?.AsObject()??new JsonObject())options[pair.Key]=pair.Value?.DeepClone();return options;}
    static string Source(JsonNode cell) => Text(cell["source"]);
    static string Text(JsonNode? source) => source is JsonArray array ? string.Concat(array.Select(s => s?.ToString())) : source?.ToString() ?? "";
    static JsonArray Lines(string text) { var parts = System.Text.RegularExpressions.Regex.Matches(text, ".*(?:\\n|$)").Where(m => m.Length > 0).Select(m => JsonValue.Create(m.Value)); return new JsonArray(parts.Cast<JsonNode?>().ToArray()); }
    public void Dispose() { document.Source.Changed -= SourceChanged; foreach (var item in pending.Values) item.done.TrySetCanceled(); pending.Clear(); }
    sealed record Cell(JsonNode Node, NativeEditor Editor, TextBox Output);
}

internal static class MarkdownDocument
{
    static readonly MarkdownPipeline pipeline = new MarkdownPipelineBuilder().UseAdvancedExtensions().Build();
    public static FlowDocument Render(string source)
    {
        var flow = new FlowDocument { Background = Brushes.Transparent, Foreground = Ui.Brush("#D4D4D4"), FontFamily = new FontFamily("Segoe UI"), FontSize = 14, PagePadding = new Thickness(7), TextAlignment = TextAlignment.Left };
        foreach (var block in Markdown.Parse(source, pipeline))
        {
            if (block is HeadingBlock heading) flow.Blocks.Add(new Paragraph(Inline(heading.Inline)) { FontSize = Math.Max(16, 29 - heading.Level * 2), FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 8, 0, 6) });
            else if (block is ParagraphBlock paragraph) flow.Blocks.Add(new Paragraph(Inline(paragraph.Inline)) { Margin = new Thickness(0, 4, 0, 8) });
            else if (block is CodeBlock code) flow.Blocks.Add(new Paragraph(new Run(code.Lines.ToString())) { FontFamily = new FontFamily("Consolas"), Background = Ui.Brush("#2C2C2E"), Padding = new Thickness(8), Margin = new Thickness(0, 6, 0, 8) });
            else if (block is ListBlock list)
            {
                var native = new System.Windows.Documents.List { MarkerStyle = list.IsOrdered ? TextMarkerStyle.Decimal : TextMarkerStyle.Disc };
                foreach (var item in list.OfType<ListItemBlock>()) foreach (var p in item.OfType<ParagraphBlock>()) native.ListItems.Add(new ListItem(new Paragraph(Inline(p.Inline)))); flow.Blocks.Add(native);
            }
            else if (block is ThematicBreakBlock) flow.Blocks.Add(new Paragraph(new Run("──────────────────")) { Foreground = Ui.Brush("#55555A") });
            else if (block is LeafBlock leaf) flow.Blocks.Add(new Paragraph(new Run(leaf.Lines.ToString())));
        }
        return flow;
    }
    static Span Inline(ContainerInline? container)
    {
        var span = new Span(); if (container is null) return span;
        foreach (var inline in container)
        {
            if (inline is LiteralInline literal) span.Inlines.Add(new Run(literal.Content.ToString()));
            else if (inline is LineBreakInline) span.Inlines.Add(new LineBreak());
            else if (inline is CodeInline code) span.Inlines.Add(new Run(code.Content) { FontFamily = new FontFamily("Consolas"), Background = Ui.Brush("#363638") });
            else if (inline is EmphasisInline emphasis) { var inner = Inline(emphasis); if (emphasis.DelimiterCount >= 2) inner.FontWeight = FontWeights.Bold; else inner.FontStyle = FontStyles.Italic; span.Inlines.Add(inner); }
            else if (inline is LinkInline link)
            {
                var href = new Hyperlink(Inline(link)); if (Uri.TryCreate(link.Url, UriKind.Absolute, out var uri) && uri.Scheme is "https" or "http") { href.NavigateUri = uri; href.RequestNavigate += (_, e) => Process.Start(new ProcessStartInfo(e.Uri.AbsoluteUri) { UseShellExecute = true }); } span.Inlines.Add(href);
            }
            else if (inline is ContainerInline nested) span.Inlines.Add(Inline(nested));
        }
        return span;
    }
}
