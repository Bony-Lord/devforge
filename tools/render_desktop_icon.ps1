# Original C++ Studio mark, matching app/src/main/res/drawable/icon.xml.
# Regenerates the checked-in desktop PNG without external image dependencies.
Add-Type -AssemblyName System.Drawing
$taskIconRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../desktop'))
$taskBitmap = New-Object Drawing.Bitmap 256,256
$taskGraphics = [Drawing.Graphics]::FromImage($taskBitmap)
try {
    $taskGraphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $taskGraphics.ScaleTransform((256.0/108),(256.0/108))
    $taskGraphics.Clear([Drawing.ColorTranslator]::FromHtml('#1E1F22'))
    $taskGrey = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#BCBEC4'))
    $taskBlue = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#548AF7'))
    try {
        [Drawing.PointF[]]$taskC = @('65,26','36,26','19,43','19,67','36,84','65,84','65,70','42,70','33,61','33,49','42,40','65,40') | ForEach-Object { $taskXY=$_.Split(','); [Drawing.PointF]::new([single]$taskXY[0],[single]$taskXY[1]) }
        $taskGraphics.FillPolygon($taskGrey,$taskC)
        foreach($taskY in @(43,71)) {
            $taskGraphics.FillRectangle($taskBlue,70,$taskY,21,7)
            $taskGraphics.FillRectangle($taskBlue,77,($taskY-7),7,21)
        }
    } finally { $taskGrey.Dispose(); $taskBlue.Dispose() }
    $taskBitmap.Save((Join-Path $taskIconRoot 'icon.png'),[Drawing.Imaging.ImageFormat]::Png)
} finally { $taskGraphics.Dispose(); $taskBitmap.Dispose() }
