using System.IO;
using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;
using System.Windows;
using System.Runtime.InteropServices;
using System.Windows.Interop;

namespace DevForge.Native;

public partial class App : Application
{
    internal static string[] Arguments = [];
    internal static bool IsSelfTest=>Arguments.Contains("--self-test");
    static bool failingTest;
    internal static void FailTest(Exception error) { if(failingTest)return;failingTest=true;NativeChecks.Failed(error).GetAwaiter().GetResult();foreach(var window in Current.Windows.OfType<MainWindow>().ToArray())window.AllowTestExit();Current.Shutdown(1); }
    Mutex? instance;
    CancellationTokenSource focusCancellation = new();
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        Arguments = e.Args;
        var profile = Arguments.FirstOrDefault(a => a.StartsWith("--data-dir="))?[11..] ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DevForge.Native");
        var identity = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Path.GetFullPath(profile).ToUpperInvariant())))[..24];
        instance = new Mutex(true, "Local\\DevForge.Native." + identity, out var created);
        if (!created)
        {
            try { using var pipe = new NamedPipeClientStream(".", "DevForge.Native." + identity, PipeDirection.Out); pipe.Connect(1500); using var writer = new StreamWriter(pipe) { AutoFlush = true }; writer.WriteLine("activate"); } catch (Exception error) when(error is IOException or TimeoutException) { }
            instance.Dispose(); instance = null; Shutdown(0); return;
        }
        _ = ListenForActivation(identity);
        DispatcherUnhandledException += (_, args) =>
        {
            Directory.CreateDirectory(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DevForge.Native"));
            File.AppendAllText(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DevForge.Native", "errors.log"), DateTime.UtcNow + " " + args.Exception + Environment.NewLine);
            if (IsSelfTest) FailTest(args.Exception);
            else MessageBox.Show(args.Exception.Message, "DevForge", MessageBoxButton.OK, MessageBoxImage.Error);
            args.Handled = true;
        };
        var window = new MainWindow();
        if(IsSelfTest)window.ShowInTaskbar=false;
        MainWindow = window;
        window.Show();
    }
    async Task ListenForActivation(string identity)
    {
        while (!focusCancellation.IsCancellationRequested)
        {
            try
            {
                await using var pipe = new NamedPipeServerStream("DevForge.Native." + identity, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                await pipe.WaitForConnectionAsync(focusCancellation.Token); using var reader = new StreamReader(pipe);
                if (await reader.ReadLineAsync(focusCancellation.Token).AsTask().WaitAsync(TimeSpan.FromSeconds(2)) == "activate") _ = Dispatcher.BeginInvoke(() => { var window = Windows.OfType<MainWindow>().FirstOrDefault(); if (window is null) return; if (window.WindowState == WindowState.Minimized) window.WindowState = WindowState.Normal; window.Show(); window.Activate(); });
            }
            catch (Exception error) when (error is IOException or OperationCanceledException or TimeoutException) { }
        }
    }
    protected override void OnExit(ExitEventArgs e) { focusCancellation.Cancel(); focusCancellation.Dispose(); if (instance is not null) { instance.ReleaseMutex(); instance.Dispose(); } base.OnExit(e); }
}
