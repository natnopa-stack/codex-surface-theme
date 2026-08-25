[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$injectorPath = Join-Path $packageRoot "engine\injector.mjs"
$runtimePath = Join-Path $packageRoot "runtime.json"

function Test-DebugEndpoint([int]$Port) {
    try {
        $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2 -ErrorAction Stop
        return [bool]($targets | Where-Object { $_.type -eq "page" -and $_.url -eq "app://-/index.html" })
    } catch {
        return $false
    }
}

function Find-ThemePort {
    if (Test-Path -LiteralPath $runtimePath) {
        try {
            $runtime = Get-Content -Raw -LiteralPath $runtimePath | ConvertFrom-Json
            if ($runtime.debugPort -and (Test-DebugEndpoint -Port ([int]$runtime.debugPort))) {
                return [int]$runtime.debugPort
            }
        } catch {
            # Fall through to live process discovery.
        }
    }

    $candidates = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq "ChatGPT.exe" -and
        $_.ExecutablePath -like "*OpenAI.Codex_*" -and
        $_.CommandLine -notmatch "--type=" -and
        $_.CommandLine -match "--remote-debugging-port=(\d+)"
    })
    foreach ($candidate in $candidates) {
        $match = [regex]::Match($candidate.CommandLine, "--remote-debugging-port=(\d+)")
        if ($match.Success -and (Test-DebugEndpoint -Port ([int]$match.Groups[1].Value))) {
            return [int]$match.Groups[1].Value
        }
    }
    return $null
}

$port = Find-ThemePort
if (-not $port) {
    Remove-Item -LiteralPath $runtimePath -Force -ErrorAction SilentlyContinue
    Write-Output "THEME_REMOVED=0"
    Write-Host "No live themed Codex session was found; the local runtime record is clear." -ForegroundColor Yellow
    exit 0
}

$watchers = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq "node.exe" -and
    $_.CommandLine -match "injector\.mjs" -and
    $_.CommandLine -match "--watch" -and
    $_.CommandLine -match ("--port\s+" + $port + "(?:\s|$)")
})
foreach ($watcher in $watchers) {
    Stop-Process -Id $watcher.ProcessId -Force -ErrorAction SilentlyContinue
}

$nodePath = (Get-Command node -ErrorAction Stop).Source
& $nodePath $injectorPath --remove --port $port --timeout-ms 5000
$removeExitCode = $LASTEXITCODE
Remove-Item -LiteralPath $runtimePath -Force -ErrorAction SilentlyContinue

if ($removeExitCode -ne 0) {
    throw "Codex did not accept the live theme removal command."
}

Write-Output "THEME_REMOVED=1"
Write-Host "The theme was removed from the open Codex window; official layout is active." -ForegroundColor Green

