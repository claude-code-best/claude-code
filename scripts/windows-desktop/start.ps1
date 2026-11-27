param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'desktop-config.json') -Raw | ConvertFrom-Json
if ($config.ConnectOnly) { return }
$repo = $config.RepositoryPath
$bun = $config.BunPath
$logs = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$mutex = [Threading.Mutex]::new($false, 'Local\RealAgenticDesktopLauncher')
$locked = $false
Add-Type -AssemblyName System.Net.Http
$handler = [Net.Http.HttpClientHandler]::new()
$handler.UseProxy = $false
$client = [Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(2)
function Test-Health {
    try {
        $response = $client.GetAsync('http://127.0.0.1:3000/health').GetAwaiter().GetResult()
        try { return $response.IsSuccessStatusCode } finally { $response.Dispose() }
    } catch { return $false }
}
function Start-Bun([string]$Arguments, [string]$Name) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    Start-Process -FilePath $bun -ArgumentList $Arguments -WorkingDirectory $repo -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logs "$Name-$stamp.log") `
        -RedirectStandardError (Join-Path $logs "$Name-$stamp.err.log")
}
try {
    try { $locked = $mutex.WaitOne(105000) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Another desktop startup is still in progress.' }
    if (Test-Health) { return }
    if (-not (Test-Path -LiteralPath $bun -PathType Leaf)) { throw 'Bun was moved. Run install.ps1 again.' }
    if (-not (Test-Path -LiteralPath (Join-Path $repo 'node_modules'))) { throw 'Run bun install in the repository first.' }
    $env:PATH = (Split-Path -Parent $bun) + ';' + $env:PATH
    $env:RCS_HOST = '127.0.0.1'
    $env:RCS_PORT = '3000'
    $env:RCS_BASE_URL = 'http://127.0.0.1:3000'
    $env:RCS_HEALTH_TIMEOUT_MS = '90000'
    # Preserve all existing non-local proxy exclusions.
    $env:NO_PROXY = (@($env:NO_PROXY, $env:no_proxy, 'localhost,127.0.0.1,::1') | Where-Object { $_ }) -join ','
    $env:RCS_NO_PROXY = $env:NO_PROXY
    if (Test-Path -LiteralPath (Join-Path $repo 'scripts/rcs-stack/main.ts')) {
        $server = Start-Bun 'run scripts/rcs-stack/main.ts local' 'stack'
        $legacy = $false
    } else {
        # A private per-install transport key is generated locally, never committed.
        $keyPath = Join-Path $PSScriptRoot 'transport-key.txt'
        if (-not (Test-Path -LiteralPath $keyPath)) {
            [IO.File]::WriteAllText($keyPath, [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N'))
        }
        $env:RCS_API_KEYS = [IO.File]::ReadAllText($keyPath).Trim()
        $env:CLAUDE_BRIDGE_BASE_URL = $env:RCS_BASE_URL
        $env:CLAUDE_BRIDGE_OAUTH_TOKEN = $env:RCS_API_KEYS
        $server = Start-Bun 'run scripts/rcs.ts' 'server'
        $legacy = $true
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    while (-not (Test-Health)) {
        if ($server.HasExited) { throw "Server exited. See $logs" }
        if ([DateTime]::UtcNow -gt $deadline) { throw "Server startup timed out. See $logs" }
        Start-Sleep -Milliseconds 500
    }
    if ($legacy) {
        $worker = Start-Bun 'run scripts/dev.ts remote-control' 'worker'
        Start-Sleep -Seconds 2
        if ($worker.HasExited) {
            # Only stop the server tree created by this invocation, so a retry
            # cannot mistake an orphaned server for a functioning local stack.
            & taskkill.exe /PID $server.Id /T /F 2>&1 | Out-Null
            throw "Worker exited. Review the worker log in $logs (including workspace trust)."
        }
    }
} finally {
    $client.Dispose()
    $handler.Dispose()
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
