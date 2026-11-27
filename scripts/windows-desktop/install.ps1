param(
    [string]$RepositoryPath = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
    [string]$BunPath,
    [string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'RealAgenticDesktop'),
    [string]$ShortcutDirectory = [Environment]::GetFolderPath('Desktop'),
    [string]$Url = 'http://127.0.0.1:3000/code/',
    [switch]$ConnectOnly,
    [switch]$SkipBuild,
    [switch]$NoShortcut
)
$ErrorActionPreference = 'Stop'
if (-not [Environment]::Is64BitOperatingSystem) { throw 'Windows x64 is required.' }
$uri = [Uri]$Url
if (-not $uri.IsAbsoluteUri -or ($uri.Scheme -ne 'https' -and -not ($uri.Scheme -eq 'http' -and $uri.IsLoopback))) {
    throw 'Use HTTPS or a local loopback URL.'
}
if (-not $ConnectOnly -and $Url -ne 'http://127.0.0.1:3000/code/') {
    throw 'Use -ConnectOnly with custom service URLs.'
}
$RepositoryPath = (Resolve-Path -LiteralPath $RepositoryPath).Path
if (-not $ConnectOnly) {
    if (-not $BunPath) {
        $candidate = Join-Path $env:USERPROFILE '.bun/bin/bun.exe'
        if (Test-Path -LiteralPath $candidate) { $BunPath = $candidate }
        else { $BunPath = (Get-Command bun.exe -ErrorAction Stop).Source }
    }
    $BunPath = (Resolve-Path -LiteralPath $BunPath).Path
    & $BunPath --version
    if ($LASTEXITCODE -ne 0) { throw 'Bun is unavailable. Provide -BunPath with the path to bun.exe.' }
    if (-not (Test-Path -LiteralPath (Join-Path $RepositoryPath 'packages/remote-control-server/web/dist/index.html'))) {
        throw 'Build the web UI first: bun run --cwd packages/remote-control-server build:web'
    }
}
if (-not $SkipBuild) { & (Join-Path $PSScriptRoot 'build.ps1') }
$build = Join-Path $PSScriptRoot 'build'
New-Item -ItemType Directory -Path $InstallDirectory -Force | Out-Null
$InstallDirectory = (Resolve-Path -LiteralPath $InstallDirectory).Path
foreach ($name in @('RealAgentic.exe', 'RealAgentic.ico', 'RealAgentic.png', 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll', 'WebView2-LICENSE.txt', 'WebView2-NOTICE.txt')) {
    Copy-Item -LiteralPath (Join-Path $build $name) -Destination $InstallDirectory -Force
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'start.ps1') -Destination $InstallDirectory -Force
@{ RepositoryPath = $RepositoryPath; BunPath = $BunPath; Url = $Url; ConnectOnly = [bool]$ConnectOnly } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallDirectory 'desktop-config.json') -Encoding UTF8
if (-not $NoShortcut) {
    New-Item -ItemType Directory -Path $ShortcutDirectory -Force | Out-Null
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path $ShortcutDirectory 'RealAgentic.lnk'))
    $shortcut.TargetPath = Join-Path $InstallDirectory 'RealAgentic.exe'
    $shortcut.WorkingDirectory = $InstallDirectory
    $shortcut.IconLocation = (Join-Path $InstallDirectory 'RealAgentic.ico') + ',0'
    $shortcut.Description = 'RealAgentic desktop client'
    $shortcut.Save()
}
Write-Output "Installed RealAgentic desktop: $InstallDirectory"
