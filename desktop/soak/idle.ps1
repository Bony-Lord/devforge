$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DevForgeTestIdle {
    public static readonly System.Threading.Tasks.Task<string> Lease = System.Threading.Tasks.Task.Factory.StartNew(() => Console.In.ReadLine(), System.Threading.Tasks.TaskCreationOptions.LongRunning);
    [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint size; public uint time; }
    [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO value);
    public static uint Milliseconds() {
        LASTINPUTINFO value = new LASTINPUTINFO(); value.size = (uint)Marshal.SizeOf(value);
        if (!GetLastInputInfo(ref value)) throw new InvalidOperationException("GetLastInputInfo failed");
        return unchecked((uint)Environment.TickCount - value.time);
    }
}
'@
$lease = [DevForgeTestIdle]::Lease
while (-not $lease.IsCompleted) {
    [Console]::Out.WriteLine('{"idleMs":' + [DevForgeTestIdle]::Milliseconds() + '}')
    Start-Sleep -Milliseconds 1000
}
