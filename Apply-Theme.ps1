[CmdletBinding()]
param(
    [ValidateRange(1, 60)]
    [int]$WaitSeconds = 5
)

$ErrorActionPreference = "Stop"
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$engineRoot = Join-Path $packageRoot "engine"
$injectorPath = Join-Path $engineRoot "injector.mjs"
$cssPath = Join-Path $engineRoot "skin.css"
$runtimePath = Join-Path $packageRoot "runtime.json"
$manifestPath = Join-Path $packageRoot "theme.json"

function Test-DebugEndpoint([int]$Port) {
    try {
        $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2 -ErrorAction Stop
        return [bool]($targets | Where-Object { $_.type -eq "page" -and $_.url -eq "app://-/index.html" })
    } catch {
        return $false
    }
}

function Find-ThemeSession {
    $candidates = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq "ChatGPT.exe" -and
        $_.ExecutablePath -like "*OpenAI.Codex_*" -and
        $_.CommandLine -notmatch "--type=" -and
        $_.CommandLine -match "--remote-debugging-port=(\d+)"
    })

    foreach ($candidate in $candidates) {
        $match = [regex]::Match($candidate.CommandLine, "--remote-debugging-port=(\d+)")
        if (-not $match.Success) { continue }
        $port = [int]$match.Groups[1].Value
        if (Test-DebugEndpoint -Port $port) {
            return [pscustomobject]@{ Process = $candidate; Port = $port }
        }
    }
    return $null
}

foreach ($required in @($injectorPath, $cssPath, $manifestPath)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Theme package file is missing: $required"
    }
}

$deadline = (Get-Date).AddSeconds($WaitSeconds)
$session = $null
do {
    $session = Find-ThemeSession
    if ($session) { break }
    Start-Sleep -Milliseconds 350
} while ((Get-Date) -lt $deadline)

if (-not $session) {
    Write-Output "THEME_APPLIED=0"
    Write-Host "The running Codex does not expose a local theme endpoint." -ForegroundColor Yellow
    Write-Host "Fully exit Codex from the tray, then run LAUNCH-CODEX-THEMED.cmd."
    exit 2
}

# Keep the package strictly one-shot. Stop only injector watchers attached to
# the same Codex debug port, including any legacy watcher.
$watchers = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq "node.exe" -and
    $_.CommandLine -match "injector\.mjs" -and
    $_.CommandLine -match "--watch" -and
    $_.CommandLine -match ("--port\s+" + $session.Port + "(?:\s|$)")
})
foreach ($watcher in $watchers) {
    Stop-Process -Id $watcher.ProcessId -Force -ErrorAction SilentlyContinue
}

$nodePath = (Get-Command node -ErrorAction Stop).Source
& $nodePath $injectorPath --port $session.Port --css $cssPath --activate-surface --timeout-ms 30000
if ($LASTEXITCODE -ne 0) {
    throw "The one-shot theme injection failed with exit code $LASTEXITCODE."
}

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$codexPackage = Get-AppxPackage -Name "OpenAI.Codex" -ErrorAction SilentlyContinue |
    Sort-Object Version -Descending |
    Select-Object -First 1
$runtime = [ordered]@{
    schemaVersion = 1
    packageId = $manifest.packageId
    packageVersion = $manifest.version
    appliedAt = (Get-Date).ToString("o")
    debugHost = "127.0.0.1"
    debugPort = $session.Port
    codexPid = [int]$session.Process.ProcessId
    codexVersion = if ($codexPackage) { $codexPackage.Version.ToString() } else { "unknown" }
    injectorPid = 0
    injectionMode = "one-shot"
    cssPath = $cssPath
}
$runtime | ConvertTo-Json | Set-Content -LiteralPath $runtimePath -Encoding UTF8

Write-Output "THEME_APPLIED=1"
Write-Host "Codex Surface Theme is active. No background watcher remains." -ForegroundColor Green
