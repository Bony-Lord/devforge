param([switch]$Apply,[switch]$IncludeAndroidIntermediates)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$version=(Get-Content -LiteralPath (Join-Path $repo 'desktop\package.json') -Raw|ConvertFrom-Json).version
$candidates=@()
$dist=Join-Path $repo 'desktop\dist'
if(Test-Path -LiteralPath $dist){
 foreach($item in Get-ChildItem -LiteralPath $dist -Directory){
  if($item.Name -match '^(?:DevForge|Cpp-Studio)-win32-x64-' -and $item.Name -ne "DevForge-win32-x64-$version" -and (Test-Path -LiteralPath (Join-Path $item.FullName 'resources\app\package.json'))){$candidates+=$item.FullName}
 }
}
$work=Join-Path $repo 'work'
if(Test-Path -LiteralPath $work){
 foreach($run in Get-ChildItem -LiteralPath $work -Directory){
  if($run.Attributes -band [IO.FileAttributes]::ReparsePoint){continue}
  foreach($item in Get-ChildItem -LiteralPath $run.FullName -Directory){
   if($item.Name -match '^installer.*inspection(?:-[a-f0-9]+)?$'){$candidates+=$item.FullName}
  }
 }
}
if($IncludeAndroidIntermediates){foreach($name in @('intermediates','generated','tmp','studio-assets')){$p=Join-Path $repo "app\build\$name";if(Test-Path -LiteralPath $p){$candidates+=$p}}}
$tracked=@(git -C $repo ls-files|ForEach-Object{[IO.Path]::GetFullPath((Join-Path $repo $_))})
$running=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue|Where-Object ExecutablePath|ForEach-Object{$_.ExecutablePath})
foreach($candidate in $candidates){
 $target=[IO.Path]::GetFullPath($candidate).TrimEnd('\')
 if(-not $target.StartsWith($repo+'\',[StringComparison]::OrdinalIgnoreCase)){throw "Path outside checkout: $target"}
 if(@($tracked|Where-Object{$_ -eq $target -or $_.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)}).Count){throw "Tracked files in target: $target"}
 for($p=Get-Item -LiteralPath $target -Force;$null -ne $p;$p=$p.Parent){if($p.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Junction in target path: $target"}}
 if(@($running|Where-Object{$_.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)}).Count){Write-Warning "In use, retained: $target";continue}
 $children=@(Get-ChildItem -LiteralPath $target -Recurse -Force)
 if(@($children|Where-Object{($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $_.Extension -in @('.jks','.keystore','.p12','.pem') -or $_.Name -match '(?i)(private.*backup|app-data-before|restored-durable-data)'}).Count){throw "Protected data or link in target: $target"}
 if($Apply){Remove-Item -LiteralPath $target -Recurse -Force;[pscustomobject]@{Action='Removed';Path=$target}}
 else{[pscustomobject]@{Action='Preview';Path=$target}}
}
