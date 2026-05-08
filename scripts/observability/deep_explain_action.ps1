param(
  [string]$UserActionId,
  [switch]$Latest,
  [string]$OutputDir
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$duckdbExe = Join-Path $repoRoot "tools\duckdb\duckdb.exe"
$dbPath = Join-Path $repoRoot ".observability\observability_v1.duckdb"
$bunExe = "bun"

if (-not (Test-Path -LiteralPath $duckdbExe)) {
  throw "DuckDB executable not found at $duckdbExe"
}

if (-not (Test-Path -LiteralPath $dbPath)) {
  throw "DuckDB database not found at $dbPath"
}

if ([string]::IsNullOrWhiteSpace($UserActionId)) {
  $Latest = $true
}

function Resolve-ShortId {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return "latest" }
  if ($Value.Length -le 8) { return $Value }
  return $Value.Substring(0, 8)
}

function Resolve-LatestUserActionId {
  $snapshotDir = Join-Path $repoRoot ".observability\v1-report-db-snapshots"
  [System.IO.Directory]::CreateDirectory($snapshotDir) | Out-Null
  $tempDb = Join-Path $snapshotDir ("deep_explain_action_ps1_{0}.duckdb" -f ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()))
  try {
    Copy-Item -LiteralPath $dbPath -Destination $tempDb -Force
    $rows = & $duckdbExe -json $tempDb "select user_action_id from user_actions order by started_at_ms desc limit 1;"
    $parsed = $rows | ConvertFrom-Json
    if ($parsed -is [System.Array]) {
      return $parsed[0].user_action_id
    }
    return $parsed.user_action_id
  } finally {
    if (Test-Path -LiteralPath $tempDb) {
      Remove-Item -LiteralPath $tempDb -Force
    }
  }
}

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  if ($Latest) {
    $UserActionId = Resolve-LatestUserActionId
    $Latest = $false
  }
  $targetId = Resolve-ShortId $UserActionId
  $OutputDir = Join-Path $repoRoot ("ObservrityTask\action-reports\deep\user_action_{0}" -f $targetId)
} elseif (-not [System.IO.Path]::IsPathRooted($OutputDir)) {
  $OutputDir = Join-Path $repoRoot $OutputDir
}

[System.IO.Directory]::CreateDirectory($OutputDir) | Out-Null

$baselineReportPath = Join-Path $OutputDir "baseline_action_report.md"
$tsArgs = @(
  "run",
  (Join-Path $repoRoot "scripts\observability\deep_explain_action.ts")
)
if ($Latest) {
  $tsArgs += "--latest"
} else {
  $tsArgs += @("--user-action-id", $UserActionId)
}
$tsArgs += @("--output-dir", $OutputDir, "--baseline-report-path", $baselineReportPath)

& $bunExe @tsArgs
if ($LASTEXITCODE -ne 0) {
  throw "deep_explain_action.ts failed."
}

$explainArgs = @(
  "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $repoRoot "scripts\observability\explain_action.ps1"),
  "-OutputPath", $baselineReportPath
)
if ($Latest) {
  $explainArgs += "-Latest"
} else {
  $explainArgs += @("-UserActionId", $UserActionId)
}
$explainArgs += "-SnapshotDb"

powershell @explainArgs | Out-Null

Write-Output ("Generated deep action report: {0}" -f (Join-Path $OutputDir "deep_report.md"))
