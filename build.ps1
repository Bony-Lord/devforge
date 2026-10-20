param([string]$ToolsRoot = "$env:LOCALAPPDATA\SiriusExporter\android-build-tools", [switch]$Install, [switch]$Release, [string]$BuildDir)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskBuild = if ($BuildDir) { [IO.Path]::GetFullPath($BuildDir) } else { Join-Path $taskRoot 'work\build' }
$taskJdk = Join-Path $ToolsRoot 'jdk17\jdk-17.0.20.1+1'
$taskAndroid = Join-Path $ToolsRoot 'android-sdk\build-tools\35.0.0'
$env:JAVA_HOME = $taskJdk
$env:ANDROID_HOME = Join-Path $ToolsRoot 'android-sdk'
New-Item -ItemType Directory -Force $taskBuild | Out-Null
$taskKey = Join-Path $taskBuild 'forge-development.jks'
if (!(Test-Path -LiteralPath $taskKey)) {
    & "$taskJdk\bin\keytool.exe" -genkeypair -keystore $taskKey -storepass forge-local-development -keypass forge-local-development -alias forge -dname 'CN=Forge IDE Local Development' -keyalg RSA -validity 3650 -noprompt
    if ($LASTEXITCODE -ne 0) { throw 'Key generation failed' }
}
$env:GCC_STUDIO_KEYSTORE = $taskKey
$env:GCC_STUDIO_KEY_PASSWORD = 'forge-local-development'
$taskVariant = if ($Release) { 'release' } else { 'debug' }
$taskGradleTask = if ($Release) { ':app:assembleRelease' } else { ':app:assembleDebug' }
Push-Location $taskRoot
try { & .\gradlew.bat $taskGradleTask --console=plain } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Gradle build failed' }
$taskApk = Join-Path $taskRoot '..\Cpp-Studio-arm64.apk'
Copy-Item -LiteralPath "$taskRoot\app\build\outputs\apk\$taskVariant\app-$taskVariant.apk" -Destination $taskApk -Force
& "$taskAndroid\apksigner.bat" verify $taskApk
if ($LASTEXITCODE -ne 0) { throw 'APK verification failed' }
Get-Item -LiteralPath $taskApk | Select-Object FullName,Length
if ($Install) {
    & 'D:\ADB\adb.exe' install -r $taskApk
    if ($LASTEXITCODE -ne 0) { throw 'Install failed' }
    & 'D:\ADB\adb.exe' shell am start -n com.forgex/dev.forge.ide.MainActivity
}