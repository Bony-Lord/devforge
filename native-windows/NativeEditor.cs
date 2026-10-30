using System.IO;
using System.Text.RegularExpressions;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using ICSharpCode.AvalonEdit;
using ICSharpCode.AvalonEdit.CodeCompletion;
using ICSharpCode.AvalonEdit.Document;
using ICSharpCode.AvalonEdit.Highlighting;
using ICSharpCode.AvalonEdit.Highlighting.Xshd;
using ICSharpCode.AvalonEdit.Indentation;
using ICSharpCode.AvalonEdit.Rendering;

namespace DevForge.Native;

public sealed class NativeEditor : UserControl
{
    public TextEditor Editor { get; }
    public string LanguageId { get; private set; } = "text";
    public event Action? Changed;
    public event Func<NativeEditor, Task<IReadOnlyList<CompletionItem>>>? CompletionRequested;
    public event Action<int>? BreakpointChanged;
    public HashSet<int> Breakpoints { get; } = [];
    public int? ExecutionLine { get; set; }
    public bool IsDirty { get; private set; }
    public Func<JsonNode?>? KeymapSettings { get; set; }
    internal JsonArray LastDiagnostics {get;set;}=new();
    internal int DiagnosticRevision {get;set;}
    readonly Dictionary<int, char> pairs = new();
    CompletionWindow? completion;
    ToolTip? hover;
    readonly DispatcherTimer completionTimer=new(){Interval=TimeSpan.FromMilliseconds(180)};
    bool completing;
    bool changing;
    public NativeEditor(string path, string text, bool readOnly = false)
    {
        Editor = new TextEditor
        {
            Text = text, ShowLineNumbers = true, FontFamily = new FontFamily("Cascadia Code, Consolas"), FontSize = 14,
            Background = Ui.Brush("#1E1E1E"), Foreground = Ui.Brush("#D4D4D4"), LineNumbersForeground = Ui.Brush("#858585"),
            BorderThickness = new Thickness(0), Padding = new Thickness(4, 7, 8, 7), IsReadOnly = readOnly,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalScrollBarVisibility = ScrollBarVisibility.Auto
        };
        Editor.Options.IndentationSize = 4;
        Editor.Options.ConvertTabsToSpaces = true;
        Editor.Options.AllowScrollBelowDocument = true;
        Editor.Options.HighlightCurrentLine = true;
        Editor.Options.EnableHyperlinks = false;
        Editor.Options.EnableEmailHyperlinks = false;
        Editor.SetValue(SpellCheck.IsEnabledProperty, false);
        Editor.TextArea.SelectionBrush = Ui.Brush("#344F66");
        Editor.TextArea.TextView.CurrentLineBackground = Ui.Brush("#28282B");
        Editor.TextArea.TextView.CurrentLineBorder = null;
        Editor.TextArea.Caret.CaretBrush = Ui.Brush("#D4D4D4");
        Editor.TextArea.IndentationStrategy = new SmartIndentation(this);
        SetLanguage(path);
        Content = Editor;
        Editor.TextChanged += (_, _) => { if (!changing) { IsDirty = true; Changed?.Invoke(); } };
        Editor.TextArea.TextEntering += (_, args) =>
        {
            if (Editor.IsReadOnly || args.Text.Length != 1) return;
            var ch = args.Text[0]; var at = Editor.CaretOffset;
            if (pairs.TryGetValue(at, out var expected) && expected == ch && at < Editor.Document.TextLength && Editor.Document.GetCharAt(at) == ch)
            { pairs.Remove(at); Editor.CaretOffset++; args.Handled = true; return; }
            if (completion is not null && !char.IsLetterOrDigit(ch) && ch != '_') completion.CompletionList.RequestInsertion(args);
        };
        Editor.Document.Changing += (_, args) =>
        {
            var kept = pairs.Where(p => p.Key < args.Offset || p.Key >= args.Offset + args.RemovalLength)
                .Select(p => new KeyValuePair<int, char>(p.Key >= args.Offset ? p.Key + args.InsertionLength - args.RemovalLength : p.Key, p.Value)).ToArray();
            pairs.Clear(); foreach (var p in kept) pairs[p.Key] = p.Value;
        };
        Editor.TextArea.TextEntered += (_, args) =>
        {
            if (Editor.IsReadOnly || args.Text.Length != 1) return;
            var ch = args.Text[0]; var at = Editor.CaretOffset;
            var close = ch switch { '(' => ')', '[' => ']', '{' => '}', '"' => '"', '\'' => '\'', _ => '\0' };
            if (close != '\0' && (at == Editor.Document.TextLength || char.IsWhiteSpace(Editor.Document.GetCharAt(at)) || ")]};,".Contains(Editor.Document.GetCharAt(at))))
            {
                Editor.Document.Insert(at, close.ToString()); pairs[at] = close; Editor.CaretOffset = at;
            }
            if(completion is null&&LanguageId is "cpp" or "python"&&(char.IsLetterOrDigit(ch)||ch is '.' or '_')){completionTimer.Stop();completionTimer.Start();}
        };
        completionTimer.Tick+=async(_,_)=>{completionTimer.Stop();await Complete(true);};
        Editor.PreviewKeyDown += async (_, args) =>
        {
            if (NativeKeymap.Matches(KeymapSettings?.Invoke(),"complete",args.Key,Keyboard.Modifiers))
            { args.Handled = true; await Complete(); }
            if (NativeKeymap.Matches(KeymapSettings?.Invoke(),"zoomIn",args.Key,Keyboard.Modifiers)) { Editor.FontSize = Math.Min(36, Editor.FontSize + 1); args.Handled = true; }
            if (NativeKeymap.Matches(KeymapSettings?.Invoke(),"zoomOut",args.Key,Keyboard.Modifiers)) { Editor.FontSize = Math.Max(9, Editor.FontSize - 1); args.Handled = true; }
        };
        Editor.PreviewMouseWheel += (_, args) => { if (Keyboard.Modifiers.HasFlag(ModifierKeys.Control)) { Editor.FontSize = Math.Clamp(Editor.FontSize + Math.Sign(args.Delta), 9, 36); args.Handled = true; } };
        Editor.PreviewMouseDown += (_, args) =>
        {
            if (args.ChangedButton != MouseButton.Left || args.GetPosition(Editor).X > Editor.TextArea.TextView.TransformToAncestor(Editor).Transform(new Point()).X) return;
            var at = Editor.GetPositionFromPoint(args.GetPosition(Editor));
            if (at is not { } position) return;
            if (!Breakpoints.Add(position.Line)) Breakpoints.Remove(position.Line);
            Editor.TextArea.TextView.InvalidateLayer(KnownLayer.Background); BreakpointChanged?.Invoke(position.Line); args.Handled = true;
        };
        Editor.TextArea.TextView.BackgroundRenderers.Add(new BreakpointRenderer(this));
        Editor.MouseHoverStopped += (_, _) => HideHover();
        Editor.PreviewMouseDown += (_, _) => HideHover();
        Unloaded += (_, _) => { completionTimer.Stop();HideHover(); completion?.Close(); };
    }

