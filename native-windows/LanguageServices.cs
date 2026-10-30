using System.Collections.Concurrent;
using System.IO;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using ICSharpCode.AvalonEdit.Rendering;

namespace DevForge.Native;

/// <summary>LSP belongs to the project session, independently of its UI layout.</summary>
internal sealed class LanguageServices : IDisposable
{
    static readonly Dictionary<MainWindow, LanguageServices> clients = new();
    readonly MainWindow window;
    readonly ConcurrentDictionary<string, TaskCompletionSource<JsonNode?>> requests = new();
    readonly Dictionary<FileDocument, int> revisions = new();
    readonly Dictionary<FileDocument, Action> detach = new();
    readonly string root;
    long sequence;
    bool ready, disposed;
    Task? starting;
    LanguageServices(MainWindow window) { this.window = window; root=window.Root; window.Backend.Event += Receive; }
    public static Task Start(MainWindow window)
    {
        if (!clients.TryGetValue(window, out var client)) clients[window] = client = new LanguageServices(window);
        return client.starting ??= client.Initialize();
    }
    async Task Initialize()
    {
        try {
        var catalog=(await window.Call("nativeAddonCatalog"))?.AsArray()??new JsonArray();if(!catalog.Any(e=>e?["manifest"].Str("id")=="studio.clangd"&&e.Flag("enabled")))throw new IOException("Включите дополнение clangd в разделе «Анализ кода».");
        var options = await window.EffectiveOptions(); options["compiler"] ??= "gcc"; options["cppStandard"] ??= "c++20"; options["cStandard"] ??= "c17"; options["optimization"] ??= "debug";
        await window.Call("lspStart", options);
        await Request("initialize", Json.Obj(("processId", Environment.ProcessId), ("rootUri", new Uri(root.TrimEnd('/', '\\') + "/").AbsoluteUri), ("capabilities", new JsonObject { ["textDocument"] = new JsonObject { ["publishDiagnostics"] = new JsonObject { ["tagSupport"] = new JsonObject { ["valueSet"] = new JsonArray(1, 2) } }, ["completion"] = new JsonObject { ["completionItem"] = new JsonObject { ["snippetSupport"] = false } } } })));
        if(disposed||root!=window.Root)throw new OperationCanceledException("Проект сменился");
        await Notify("initialized", new JsonObject()); ready = true;
        foreach (var doc in window.OpenDocuments.ToArray()) if (doc.Source.LanguageId == "cpp") await Open(doc);
        } catch { starting=null; throw; }
    }
    public static void Reset(MainWindow window) { if(clients.Remove(window,out var client))client.Dispose(); }
    public static void CloseDocument(MainWindow window,FileDocument doc) { if(clients.TryGetValue(window,out var client))client.Close(doc); }
    public static async Task<IReadOnlyList<CompletionItem>> Complete(MainWindow window, FileDocument doc, NativeEditor editor)
    {
        await Start(window);
        var client = clients[window]; await client.Open(doc); await client.Sync(doc);
        var location = editor.Editor.Document.GetLocation(editor.Editor.CaretOffset);
        var result = await client.Request("textDocument/completion", Json.Obj(("textDocument", Json.Obj(("uri", new Uri(doc.Path).AbsoluteUri))), ("position", Json.Obj(("line", location.Line - 1), ("character", location.Column - 1)))));
        var list = result as JsonArray ?? result?["items"] as JsonArray ?? new JsonArray();
        return list.Where(i => i is not null).Select(i => new CompletionItem(i?["textEdit"]?.Str("newText", i.Str("insertText", i.Str("label"))) ?? i.Str("insertText", i.Str("label")), i.Str("detail"))).ToArray();
    }
    async Task Open(FileDocument doc)
    {
        if (disposed || revisions.ContainsKey(doc)) return; revisions[doc] = 1;
        await Notify("textDocument/didOpen", Json.Obj(("textDocument", Json.Obj(("uri", new Uri(doc.Path).AbsoluteUri), ("languageId", doc.Path.EndsWith(".c") ? "c" : "cpp"), ("version", 1), ("text", doc.Source.Editor.Text)))));
        var debounce = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(180) };
        Action changed=() => { debounce.Stop(); debounce.Start(); };
        doc.Source.Changed += changed;
        debounce.Tick += async (_, _) => { debounce.Stop(); try { if (ready && revisions.ContainsKey(doc)) await Sync(doc); } catch { } };
        System.Windows.Input.MouseEventHandler hover=async (_, e) =>
        {
            var position = doc.Source.Editor.GetPositionFromPoint(e.GetPosition(doc.Source.Editor)); if (position is null) return;
            try { var result = await Request("textDocument/hover", Json.Obj(("textDocument", Json.Obj(("uri", new Uri(doc.Path).AbsoluteUri))), ("position", Json.Obj(("line", position.Value.Line - 1), ("character", position.Value.Column - 1))))); var content = result?["contents"]; var text = content is JsonObject ? content.Str("value") : content?.ToString(); var current=doc.Source.Editor.GetPositionFromPoint(System.Windows.Input.Mouse.GetPosition(doc.Source.Editor)); if (!disposed && revisions.ContainsKey(doc) && current==position && !string.IsNullOrWhiteSpace(text)) doc.Source.ShowHover("[clangd] " + text); } catch { }
        };
        doc.Source.Editor.MouseHover += hover;
        detach[doc]=()=>{debounce.Stop();doc.Source.Changed-=changed;doc.Source.Editor.MouseHover-=hover;doc.Source.HideHover();};
    }
    void Close(FileDocument doc) { if(!revisions.Remove(doc))return;if(detach.Remove(doc,out var remove))remove();if(ready&&!disposed)_=CloseNotification(doc); }
    async Task CloseNotification(FileDocument doc) { try { await Notify("textDocument/didClose",Json.Obj(("textDocument",Json.Obj(("uri",new Uri(doc.Path).AbsoluteUri))))); } catch {} }
    Task Sync(FileDocument doc) => Notify("textDocument/didChange", Json.Obj(("textDocument", Json.Obj(("uri", new Uri(doc.Path).AbsoluteUri), ("version", ++revisions[doc]))), ("contentChanges", new JsonArray(Json.Obj(("text", doc.Source.Editor.Text))))));
    Task Notify(string method, JsonNode data) => window.Call("lspSend", Json.Obj(("message", Json.Obj(("jsonrpc", "2.0"), ("method", method), ("params", data)))));
    async Task<JsonNode?> Request(string method, JsonNode data)
    {
        if(disposed)throw new OperationCanceledException();
        var id = Interlocked.Increment(ref sequence).ToString(); var completion = new TaskCompletionSource<JsonNode?>(TaskCreationOptions.RunContinuationsAsynchronously); requests[id] = completion;
        try { await window.Call("lspSend", Json.Obj(("message", Json.Obj(("jsonrpc", "2.0"), ("id", id), ("method", method), ("params", data))))); return await completion.Task.WaitAsync(TimeSpan.FromSeconds(20)); } finally { requests.TryRemove(id, out _); }
    }
    void Receive(string windowId, string type, JsonNode? data)
    {
        if (disposed || windowId != window.WindowId || type != "lsp" || data is null) return;
        if (data["id"] is { } id && requests.TryRemove(id.ToString(), out var item)) { if (data["error"] is { } error) item.TrySetException(new IOException(error.ToString())); else item.TrySetResult(data["result"]?.DeepClone()); return; }
        if (data.Str("method") == "textDocument/publishDiagnostics")
        {
            var uri = data["params"].Str("uri"); var diagnostics = data["params"]?["diagnostics"]?.DeepClone().AsArray() ?? new JsonArray();
            window.Dispatcher.BeginInvoke(() => { if(disposed)return;foreach (var doc in revisions.Keys.Where(d => new Uri(d.Path).AbsoluteUri.Equals(uri,StringComparison.OrdinalIgnoreCase)).ToArray()) { doc.Source.LastDiagnostics=diagnostics.DeepClone().AsArray();doc.Source.DiagnosticRevision++;var transformers = doc.Source.Editor.TextArea.TextView.LineTransformers; foreach (var old in transformers.OfType<DiagnosticColors>().ToArray()) transformers.Remove(old); transformers.Add(new DiagnosticColors(diagnostics)); doc.Source.Editor.TextArea.TextView.Redraw(); } });
        }
    }
    public void Dispose() { disposed=true;ready=false;window.Backend.Event-=Receive;foreach(var doc in revisions.Keys.ToArray())Close(doc);foreach(var item in requests.Values)item.TrySetCanceled();requests.Clear(); }
    sealed class DiagnosticColors(JsonArray diagnostics) : DocumentColorizingTransformer
    {
        protected override void ColorizeLine(ICSharpCode.AvalonEdit.Document.DocumentLine line)
        {
            foreach (var diagnostic in diagnostics)
            {
                if (diagnostic?["range"]?["start"]?["line"]?.GetValue<int>() != line.LineNumber - 1) continue;
                var start = Math.Clamp(diagnostic["range"]!["start"]!["character"]!.GetValue<int>() + line.Offset, line.Offset, line.EndOffset);
                var end = Math.Clamp(diagnostic["range"]!["end"]!["character"]!.GetValue<int>() + line.Offset, start, line.EndOffset); if (end <= start) continue;
                var unused = diagnostic["tags"] is JsonArray tags && tags.Any(t => t?.ToString() == "1"); var warning = diagnostic["severity"]?.ToString() != "1";
                ChangeLinePart(start, end, element => { if (unused) element.TextRunProperties.SetForegroundBrush(Ui.Brush("#77777E")); else element.TextRunProperties.SetTextDecorations(new TextDecorationCollection { new TextDecoration { Location = TextDecorationLocation.Underline, Pen = new Pen(Ui.Brush(warning ? "#C7A767" : "#D57D78"), 1.2), PenThicknessUnit = TextDecorationUnit.Pixel } }); });
            }
        }
    }
}
