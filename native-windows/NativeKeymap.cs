using System.Text.Json.Nodes;
using System.Windows.Input;

namespace DevForge.Native;

internal static class NativeKeymap
{
    public static readonly (string Id, string Label, string Gesture)[] Commands = [
        ("save", "Сохранить всё", "Ctrl+S"), ("open", "Открыть проект", "Ctrl+O"),
        ("files", "Поиск файлов", "Ctrl+P"), ("build", "Собрать", "Ctrl+Shift+B"),
        ("run", "Запустить", "Ctrl+F5"), ("debug", "Отладка", "Ctrl+Alt+D"),
        ("continue", "Продолжить отладку", "Ctrl+Alt+F5"), ("over", "Шаг с обходом", "Ctrl+Alt+Right"),
        ("into", "Шаг внутрь", "Ctrl+Alt+Down"), ("out", "Шаг наружу", "Ctrl+Alt+Up"),
        ("complete", "Дополнить код", "Ctrl+Alt+Space"), ("format", "Форматировать", "Ctrl+Alt+L"),
        ("zoomIn", "Увеличить код", "Ctrl+OemPlus"), ("zoomOut", "Уменьшить код", "Ctrl+OemMinus")
    ];
    public static string Gesture(JsonNode? settings, string id) => settings?["nativeKeybindings"]?.Str(id, Commands.First(c=>c.Id==id).Gesture) ?? Commands.First(c=>c.Id==id).Gesture;
    public static bool Matches(JsonNode? settings, string id, Key key, ModifierKeys modifiers)
    {
        var value=Gesture(settings,id); if(string.IsNullOrWhiteSpace(value))return false;
        try { var gesture=(KeyGesture)new KeyGestureConverter().ConvertFromInvariantString(value)!;return gesture.Key==key&&gesture.Modifiers==modifiers; }
        catch(FormatException){return false;}catch(NotSupportedException){return false;}
    }
    public static JsonObject Validate(JsonObject entries)
    {
        var used=new Dictionary<string,string>();var result=new JsonObject();
        foreach(var command in Commands)
        {
            var value=entries.Str(command.Id,command.Gesture).Trim();
            if(value.Length>0)
            {
                var gesture=(KeyGesture)new KeyGestureConverter().ConvertFromInvariantString(value)!;
                var identity=$"{gesture.Modifiers}:{gesture.Key}";
                if(used.TryGetValue(identity,out var previous))throw new InvalidOperationException($"Конфликт: {previous} и {command.Label} — {value}");
                if(gesture.Key==Key.Space&&gesture.Modifiers is ModifierKeys.Control or (ModifierKeys.Alt|ModifierKeys.Shift))throw new InvalidOperationException("Ctrl+Space и Alt+Shift оставлены системе для смены раскладки.");
                used[identity]=command.Label;
            }
            result[command.Id]=value;
        }
        return result;
    }
    public static JsonObject Preset(string name)
    {
        var result=new JsonObject();foreach(var command in Commands)result[command.Id]=command.Gesture;
        if(name=="CLion") { result["run"]="Shift+F10";result["debug"]="Shift+F9";result["over"]="F8";result["into"]="F7";result["out"]="Shift+F8";result["continue"]="F9"; }
        if(name=="VS Code") { result["debug"]="F5";result["over"]="F10";result["into"]="F11";result["out"]="Shift+F11";result["continue"]="F6";result["format"]="Shift+Alt+F"; }
        return result;
    }
}
