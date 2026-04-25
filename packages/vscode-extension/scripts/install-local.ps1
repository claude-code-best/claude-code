$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $env:USERPROFILE) { Write-Error "USERPROFILE is not set"; exit 1 }

function Remove-DirectoryEntry {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    [System.IO.Directory]::Delete($item.FullName)
    return
  }

  Remove-Item -LiteralPath $item.FullName -Force -Recurse -Confirm:$false
}

$SourceDir = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$manifestPath = Join-Path $SourceDir "package.json"
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Extension manifest not found at $manifestPath"
}

Push-Location $SourceDir
try {
  Write-Host "Building extension..."
  bun run build
} finally {
  Pop-Location
}

$pkg = Get-Content -LiteralPath $manifestPath | ConvertFrom-Json
$ExtensionsRoot = Join-Path $env:USERPROFILE ".vscode\extensions"
$VsixId = "$($pkg.publisher).$($pkg.name)"
$ExtDir = Join-Path $ExtensionsRoot "$VsixId-$($pkg.version)"

New-Item -ItemType Directory -Path $ExtensionsRoot -Force | Out-Null

# Clean up *all* prior versions of this extension. VSCode otherwise loads
# multiple versions side-by-side and can cache stale webview bundles, which
# masks our edits and produces "this fix didn't work" false alarms.
$stale = Get-ChildItem -LiteralPath $ExtensionsRoot -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "$VsixId-*" -and $_.FullName -ne $ExtDir }
foreach ($entry in $stale) {
  Write-Host "Removing stale version: $($entry.Name)"
  Remove-DirectoryEntry -Path $entry.FullName
}

Remove-DirectoryEntry -Path $ExtDir
New-Item -ItemType Junction -Path $ExtDir -Target $SourceDir | Out-Null

$installedManifest = Join-Path $ExtDir "package.json"
$installedMain = Join-Path $ExtDir "dist\extension.js"
if (-not (Test-Path -LiteralPath $installedManifest)) {
  throw "Install verification failed: missing $installedManifest"
}
if (-not (Test-Path -LiteralPath $installedMain)) {
  throw "Install verification failed: missing $installedMain"
}

Write-Host "Installed: $ExtDir -> $SourceDir"
Write-Host "Active extension dirs:"
Get-ChildItem -LiteralPath $ExtensionsRoot -Directory |
  Where-Object { $_.Name -like "$VsixId-*" } |
  ForEach-Object { Write-Host "  $($_.Name)" }
Write-Host ""
Write-Host "Fully QUIT VS Code (not just reload window) and reopen to pick up the fresh build."
