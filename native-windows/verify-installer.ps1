param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$Results,[switch]$WithToolchain)
$ErrorActionPreference='Stop'
$installerPath=(Resolve-Path -LiteralPath $Installer).Path
$resultRoot=[IO.Path]::GetFullPath($Results)
[IO.Directory]::CreateDirectory($resultRoot) | Out-Null
$fixture=Join-Path $resultRoot ('clean install '+[Guid]::NewGuid().ToString('N'))
$profile=Join-Path $resultRoot ('profile-'+[Guid]::NewGuid().ToString('N'))
if(Test-Path -LiteralPath $fixture){throw 'Fresh installation directory is already occupied'}
$installed=Start-Process -FilePath $installerPath -ArgumentList '/S',"/D=$fixture" -WindowStyle Hidden -PassThru -Wait
if($installed.ExitCode -ne 0){throw "Installer failed: $($installed.ExitCode)"}
$manifest=Get-Content -LiteralPath "$fixture/payload-manifest.json" -Raw | ConvertFrom-Json
foreach($entry in $manifest.files){
 $target=[IO.Path]::GetFullPath((Join-Path $fixture $entry.path))
 if(-not $target.StartsWith($fixture+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Manifest path escaped the installation'}
 if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $entry.sha256){throw "Installed payload changed: $($entry.path)"}
}
$oldBackend=$env:DEVFORGE_NATIVE_BACKEND;$oldRoot=$env:DEVFORGE_SOURCE_ROOT;$oldRuntime=$env:DEVFORGE_NATIVE_RUNTIME
try{
 $env:DEVFORGE_NATIVE_BACKEND="$fixture/backend/native-host.cjs";$env:DEVFORGE_SOURCE_ROOT=$fixture;$env:DEVFORGE_NATIVE_RUNTIME=if($WithToolchain){'1'}else{'0'}
 & "$fixture/runtime/node.exe" --test "$PSScriptRoot/backend.test.cjs" *> "$resultRoot/installed-runtime.log"
 if($LASTEXITCODE -ne 0){throw ((Get-Content "$resultRoot/installed-runtime.log" -Tail 25)-join "`n")}
}finally{$env:DEVFORGE_NATIVE_BACKEND=$oldBackend;$env:DEVFORGE_SOURCE_ROOT=$oldRoot;$env:DEVFORGE_NATIVE_RUNTIME=$oldRuntime}
$arguments=@('--self-test','--isolated',"--source-root=$fixture","--data-dir=$profile","--test-results=$resultRoot")
if($WithToolchain){$arguments+='--with-toolchain'}
$arguments=$arguments|ForEach-Object{'"'+$_+'"'}
$app=Start-Process -FilePath "$fixture/DevForge.Native.exe" -WorkingDirectory $fixture -ArgumentList $arguments -WindowStyle Hidden -PassThru
if(-not $app.WaitForExit(90000)){$app.Kill($true);throw 'Installed native UI timed out'}
$ui=Get-Content -LiteralPath "$resultRoot/native-ui.json" -Raw | ConvertFrom-Json
if(-not $ui.passed){throw ($ui|ConvertTo-Json -Depth 8)}
$failureRoot=Join-Path $resultRoot 'failure-exit'
$failureArguments=@('--self-test','--self-test-failure-probe','--isolated',"--source-root=$fixture","--data-dir=$profile-failure","--test-results=$failureRoot")|ForEach-Object{'"'+$_+'"'}
$failure=Start-Process -FilePath "$fixture/DevForge.Native.exe" -WorkingDirectory $fixture -ArgumentList $failureArguments -WindowStyle Hidden -PassThru
if(-not $failure.WaitForExit(15000)){$failure.Kill($true);throw 'Test failure left a blocking window'}
$failureReport=Get-Content -LiteralPath "$failureRoot/native-ui.json" -Raw|ConvertFrom-Json
if($failure.ExitCode -ne 1 -or $failureReport.passed -or $failureReport.error -notlike '*Intentional isolated failure*'){throw 'Failure exit did not produce the expected noninteractive report'}
# The uninstaller must remove only its own files; unknown user files stay put.
$retained=Join-Path $fixture 'retain-user-file.txt';[IO.File]::WriteAllText($retained,'must survive uninstall')
Start-Process -FilePath "$fixture/Uninstall.exe" -ArgumentList '/S' -WindowStyle Hidden -Wait
$deadline=[DateTime]::UtcNow.AddSeconds(15)
while(@($manifest.files|Where-Object {Test-Path -LiteralPath (Join-Path $fixture $_.path)}).Count -gt 0 -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 150}
if(Test-Path -LiteralPath "$fixture/DevForge.Native.exe"){throw 'Uninstall left the application executable'}
foreach($entry in $manifest.files){if(Test-Path -LiteralPath (Join-Path $fixture $entry.path)){throw "Uninstall left a managed file: $($entry.path)"}}
if(-not (Test-Path -LiteralPath $retained)){throw 'Uninstaller removed an unowned user file'}
$report=@{passed=$true;version=$manifest.version;browser=$false;verifiedFiles=$manifest.files.Count;nativeUiChecks=$ui.checks.Count;cleanInstall=$true;uninstall=$true;retainsUnknownFiles=$true;failureExitsWithoutDialog=$true;fixture=$fixture;installerBytes=(Get-Item -LiteralPath $installerPath).Length}
$report|ConvertTo-Json|Set-Content -LiteralPath "$resultRoot/installer-verification.json"
$report|ConvertTo-Json
