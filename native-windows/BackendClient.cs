using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json.Nodes;

namespace DevForge.Native;

/// <summary>Browser-free transport. Only the owned child process can read the pipe.</summary>
public sealed class BackendClient : IAsyncDisposable
{
    readonly ConcurrentDictionary<string, TaskCompletionSource<JsonNode?>> pending = new();
    readonly SemaphoreSlim writes = new(1, 1);
    readonly Process process;
    long sequence;
    string lastBackendError="";
    public event Action<string, string, JsonNode?>? Event;
    public string DataDirectory { get; }
    public string SourceRoot { get; }

    public BackendClient(string directory, string sourceRoot)
    {
        DataDirectory = directory;
        SourceRoot = sourceRoot;
        var bundled = Path.Combine(AppContext.BaseDirectory, "runtime", "node.exe");
        var backend = Path.Combine(AppContext.BaseDirectory, "backend", "native-host.cjs");
        if (!File.Exists(backend) || File.Exists(Path.Combine(sourceRoot, "desktop", "host.cjs"))) backend = Path.Combine(sourceRoot, "native-windows", "backend.cjs");
        var start = new ProcessStartInfo(File.Exists(bundled) ? bundled : "node")
        {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8,
            WorkingDirectory = sourceRoot
        };
        start.ArgumentList.Add(backend);
        start.ArgumentList.Add("--data-dir=" + directory);
        if (App.Arguments.Contains("--isolated")) start.ArgumentList.Add("--projects-dir=" + Path.Combine(directory, "projects"));
        else start.ArgumentList.Add("--projects-dir=" + Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "DevForge"));
        start.Environment["DEVFORGE_SOURCE_ROOT"] = sourceRoot;
        process = new Process { StartInfo = start, EnableRaisingEvents = true };
        process.Exited += (_, _) => FailPending(new IOException("Служба DevForge завершилась. " + lastBackendError));
        process.Start();
        _ = ReadAsync();
        _ = DrainErrorsAsync();
    }

    async Task DrainErrorsAsync()
    {
        try { while (await process.StandardError.ReadLineAsync() is { } line) { lastBackendError=(lastBackendError+line+"\n");if(lastBackendError.Length>8192)lastBackendError=lastBackendError[^8192..];Event?.Invoke("", "backendError", JsonValue.Create(line)); } }
        catch(Exception error) when(error is IOException or ObjectDisposedException) { }
    }

    async Task ReadAsync()
    {
        try
        {
            while (await process.StandardOutput.ReadLineAsync() is { } line)
            {
                var value = JsonNode.Parse(line)?.AsObject();
                if (value is null) continue;
                if (value["id"]?.GetValue<string>() is { } id && pending.TryRemove(id, out var completion))
                {
                    if (value["error"] is { } error) completion.TrySetException(new IOException(error.ToString()));
                    else completion.TrySetResult(value["value"]?.DeepClone());
                }
                else if (value["event"]?.GetValue<string>() is { } type)
                    Event?.Invoke(value["window"]?.ToString() ?? "", type, value["data"]?.DeepClone());
            }
        }
        catch (Exception error) { FailPending(error); }
    }

    public async Task<JsonNode?> Call(string op, JsonNode? data = null, string window = "main", CancellationToken cancellation = default)
    {
        var id = Interlocked.Increment(ref sequence).ToString();
        var completion = new TaskCompletionSource<JsonNode?>(TaskCreationOptions.RunContinuationsAsynchronously);
        pending[id] = completion;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromMinutes(op.Contains("Install") || op == "build" ? 10 : 2));
        using var registration = timeout.Token.Register(() => { if (pending.TryRemove(id, out var item)) item.TrySetCanceled(timeout.Token); });
        var message = new JsonObject { ["id"] = id, ["window"] = window, ["op"] = op, ["data"] = data?.DeepClone() ?? new JsonObject() };
        await writes.WaitAsync(cancellation);
        try { await process.StandardInput.WriteLineAsync(message.ToJsonString()); await process.StandardInput.FlushAsync(cancellation); }
        catch { pending.TryRemove(id, out _); throw; }
        finally { writes.Release(); }
        return await completion.Task;
    }

    void FailPending(Exception error) { foreach (var key in pending.Keys) if (pending.TryRemove(key, out var item)) item.TrySetException(error); }
    public async ValueTask DisposeAsync()
    {
        using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(8));
        try { await Call("shutdown",cancellation:timeout.Token); } catch { }
        if (!process.HasExited) { process.StandardInput.Close();try{await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));}catch(TimeoutException){process.Kill(true);} }
        process.Dispose(); writes.Dispose();
    }
}

public static class Json
{
    public static JsonObject Obj(params (string key, object? value)[] fields)
    {
        var result = new JsonObject();
        foreach (var (key, value) in fields) result[key] = value is JsonNode node ? node.DeepClone() : System.Text.Json.JsonSerializer.SerializeToNode(value);
        return result;
    }
    public static string Str(this JsonNode? node, string name, string fallback = "") => node?[name]?.ToString() ?? fallback;
    public static bool Flag(this JsonNode? node, string name) => node?[name]?.GetValue<bool>() == true;
}
