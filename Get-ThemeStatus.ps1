[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$injectorPath = Join-Path $packageRoot "engine\injector.mjs"
$runtimePath = Join-Path $packageRoot "runtime.json"
$requiredFiles = @(
    (Join-Path $packageRoot "theme.json"),
    (Join-Path $packageRoot "engine\skin.css"),
    (Join-Path $packageRoot "engine\tuning.css"),
    $injectorPath,
    (Join-Path $packageRoot "engine\skin.config.json"),
    (Join-Path $packageRoot "engine\assets\assistant-electric-arc-sprite.svg"),
    (Join-Path $packageRoot "engine\assets\assistant-vox-waveform.svg")
)

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

$missing = @($requiredFiles | Where-Object { -not (Test-Path -LiteralPath $_) })
$session = Find-ThemeSession
$live = $null
if ($session) {
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $statusOutput = @(& $nodePath $injectorPath --status --port $session.Port --timeout-ms 5000 2>&1)
    $jsonLine = $statusOutput | Where-Object { $_.ToString() -like "STATUS_JSON=*" } | Select-Object -Last 1
    if ($LASTEXITCODE -eq 0 -and $jsonLine) {
        $json = $jsonLine.ToString().Substring("STATUS_JSON=".Length)
        $live = $json | ConvertFrom-Json
    }
}

$watchers = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq "node.exe" -and $_.CommandLine -match "injector\.mjs" -and $_.CommandLine -match "--watch"
})

$result = [ordered]@{
    PackageReady = ($missing.Count -eq 0)
    MissingFiles = $missing
    RuntimeRecord = (Test-Path -LiteralPath $runtimePath)
    CodexRunning = [bool]$session
    DebugPort = if ($session) { $session.Port } else { $null }
    Installed = if ($live) { [bool]$live.installed } else { $false }
    ActiveStyleId = if ($live) { $live.activeStyleId } else { $null }
    ActiveLayout = if ($live) { $live.activeLayout } else { "unavailable" }
    AssistantIndicator = if ($live) { $live.assistantIndicator } else { $null }
    AssistantIndicatorEnabled = if ($live) { [bool]$live.assistantIndicatorEnabled } else { $null }
    AssistantIndicatorPlacement = if ($live) { $live.assistantIndicatorPlacement } else { $null }
    OnlineCoreEnabled = if ($live) { [bool]$live.onlineCoreEnabled } else { $null }
    ControllerReady = if ($live) { [bool]$live.controllerReady } else { $false }
    AppearanceControlsMounted = if ($live) { [bool]$live.appearanceControlsMounted } else { $false }
    AssistantIndicatorControlMounted = if ($live) { [bool]$live.assistantIndicatorControlMounted } else { $false }
    AssistantPlacementControlMounted = if ($live) { [bool]$live.assistantPlacementControlMounted } else { $false }
    OnlineCoreControlMounted = if ($live) { [bool]$live.onlineCoreControlMounted } else { $false }
    ProjectColorsIntegrated = if ($live) { [int]$live.projectColorsIntegrated } else { 0 }
    ProjectCardsIntegrated = if ($live) { [int]$live.projectCardsIntegrated } else { 0 }
    ThreadIconsIntegrated = if ($live) { [int]$live.threadIconsIntegrated } else { 0 }
    OnlineCoreIntegrated = if ($live) { [bool]$live.onlineCoreIntegrated } else { $false }
    OnlineCoreState = if ($live) { $live.onlineCoreState } else { $null }
    LiveActivityIntegrated = if ($live) { [bool]$live.liveActivityIntegrated } else { $false }
    LiveActivityEnabled = if ($live) { [bool]$live.liveActivityEnabled } else { $null }
    LiveActivityAccent = if ($live) { $live.liveActivityAccent } else { $null }
    LiveActivityControlMounted = if ($live) { [bool]$live.liveActivityControlMounted } else { $false }
    LiveActivitySource = if ($live) { $live.liveActivitySource } else { $null }
    LiveSubtaskTotal = if ($live -and $null -ne $live.liveSubtaskTotal) { [int]$live.liveSubtaskTotal } else { $null }
    LiveSubtaskDone = if ($live -and $null -ne $live.liveSubtaskDone) { [int]$live.liveSubtaskDone } else { $null }
    UsageGaugeMode = if ($live) { $live.usageGaugeMode } else { $null }
    UsageGaugeIntegrated = if ($live) { [bool]$live.usageGaugeIntegrated } else { $false }
    UsageGaugeControlMounted = if ($live) { [bool]$live.usageGaugeControlMounted } else { $false }
    UsageRemaining = if ($live -and $null -ne $live.usageRemaining) { [int]$live.usageRemaining } else { $null }
    UsageSource = if ($live) { $live.usageSource } else { $null }
    ContextInComposer = if ($live) { [bool]$live.contextInComposer } else { $false }
    ContextPercent = if ($live -and $null -ne $live.contextPercent) { [int]$live.contextPercent } else { $null }
    ContextSource = if ($live) { $live.contextSource } else { $null }
    ContextAccent = if ($live) { $live.contextAccent } else { $null }
    StartupSync = if ($live) { $live.startupSync } else { $null }
    VoxCanvasCount = if ($live) { [int]$live.voxCanvasCount } else { 0 }
    VoxCanvasRunning = if ($live) { [bool]$live.voxCanvasRunning } else { $false }
    InjectorWatchers = $watchers.Count
}

[pscustomobject]$result | Format-List
Write-Output ("THEME_STATUS_JSON=" + ([pscustomobject]$result | ConvertTo-Json -Compress))