    public void MarkSaved() => IsDirty = false;
    public void HideHover() { if (hover is not null) hover.IsOpen = false; hover = null; }
    public void ShowHover(string text)
    {
        HideHover();
        hover = new ToolTip { Content = new TextBlock { Text = text, TextWrapping = TextWrapping.Wrap, MaxWidth = 560 }, PlacementTarget = Editor, IsOpen = true };
    }
    public void SetText(string text, bool clean = true)
    {
        var at = Editor.CaretOffset; var vertical = Editor.VerticalOffset; var horizontal = Editor.HorizontalOffset;
        changing = true;
        try { Editor.Document.Replace(0, Editor.Document.TextLength, text); Editor.CaretOffset = Math.Min(at, text.Length); Editor.ScrollToVerticalOffset(vertical); Editor.ScrollToHorizontalOffset(horizontal); }
        finally { changing = false; }
        IsDirty = !clean; Changed?.Invoke();
    }

    public void SetLanguage(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        LanguageId = ext switch { ".ipynb" or ".json" => "json", ".py" => "python", ".cpp" or ".cxx" or ".hpp" or ".h" or ".c" => "cpp", ".md" => "markdown", ".cmake" => "cmake", _ => Path.GetFileName(path) == "CMakeLists.txt" ? "cmake" : "text" };
        Editor.SyntaxHighlighting = HighlightingManager.Instance.GetDefinition(LanguageId switch { "cpp" => "C++", "python" => "Python", "json" => "Json", "markdown" => "Markdown", _ => "XML" });
        // JSON and CMake have explicit definitions: ipynb source is JSON, never a
        // synthetic language id with no tokenizer. Colors suit the same dark theme.
        if (LanguageId is "json" or "cmake" or "markdown") Editor.SyntaxHighlighting = DarkHighlighting.Create(LanguageId);
        else if (Editor.SyntaxHighlighting is { } definition)
            foreach (var color in definition.NamedHighlightingColors)
            {
                var name = color.Name?.ToLowerInvariant() ?? "";
                var hex = name.Contains("comment") ? "#6A9955" : name.Contains("string") || name.Contains("char") ? "#CE9178" : name.Contains("number") || name.Contains("digit") ? "#B5CEA8" : name.Contains("keyword") ? "#C586C0" : name.Contains("preprocessor") ? "#9CDCFE" : name.Contains("type") ? "#4EC9B0" : "#D4D4D4";
                color.Foreground = new SimpleHighlightingBrush((Color)ColorConverter.ConvertFromString(hex));
            }
    }

