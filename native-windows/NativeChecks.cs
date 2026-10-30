using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Documents;
using AvalonDock.Layout;

namespace DevForge.Native;

internal static class NativeChecks
{
    static readonly List<object> checks = new();
    static string DirectoryPath => App.Arguments.FirstOrDefault(a => a.StartsWith("--test-results="))?[15..] ?? Path.Combine(AppContext.BaseDirectory, "test-results");
    static void Check(string name, bool result) { checks.Add(new { name, passed = result }); if (!result) throw new InvalidOperationException("Check failed: " + name); }
    public static async Task Run(MainWindow window)
    {
        if (!App.Arguments.Contains("--isolated")) throw new InvalidOperationException("Self-tests require --isolated and a separate data directory.");
        Directory.CreateDirectory(DirectoryPath);
        Check("Native WPF window has no browser control", window.Content is System.Windows.Controls.Grid);
        if(App.Arguments.Contains("--self-test-failure-probe")){Ui.Error(window,"Intentional isolated failure: verify shutdown without a blocking dialog");return;}
        Check("Host explicitly reports a native editor and no browser", window.State["capabilities"].Str("editor") == "avalonedit" && !window.State["capabilities"].Flag("browser"));
        await window.Call("nativeTemplateApply", Json.Obj(("id", "studio.template.notebook"), ("name", "native-notebook")));
        var state = await window.Call("state"); await window.OpenProject(state!.Str("project"));
        var file = Path.Combine(window.Root, "notebook.ipynb").Replace('\\', '/'); await window.OpenFile(file); await WaitLayout();
        var notebook = window.ActiveFile?.Notebook ?? throw new InvalidOperationException("Notebook document did not activate.");
        var notebookDoc = window.ActiveFile!; var filled = JsonNode.Parse(notebookDoc.Source.Editor.Text)!; filled["cells"]!.AsArray()[0]!["source"] = new JsonArray("native_value = 76\n", "print(native_value + 1)\n"); filled["cells"]!.AsArray().Add(new JsonObject { ["cell_type"]="markdown",["metadata"]=new JsonObject(),["source"]=new JsonArray("## Native notebook\n","**Markdown** and `code` keep separate lines.\n","\n","- One document\n","- Native code cells") }); notebookDoc.Source.SetText(filled.ToJsonString(new JsonSerializerOptions { WriteIndented=true }), false);
        Check("Notebook opens as a native editor document", notebook.CellCount >= 1 && !notebook.IsRaw);
        await notebook.ToggleSource(); Check("Notebook JSON source uses JSON syntax highlighting", notebook.IsRaw && window.ActiveFile!.Source.LanguageId == "json" && window.ActiveFile.Source.Editor.SyntaxHighlighting is not null);
        await notebook.ToggleSource(); Check("The same visible control returns JSON to cells", !notebook.IsRaw);
        await notebook.RunAll().WaitAsync(TimeSpan.FromSeconds(30)); await window.SaveAll();
        Check("A native notebook cell executes in the real Python kernel", notebookDoc.Source.Editor.Text.Contains("77"));
        var raw = window.ActiveFile!.Source.Editor.Text; var pythonPath = Path.Combine(window.Root, "second.py").Replace('\\', '/'); await window.Call("newFile", Json.Obj(("path", pythonPath), ("text", "value = 17\nprint(value)\n"))); await window.RefreshTree(); await window.OpenFile(pythonPath); await WaitLayout();
        Check("Opening another file retains the notebook tab", window.Documents.Children.Count(d => d.ContentId == file || d.ContentId == pythonPath) == 2);
        await window.OpenFile(file); await WaitLayout(); Check("Switching tabs reactivates the notebook", window.ActiveFile?.Path == file);
        await window.OpenFile(pythonPath); await WaitLayout(); Check("Switching back reactivates Python", window.ActiveFile?.Path == pythonPath);
        await window.OpenFile(pythonPath.Replace('/','\\')); await WaitLayout(); Check("Slash and backslash paths cannot open duplicate file tabs", window.Documents.Children.Count(d=>d.ContentId.Replace('\\','/').Equals(pythonPath,StringComparison.OrdinalIgnoreCase))==1);
        var concurrentPath=window.Root+"/concurrent.py";await window.Call("newFile",Json.Obj(("path",concurrentPath),("text","print('concurrent')\n")));
        await Task.WhenAll(window.OpenFile(concurrentPath),window.OpenFile(concurrentPath));await WaitLayout();
        Check("Simultaneous opens reuse exactly one file document",window.OpenDocuments.Count(d=>d.Path==concurrentPath)==1&&window.Dock.Layout.Descendents().OfType<LayoutDocument>().Count(d=>d.ContentId==concurrentPath)==1);
        var broken=window.Root+"/damaged.ipynb";await window.Call("newFile",Json.Obj(("path",broken),("text","{\"nbformat\":4, broken")));await window.OpenFile(broken);await WaitLayout();
        Check("A damaged notebook opens as editable JSON without losing source",window.ActiveFile?.Notebook is {IsRaw:true}&&window.ActiveFile.Source.Editor.Text=="{\"nbformat\":4, broken");
        var damaged=window.ActiveFile!;damaged.Source.SetText("{\"nbformat\":4,\"cells\":[]}",false);await damaged.Notebook!.ToggleSource();
        Check("Repairing notebook JSON restores cell view in the same document",!damaged.Notebook.IsRaw&&damaged.Notebook.CellCount==0);
        await window.SaveAll(); Check("Switching views preserves exact notebook source", (await window.Call("read", Json.Obj(("path", file)))).Str("text") == raw);
        var catalog = (await window.Call("nativeAddonCatalog"))!.AsArray(); Check("Window manager is built-in rather than removable optional content", catalog.Any(e => e?["manifest"].Str("id") == "studio.window-manager" && e.Flag("core")));
        var config = new NativeEditor("fixture.json", "{\"a\": [1, true, null]}"); Check("Plain JSON has a real native syntax definition", config.Editor.SyntaxHighlighting?.GetNamedColor("String") is not null);
        var markdown = MarkdownDocument.Render("first\nsecond\n\n**bold** and `code`\n\n- item"); Check("Markdown is rendered without a browser", markdown.Blocks.Count >= 2);
        var editing = new NativeEditor("keyboard.cpp", ""); window.ShowUtility("typing-test","Keyboard test", editing); await WaitLayout(); editing.Editor.Focus();
        void Type(string text) { var composition = new TextComposition(InputManager.Current, editing.Editor.TextArea, text); var input = new TextCompositionEventArgs(Keyboard.PrimaryDevice,composition) { RoutedEvent=TextCompositionManager.TextInputEvent }; editing.Editor.TextArea.RaiseEvent(input); }
        Type("("); Check("Native text input inserts a matching closing bracket",editing.Editor.Text=="()"&&editing.Editor.CaretOffset==1);Type(")");Check("Typing a generated closer advances the caret without duplication",editing.Editor.Text=="()"&&editing.Editor.CaretOffset==2);
        editing.SetText("");Type("{");EditingCommands.EnterParagraphBreak.Execute(null,editing.Editor.TextArea);Check("Enter keeps the closing brace aligned outside the indented body",editing.Editor.Text.Replace("\r\n","\n")=="{\n    \n}");
        editing.SetText("abcdefghijklmnopqr\nx\nabcdefghijklmnopqr");editing.Editor.CaretOffset=16;EditingCommands.MoveDownByLine.Execute(null,editing.Editor.TextArea);EditingCommands.MoveDownByLine.Execute(null,editing.Editor.TextArea);Check("Vertical navigation retains the intended column across a short line",editing.Editor.TextArea.Caret.Column==17);
        foreach(var preset in new[]{"DevForge","CLion","VS Code"})Check("Shortcut preset has no conflicting commands: "+preset,NativeKeymap.Validate(NativeKeymap.Preset(preset)).Count==NativeKeymap.Commands.Length);
        var conflicting=NativeKeymap.Preset("DevForge");conflicting["run"]="Ctrl+S";var refused=false;try{NativeKeymap.Validate(conflicting);}catch(InvalidOperationException){refused=true;}Check("Conflicting shortcuts are rejected before settings are saved",refused);
        editing.SetText("fn");new CompletionItem("fn","","int ${1:name}() {\n    $0\n}").Complete(editing.Editor.TextArea,new ICSharpCode.AvalonEdit.Document.TextSegment{StartOffset=0,Length=2},EventArgs.Empty);Check("Imported snippet replaces its prefix and selects the first placeholder",editing.Editor.Text.Contains("int name()")&&editing.Editor.SelectedText=="name");
        Check("Python cursor columns count Unicode characters rather than surrogate halves",PythonHover.Column("x = '😀'",8)==7);
        if(App.Arguments.Contains("--with-toolchain")) {
        var cpp=window.Root+"/analysis.cpp";await window.Call("newFile",Json.Obj(("path",cpp),("text","int main(){int unused_native = 42;return 0;}\n")));await window.OpenFile(cpp);var cppDoc=window.ActiveFile!;await window.Call("nativeAddonToggle",Json.Obj(("id","studio.clangd"),("enable",true)));await LanguageServices.Start(window);
        var deadline=DateTime.UtcNow.AddSeconds(20);while(!cppDoc.Source.LastDiagnostics.Any(d=>d.Str("message").Contains("unused_native"))&&DateTime.UtcNow<deadline)await Task.Delay(80);
        Check("Native editor receives a real clangd unused-variable diagnostic",cppDoc.Source.LastDiagnostics.Any(d=>d.Str("message").Contains("unused_native")&&d?["tags"] is JsonArray tags&&tags.Any(t=>t?.ToString()=="1")));
        var revision=cppDoc.Source.DiagnosticRevision;await window.FormatActive();deadline=DateTime.UtcNow.AddSeconds(20);while(cppDoc.Source.DiagnosticRevision<=revision&&DateTime.UtcNow<deadline)await Task.Delay(80);
        Check("Formatting triggers a new clangd analysis without losing unused diagnostics",cppDoc.Source.DiagnosticRevision>revision&&cppDoc.Source.LastDiagnostics.Any(d=>d.Str("message").Contains("unused_native")));
        }
        var addons=new AddonPage(window);window.ShowUtility("catalog-test","Addon test",addons);await WaitLayout();await Task.Delay(200);var query=Descendants<TextBox>(addons).First();query.Text="окон";await WaitLayout();var card=Descendants<ListBoxItem>(addons).FirstOrDefault();Check("A single addon card keeps a compact height",card is not null&&card.ActualHeight<160&&card.ActualHeight>40);
        await window.OpenSettings(); await WaitLayout(); Check("Utility pages remain tabs and preserve the two source documents", window.Documents.Children.Count >= 3);
        var projectPane=window.Dock.Layout.Descendents().OfType<LayoutAnchorable>().Single(p=>p.ContentId=="project").Parent as LayoutAnchorablePane ?? throw new InvalidOperationException("Explorer is not docked");
        projectPane.DockWidth=new GridLength(295);await WaitLayout();var layout=window.CaptureLayout();projectPane.DockWidth=new GridLength(180);window.RestoreLayout(layout);await WaitLayout();
        var restoredPane=(LayoutAnchorablePane)window.Dock.Layout.Descendents().OfType<LayoutAnchorable>().Single(p=>p.ContentId=="project").Parent;
        Check("Resized docked panels retain their width through layout restore",Math.Abs(restoredPane.DockWidth.Value-295)<1);
        await window.OpenFile(pythonPath);await WaitLayout();Check("Deserialized file tabs reactivate their original editor",window.ActiveFile?.Path==pythonPath&&window.ActiveFile.Source.Editor.Text.Contains("value = 17"));
        await window.OpenFile(file); await WaitLayout();
        var surface=(FrameworkElement)window.Content;var bitmap = new RenderTargetBitmap((int)surface.ActualWidth, (int)surface.ActualHeight, 96, 96, PixelFormats.Pbgra32); bitmap.Render(surface); var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(bitmap)); using (var output = File.Create(Path.Combine(DirectoryPath, "native-notebook.png"))) encoder.Save(output);
        var report = new { passed = true, checks, browser = false, workingSetBytes = Process.GetCurrentProcess().WorkingSet64, note = "WPF native interactions in an isolated workspace; no physical Android or cross-platform builds." };
        await File.WriteAllTextAsync(Path.Combine(DirectoryPath, "native-ui.json"), JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
        window.Close();
    }
    static async Task WaitLayout() { await Task.Delay(100); await Application.Current.Dispatcher.InvokeAsync(() => { }, System.Windows.Threading.DispatcherPriority.ApplicationIdle); }
    static IEnumerable<T> Descendants<T>(DependencyObject owner) where T:DependencyObject { for(var i=0;i<VisualTreeHelper.GetChildrenCount(owner);i++){var child=VisualTreeHelper.GetChild(owner,i);if(child is T found)yield return found;foreach(var nested in Descendants<T>(child))yield return nested;} }
    public static Task Failed(Exception error) { Directory.CreateDirectory(DirectoryPath); File.WriteAllText(Path.Combine(DirectoryPath, "native-ui.json"), JsonSerializer.Serialize(new { passed = false, checks, error = error.ToString() }, new JsonSerializerOptions { WriteIndented = true })); return Task.CompletedTask; }
}
