$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DevForgeTestPower {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint SetThreadExecutionState(uint flags);
}
'@
$lease = [DevForgeTestPower]::SetThreadExecutionState([uint32]2147483649)
if ($lease -eq 0) { throw 'Could not prevent automatic system sleep.' }
[Console]::Out.WriteLine('AWAKE')
try {
    # The pipe is owned by the runner. It reaches EOF even if the runner dies.
    while ($null -ne [Console]::In.ReadLine()) {}
}
finally {
    $released = [DevForgeTestPower]::SetThreadExecutionState([uint32]2147483648)
    [Console]::Out.WriteLine('RELEASED')
}
