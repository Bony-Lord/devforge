using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace DevForge.Native;

internal static class Ui
{
    public static SolidColorBrush Brush(string color) => new((Color)ColorConverter.ConvertFromString(color));
    public static Button Button(string text, Func<Task> action, string? tooltip = null)
    {
        var button = new Button { Content = text, ToolTip = tooltip ?? text };
        var busy=false;button.Click += async (_, _) => { if(busy)return;busy=true;var cursor=button.Cursor;button.Cursor=System.Windows.Input.Cursors.AppStarting;try { await action(); } catch (Exception e) { Error(button, e.Message); } finally{busy=false;button.Cursor=cursor;} };
        return button;
    }
    public static Button Icon(string name, Func<Task> action, string tooltip, string color = "#B9BBC1")
    {
        var geometry = name switch
        {
            "folder" => "M2,5 L8,5 10,7 22,7 22,21 2,21 Z",
            "search" => "M17,17 L23,23 M20,11 A9,9 0 1 1 2,11 A9,9 0 1 1 20,11",
            "extensions" => "M2,2 L10,2 10,10 2,10 Z M14,2 L22,2 22,10 14,10 Z M2,14 L10,14 10,22 2,22 Z M14,14 L22,14 22,22 14,22 Z",
            "console" => "M2,3 L22,3 22,21 2,21 Z M6,8 L10,12 6,16 M13,16 L19,16",
            "git" => "M6,3 L6,20 M6,14 C6,8 18,15 18,5 M3,3 A3,3 0 1 0 9,3 A3,3 0 1 0 3,3 M15,3 A3,3 0 1 0 21,3 A3,3 0 1 0 15,3",
            "play" => "M6,3 L21,12 6,21 Z",
            "stop" => "M5,5 L19,5 19,19 5,19 Z",
            "build" => "M3,20 L15,8 M10,3 L14,1 23,10 19,14 Z M2,19 L5,22",
            "save" => "M3,2 L19,2 22,5 22,22 2,22 2,2 Z M7,2 L7,10 17,10 17,2 M6,22 L6,15 18,15 18,22",
            "settings" => "M3,5 L21,5 M3,12 L21,12 M3,19 L21,19 M8,2 L8,8 M17,9 L17,15 M11,16 L11,22",
            "format" => "M4,4 L20,4 M4,9 L15,9 M4,14 L20,14 M4,19 L15,19",
            "run-config" => "M3,4 L12,10 3,16 Z M14,5 L22,5 M14,12 L22,12 M10,19 L22,19 M18,2 L18,8 M16,9 L16,15 M14,16 L14,22",
            "debug" => "M7,8 L17,8 17,17 C17,24 7,24 7,17 Z M9,8 L9,5 15,5 15,8 M7,11 L2,9 M7,16 L2,16 M7,20 L3,23 M17,11 L22,9 M17,16 L22,16 M17,20 L21,23 M10,5 L7,2 M14,5 L17,2",
            "refresh" => "M20,8 A9,9 0 1 0 21,16 M21,2 L21,9 14,9",
            "plus" => "M12,3 L12,21 M3,12 L21,12",
            "close" => "M5,5 L19,19 M19,5 L5,19",
            "down" => "M12,3 L12,21 M5,14 L12,21 19,14",
            "up" => "M12,21 L12,3 M5,10 L12,3 19,10",
            "json" => "M8,3 C3,3 7,10 2,12 C7,14 3,21 8,21 M16,3 C21,3 17,10 22,12 C17,14 21,21 16,21",
            "notebook" => "M3,3 L21,3 21,21 3,21 Z M7,7 L17,7 M7,12 L17,12 M7,17 L13,17",
            "trash" => "M3,5 L21,5 M8,5 L8,2 16,2 16,5 M6,5 L7,22 17,22 18,5 M10,9 L10,18 M14,9 L14,18",
            _ => "M5,5 L19,5 19,19 5,19 Z"
        };
        var icon = new System.Windows.Shapes.Path { Data = Geometry.Parse(geometry), Stroke = Brush(color), StrokeThickness = 1.6, StrokeLineJoin = PenLineJoin.Round, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round, Width = 19, Height = 19, Stretch = Stretch.Uniform, Margin = new Thickness(1) };
        var button = Button("", action, tooltip);
        button.Content = icon; button.Width = 34; button.Height = 32; button.Padding = new Thickness(6);
        return button;
    }
    public static void Error(FrameworkElement element, string message)
    {
        if(App.IsSelfTest){App.FailTest(new System.IO.IOException(message));return;}
        var popup = new System.Windows.Controls.Primitives.Popup { PlacementTarget = element, Placement = System.Windows.Controls.Primitives.PlacementMode.Bottom, StaysOpen = false, AllowsTransparency = true };
        popup.Child = new Border { Background = Brush("#303033"), BorderBrush = Brush("#A86D64"), BorderThickness = new Thickness(1), Padding = new Thickness(12), CornerRadius = new CornerRadius(5), Child = new TextBlock { Text = message, TextWrapping = TextWrapping.Wrap, MaxWidth = 540, Foreground = Brush("#E4C0BA") } };
        popup.IsOpen = true;
    }
    public static StackPanel Row(params UIElement[] children)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        foreach (var child in children) row.Children.Add(child); return row;
    }
    public static TextBlock Label(string text, string? color = null) => new() { Text = text, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(6, 2, 6, 2), Foreground = Brush(color ?? "#D4D4D4"), TextTrimming = TextTrimming.CharacterEllipsis };
}
