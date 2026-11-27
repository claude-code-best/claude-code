param([string]$SdkDirectory = (Join-Path $PSScriptRoot 'sdk'))
$ErrorActionPreference = 'Stop'
$sdkVersion = '1.0.4314.35'
$sdk = Join-Path $SdkDirectory $sdkVersion
if (-not (Test-Path -LiteralPath (Join-Path $sdk 'lib/net462/Microsoft.Web.WebView2.Core.dll'))) {
    New-Item -ItemType Directory -Path $sdk -Force | Out-Null
    $archive = Join-Path $SdkDirectory 'webview2.zip'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$sdkVersion/microsoft.web.webview2.$sdkVersion.nupkg" -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath $sdk -Force
    Remove-Item -LiteralPath $archive
}
Add-Type -AssemblyName System.Drawing
$app = Join-Path $PSScriptRoot 'build'
New-Item -ItemType Directory -Path $app -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'RealAgentic.png'), (Join-Path $PSScriptRoot 'RealAgenticDesktop.cs') -Destination $app
Copy-Item -LiteralPath (Join-Path $sdk 'lib/net462/Microsoft.Web.WebView2.Core.dll'), (Join-Path $sdk 'lib/net462/Microsoft.Web.WebView2.WinForms.dll'), (Join-Path $sdk 'runtimes/win-x64/native/WebView2Loader.dll') -Destination $app
Copy-Item -LiteralPath (Join-Path $sdk 'LICENSE.txt') -Destination (Join-Path $app 'WebView2-LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $sdk 'NOTICE.txt') -Destination (Join-Path $app 'WebView2-NOTICE.txt')
$source = [Drawing.Image]::FromFile((Join-Path $app 'RealAgentic.png'))
$frames = [Collections.Generic.List[byte[]]]::new()
$sizes = @(16, 24, 32, 48, 64, 128, 256)
foreach ($size in $sizes) {
    $bitmap = [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $scale = [Math]::Min($size / $source.Width, $size / $source.Height)
    $width = [single]($source.Width * $scale)
    $height = [single]($source.Height * $scale)
    $rectangle = [Drawing.RectangleF]::new([single](($size-$width)/2), [single](($size-$height)/2), $width, $height)
    $graphics.DrawImage($source, $rectangle)
    $stream = [IO.MemoryStream]::new()
    $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
    $frames.Add($stream.ToArray())
    $stream.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
$source.Dispose()
$file = [IO.File]::Create((Join-Path $app 'RealAgentic.ico'))
$writer = [IO.BinaryWriter]::new($file)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($index=0; $index -lt $sizes.Count; $index++) {
    $dimension = if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] }
    $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
    $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32)
    $writer.Write([uint32]$frames[$index].Length); $writer.Write([uint32]$offset)
    $offset += $frames[$index].Length
}
foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
$writer.Dispose(); $file.Dispose()
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw '.NET Framework 4.6.2 or later (x64) is required.' }
& $compiler /nologo /target:winexe /platform:x64 /optimize+ `
    ('/out:' + (Join-Path $app 'RealAgentic.exe')) `
    ('/win32icon:' + (Join-Path $app 'RealAgentic.ico')) `
    /reference:System.Windows.Forms.dll /reference:System.Drawing.dll `
    /reference:System.Web.Extensions.dll `
    ('/reference:' + (Join-Path $app 'Microsoft.Web.WebView2.Core.dll')) `
    ('/reference:' + (Join-Path $app 'Microsoft.Web.WebView2.WinForms.dll')) `
    (Join-Path $app 'RealAgenticDesktop.cs')
if ($LASTEXITCODE -ne 0) { throw 'RealAgentic desktop compilation failed.' }
Write-Output 'Built RealAgentic.exe with embedded transparent icon.'
