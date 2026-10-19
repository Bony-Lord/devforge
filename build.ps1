param([string]$ToolsRoot = "$env:LOCALAPPDATA\SiriusExporter\android-build-tools", [switch]$Install, [switch]$Release, [string]$BuildDir)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskBuild = if ($BuildDir) { [IO.Path]::GetFullPath($BuildDir) } else { Join-Path $taskRoot 'work\build' }
$taskJdk = Join-Path $ToolsRoot 'jdk17\jdk-17.0.20.1+1'
$taskAndroid = Join-Path $ToolsRoot 'android-sdk\build-tools\35.0.0'
$taskJar = Join-Path $ToolsRoot 'android-sdk\platforms\android-35\android.jar'
$env:JAVA_HOME = $taskJdk
New-Item -ItemType Directory -Force "$taskBuild\classes","$taskBuild\dex" | Out-Null
$taskManifest = Join-Path $taskBuild 'AndroidManifest.xml'
$taskManifestText = Get-Content -LiteralPath "$taskRoot\app\src\main\AndroidManifest.xml" -Raw
$taskDebugValue = if ($Release) { 'false' } else { 'true' }
$taskManifestText = $taskManifestText.Replace('<manifest ', '<manifest package="com.forgex" ')
$taskManifestText.Replace('<application ', '<application android:debuggable="' + $taskDebugValue + '" ') | Set-Content -LiteralPath $taskManifest -Encoding utf8
if (!(Test-Path "$taskRoot\app\src\main\assets\ui\licenses\index.json")) { throw 'Run python tools/package_notices.py before building' }
$taskSources = @(Get-ChildItem "$taskRoot\app\src\main\java" -Filter '*.java' -Recurse | ForEach-Object FullName)
& "$taskJdk\bin\javac.exe" -source 8 -target 8 -encoding UTF-8 -classpath $taskJar -d "$taskBuild\classes" @taskSources
if ($LASTEXITCODE -ne 0) { throw 'Java compilation failed' }
$taskClasses = @(Get-ChildItem "$taskBuild\classes" -Filter '*.class' -Recurse | ForEach-Object FullName)
& "$taskAndroid\d8.bat" --lib $taskJar --min-api 28 --output "$taskBuild\dex" @taskClasses
if ($LASTEXITCODE -ne 0) { throw 'DEX generation failed' }
& "$taskAndroid\aapt.exe" package -f -M $taskManifest -I $taskJar -S "$taskRoot\app\src\main\res" -A "$taskRoot\app\src\main\assets" -0 zip -F "$taskBuild\unsigned.apk"
if ($LASTEXITCODE -ne 0) { throw 'APK packaging failed' }
Push-Location "$taskBuild\dex"
try { & "$taskAndroid\aapt.exe" add "$taskBuild\unsigned.apk" 'classes.dex' } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'DEX packaging failed' }
$taskKey = Join-Path $taskBuild 'forge-development.jks'
if (!(Test-Path $taskKey)) {
    & "$taskJdk\bin\keytool.exe" -genkeypair -keystore $taskKey -storepass forge-local-development -keypass forge-local-development -alias forge -dname 'CN=Forge IDE Local Development' -keyalg RSA -validity 3650 -noprompt
}
& "$taskAndroid\zipalign.exe" -f 4 "$taskBuild\unsigned.apk" "$taskBuild\aligned.apk"
& "$taskAndroid\apksigner.bat" sign --ks $taskKey --ks-pass pass:forge-local-development --out "$taskRoot\..\GCC-CPP-Studio-arm64.apk" "$taskBuild\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw 'APK signing failed' }
& "$taskAndroid\apksigner.bat" verify "$taskRoot\..\GCC-CPP-Studio-arm64.apk"
if ($LASTEXITCODE -ne 0) { throw 'APK verification failed' }
Get-Item "$taskRoot\..\GCC-CPP-Studio-arm64.apk" | Select-Object FullName,Length
if ($Install) {
    & 'D:\ADB\adb.exe' install -r "$taskRoot\..\GCC-CPP-Studio-arm64.apk"
    if ($LASTEXITCODE -ne 0) { throw 'Install failed' }
    & 'D:\ADB\adb.exe' shell am start -n com.forgex/dev.forge.ide.MainActivity
}
