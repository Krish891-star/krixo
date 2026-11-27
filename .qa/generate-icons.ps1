Add-Type -AssemblyName System.Drawing

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$publicDir = Join-Path $root 'public'
$source = Join-Path $publicDir 'assets/krixo-logo.png'
if (-not (Test-Path $source)) { throw "Missing source logo: $source" }

$image = [System.Drawing.Image]::FromFile($source)
$sizes = @(16, 32, 48, 180, 192, 512)
$pngBytes = @{}

foreach ($size in $sizes) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.DrawImage($image, (New-Object System.Drawing.Rectangle(0, 0, $size, $size)))
  $graphics.Dispose()

  $target = Join-Path $publicDir "favicon-$($size)x$($size).png"
  $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  $pngBytes[$size] = [System.IO.File]::ReadAllBytes($target)
}
$image.Dispose()

# Multi-resolution ICO: PNG-compressed entries are supported by modern browsers.
$icoSizes = @(16, 32, 48)
$stream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($stream)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$icoSizes.Count)
$offset = 6 + (16 * $icoSizes.Count)
foreach ($size in $icoSizes) {
  $bytes = $pngBytes[$size]
  $dimension = [byte]$(if ($size -ge 256) { 0 } else { $size })
  $writer.Write($dimension)
  $writer.Write($dimension)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$bytes.Length)
  $writer.Write([UInt32]$offset)
  $offset += $bytes.Length
}
foreach ($size in $icoSizes) { $writer.Write($pngBytes[$size]) }
$writer.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $publicDir 'favicon.ico'), $stream.ToArray())
$writer.Dispose()
$stream.Dispose()

# Keep the SVG fallback visually identical by embedding the same logo.
$base64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($source))
$svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><image href="data:image/png;base64,' + $base64 + '" width="256" height="256"/></svg>'
[System.IO.File]::WriteAllText((Join-Path $publicDir 'favicon.svg'), $svg, (New-Object System.Text.UTF8Encoding($false)))

Get-ChildItem $publicDir -File | Where-Object { $_.Name -match '^favicon|site.webmanifest' } | Select-Object Name, Length
