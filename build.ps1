param(
    [string]$ToolsRoot = "$env:LOCALAPPDATA\SiriusExporter\android-build-tools",
    [ValidateSet('modern','compat')][string]$Runtime = 'modern',
    [switch]$Install, [switch]$Release, [switch]$Bundle, [string]$BuildDir,
    [string]$OutputDir
)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskPriorBuild = [IO.Path]::GetFullPath((Join-Path $taskRoot '..\..\work\build'))
$taskBuild = if ($BuildDir) { [IO.Path]::GetFullPath($BuildDir) } elseif (Test-Path -LiteralPath (Join-Path $taskPriorBuild 'forge-development.jks')) { $taskPriorBuild } else { Join-Path $taskRoot 'work\build' }
$taskJdk = Join-Path $ToolsRoot 'jdk17\jdk-17.0.20.1+1'
$taskAndroid = Join-Path $ToolsRoot 'android-sdk\build-tools\35.0.0'
$env:JAVA_HOME = $taskJdk
$env:ANDROID_HOME = Join-Path $ToolsRoot 'android-sdk'
if ($Bundle -and ($Runtime -ne 'modern' -or $Install)) { throw 'Bundle is for the modern store build; use APK for direct installation.' }
New-Item -ItemType Directory -Force $taskBuild | Out-Null
$taskKey = Join-Path $taskBuild 'forge-development.jks'
if (!(Test-Path -LiteralPath $taskKey)) {
    & "$taskJdk\bin\keytool.exe" -genkeypair -keystore $taskKey -storepass forge-local-development -keypass forge-local-development -alias forge -dname 'CN=Forge IDE Local Development' -keyalg RSA -validity 3650 -noprompt
    if ($LASTEXITCODE -ne 0) { throw 'Key generation failed' }
}
$env:GCC_STUDIO_KEYSTORE = $taskKey
if (!$env:GCC_STUDIO_KEY_PASSWORD) { $env:GCC_STUDIO_KEY_PASSWORD = 'forge-local-development' }
$taskVariant = if ($Release -or $Bundle) { 'release' } else { 'debug' }
$taskFlavor = (Get-Culture).TextInfo.ToTitleCase($Runtime)
$taskBuildType = (Get-Culture).TextInfo.ToTitleCase($taskVariant)
$taskGradleTask = ':app:' + $(if ($Bundle) { 'bundle' } else { 'assemble' }) + $taskFlavor + $taskBuildType
$taskArguments = @($taskGradleTask, '--console=plain')
if ($Bundle) { $taskArguments += '-PstudioBundle=true' }
Push-Location $taskRoot
try { & .\gradlew.bat @taskArguments } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Gradle build failed' }
$taskOutput = if ($OutputDir) { [IO.Path]::GetFullPath($OutputDir) } else { [IO.Path]::GetFullPath((Join-Path $taskRoot '..\Cpp-Studio-1.0.0-rc.1')) }
New-Item -ItemType Directory -Force $taskOutput | Out-Null
$taskSuffix = if ($Runtime -eq 'compat') { '-compat' } else { '' }
$taskExtension = if ($Bundle) { 'aab' } else { 'apk' }
$taskArtifact = Join-Path $taskOutput "Cpp-Studio-1.0.0-rc.1-android-arm64$taskSuffix.$taskExtension"
$taskSource = if ($Bundle) { "$taskRoot\app\build\outputs\bundle\modernRelease\app-modern-release.aab" } else { "$taskRoot\app\build\outputs\apk\$Runtime\$taskVariant\app-$Runtime-$taskVariant.apk" }
Copy-Item -LiteralPath $taskSource -Destination $taskArtifact -Force
if (!$Bundle) {
    & "$taskAndroid\apksigner.bat" verify $taskArtifact
    if ($LASTEXITCODE -ne 0) { throw 'APK verification failed' }
}
$taskHash = (Get-FileHash -LiteralPath $taskArtifact -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($taskArtifact + '.sha256', $taskHash + '  ' + [IO.Path]::GetFileName($taskArtifact) + "`n")
Get-Item -LiteralPath $taskArtifact | Select-Object FullName,Length
if ($Install) {
    & 'D:\ADB\adb.exe' install -r $taskArtifact
    if ($LASTEXITCODE -ne 0) { throw 'Install failed' }
    & 'D:\ADB\adb.exe' shell am start -n com.forgex/dev.forge.ide.MainActivity
}