    public async Task Complete(bool automatic=false)
    {
        if(completing||Editor.IsReadOnly||(automatic&&!Editor.IsKeyboardFocusWithin))return;
        var original=Editor.Text;var offset=Editor.CaretOffset;completing=true;
        IReadOnlyList<CompletionItem> items;
        try { if (CompletionRequested is { } provider) items = await provider(this);
        else items = Regex.Matches(Editor.Text, @"\b[A-Za-z_]\w{2,}\b").Select(m => m.Value).Distinct().Take(100).Select(s => new CompletionItem(s)).ToArray(); }
        catch(Exception error){if(!automatic)ShowHover(error.Message);return;}
        finally{completing=false;}
        if(Editor.Text!=original||Editor.CaretOffset!=offset){if(automatic&&Editor.IsKeyboardFocusWithin){completionTimer.Stop();completionTimer.Start();}return;}
        if(automatic&&!Editor.IsKeyboardFocusWithin)return;
        if (items.Count == 0) return;
        completion?.Close(); completion = new CompletionWindow(Editor.TextArea) { Background = Ui.Brush("#29292C"), Foreground = Ui.Brush("#D4D4D4"), MinWidth = 260, MaxHeight = 300 };
        foreach (var item in items) completion.CompletionList.CompletionData.Add(item);
        var at = Editor.CaretOffset; while (at > 0 && (char.IsLetterOrDigit(Editor.Document.GetCharAt(at - 1)) || Editor.Document.GetCharAt(at - 1) == '_')) at--;
        completion.StartOffset = at; completion.Closed += (_, _) => completion = null; completion.Show();
    }

    sealed class SmartIndentation(NativeEditor owner) : IIndentationStrategy
    {
        public void IndentLine(TextDocument document, DocumentLine line)
        {
            if (line.PreviousLine is not { } previous) return;
            var before = document.GetText(previous); var indent = Regex.Match(before, @"^\s*").Value;
            var trimmed = before.TrimEnd(); var current = document.GetText(line);
            if ((owner.LanguageId == "python" && trimmed.EndsWith(':')) || (owner.LanguageId != "python" && (trimmed.EndsWith('{') || trimmed.EndsWith('[')))) indent += new string(' ', owner.Editor.Options.IndentationSize);
            var existing = Regex.Match(current, @"^\s*").Length;
            if (owner.LanguageId != "python" && current.TrimStart().StartsWith('}') && trimmed.EndsWith('{'))
            {
                var baseIndent = Regex.Match(before, @"^\s*").Value;
                document.Replace(line.Offset, existing, indent + "\n" + baseIndent);
                owner.Editor.CaretOffset = line.Offset + indent.Length; return;
            }
            if (current.TrimStart().StartsWith('}') && indent.Length >= owner.Editor.Options.IndentationSize) indent = indent[..^owner.Editor.Options.IndentationSize];
            document.Replace(line.Offset, existing, indent);
        }
        public void IndentLines(TextDocument document, int beginLine, int endLine) { for (var n = beginLine; n <= endLine; n++) IndentLine(document, document.GetLineByNumber(n)); }
    }
    sealed class BreakpointRenderer(NativeEditor owner) : IBackgroundRenderer
    {
        public KnownLayer Layer => KnownLayer.Background;
        public void Draw(TextView view, DrawingContext drawing)
        {
            if (!view.VisualLinesValid) return;
            foreach (var line in view.VisualLines)
                if (owner.Breakpoints.Contains(line.FirstDocumentLine.LineNumber)||owner.ExecutionLine==line.FirstDocumentLine.LineNumber)
                    drawing.DrawRectangle(Ui.Brush(owner.ExecutionLine==line.FirstDocumentLine.LineNumber?"#3B3627":"#352526"), null, new Rect(0, line.VisualTop - view.VerticalOffset, view.ActualWidth, line.Height));
        }
    }
}

public sealed class CompletionItem(string text, string description = "",string? snippet=null) : ICompletionData
{
    public ImageSource? Image => null;
    public string Text => text;
    public object Content => text;
    public object Description => description;
    public double Priority => 0;
    public void Complete(ICSharpCode.AvalonEdit.Editing.TextArea textArea, ISegment segment, EventArgs args)
    {
        if(snippet is null){textArea.Document.Replace(segment,text);return;}
        var expanded=SnippetExpansion.Expand(snippet);var start=segment.Offset;textArea.Document.Replace(segment,expanded.Text);textArea.Caret.Offset=start+expanded.Start;
        textArea.Selection=ICSharpCode.AvalonEdit.Editing.Selection.Create(textArea,start+expanded.Start,start+expanded.Start+expanded.Length);
    }
}

internal static class SnippetExpansion
{
    internal static (string Text,int Start,int Length) Expand(string source)
    {
        var result=new System.Text.StringBuilder();var stops=new Dictionary<int,(int start,int length)>();var defaults=new Dictionary<int,string>();var previous=0;
        foreach(Match match in Regex.Matches(source,@"(?<!\\)(?:\$\{(?<n>\d+)(?::(?<value>[^}]*))?\}|\$(?<n>\d+))"))
        {
            result.Append(source,previous,match.Index-previous);var number=int.Parse(match.Groups["n"].Value);var value=match.Groups["value"].Success?match.Groups["value"].Value:defaults.GetValueOrDefault(number,"");defaults[number]=value;
            stops.TryAdd(number,(result.Length,value.Length));result.Append(value);previous=match.Index+match.Length;
        }
        result.Append(source,previous,source.Length-previous);var first=stops.Keys.Where(n=>n>0).DefaultIfEmpty(0).Min();var selection=stops.GetValueOrDefault(first,(result.Length,0));return(result.ToString(),selection.Item1,selection.Item2);
    }
}

internal static class DarkHighlighting
{
    public static IHighlightingDefinition Create(string language)
    {
        var rules = language == "json"
            ? "<Span color=\"String\" begin=\"&amp;quot;\" end=\"&amp;quot;\"><RuleSet><Span begin=\"\\\\\" end=\".\"/></RuleSet></Span><Rule color=\"Number\">-?\\b[0-9]+(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\\b</Rule><Keywords color=\"Keyword\"><Word>true</Word><Word>false</Word><Word>null</Word></Keywords>"
            : language == "cmake"
                ? "<Span color=\"Comment\" begin=\"#\"/><Span color=\"String\" begin=\"&amp;quot;\" end=\"&amp;quot;\"/><Rule color=\"Keyword\">\\b[a-zA-Z_]+(?=\\s*\\()</Rule><Rule color=\"Number\">\\$\\{[^}]+\\}</Rule>"
                : "<Rule color=\"Keyword\">^\\s*#{1,6}.*$</Rule><Span color=\"String\" begin=\"`\" end=\"`\"/><Rule color=\"Number\">\\*\\*[^*]+\\*\\*</Rule>";
        rules = rules.Replace("&amp;quot;", "&quot;");
        var xml = "<SyntaxDefinition name=\"Native\" xmlns=\"http://icsharpcode.net/sharpdevelop/syntaxdefinition/2008\"><Color name=\"String\" foreground=\"#CE9178\"/><Color name=\"Keyword\" foreground=\"#C586C0\"/><Color name=\"Number\" foreground=\"#B5CEA8\"/><Color name=\"Comment\" foreground=\"#6A9955\"/><RuleSet>" + rules + "</RuleSet></SyntaxDefinition>";
        using var reader = System.Xml.XmlReader.Create(new StringReader(xml));
        return HighlightingLoader.Load(reader, HighlightingManager.Instance);
    }
}
