[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$engineRoot = Join-Path $packageRoot "engine"
$injectorPath = Join-Path $engineRoot "injector.mjs"
$cssPath = Join-Path $engineRoot "skin.css"
$tuningPath = Join-Path $engineRoot "tuning.css"
$manifestPath = Join-Path $packageRoot "theme.json"
$configPath = Join-Path $engineRoot "skin.config.json"
$arcPath = Join-Path $engineRoot "assets\assistant-electric-arc-sprite.svg"
$voxPath = Join-Path $engineRoot "assets\assistant-vox-waveform.svg"
$tablerIconRoot = Join-Path $engineRoot "assets\tabler-project-icons"
$tablerIconNames = @("git-branch.svg", "layers-subtract.svg", "database.svg", "chart-line.svg", "terminal-2.svg", "code.svg", "book-2.svg", "tools.svg", "LICENSE.txt")
$tablerIconPaths = @($tablerIconNames | ForEach-Object { Join-Path $tablerIconRoot $_ })
$independenceQaPath = Join-Path $packageRoot "qa\indicator-independence-qa.mjs"
$adaptiveQaPath = Join-Path $packageRoot "qa\adaptive-indicator-qa.mjs"
$voxResponseQaPath = Join-Path $packageRoot "qa\vox-response-qa.mjs"
$activityWidgetQaPath = Join-Path $packageRoot "qa\activity-widget-qa.mjs"
$usageGaugeQaPath = Join-Path $packageRoot "qa\usage-gauge-qa.mjs"
$manifestListPath = Join-Path $packageRoot "SHA256SUMS.txt"
$zhReadmePath = Join-Path $packageRoot "README.zh-CN.md"
$showcaseDocPath = Join-Path $packageRoot "docs\SHOWCASE.md"
$showcaseMediaPaths = @(
    (Join-Path $packageRoot "docs\media\project-style-menu.gif"),
    (Join-Path $packageRoot "docs\media\appearance-controls.gif")
)
$rootContributingPath = Join-Path $packageRoot "CONTRIBUTING.md"
$rootSecurityPath = Join-Path $packageRoot "SECURITY.md"
$codeOfConductPath = Join-Path $packageRoot "CODE_OF_CONDUCT.md"
$buildScriptPath = Join-Path $packageRoot "Build-Release.ps1"
$buildCmdPath = Join-Path $packageRoot "BUILD-RELEASE.cmd"
$licensePath = Join-Path $packageRoot "LICENSE"
$licenseDecisionPath = Join-Path $packageRoot "LICENSE-DECISION-REQUIRED.md"
$launchScriptPath = Join-Path $packageRoot "Launch-Codex-Themed.ps1"
$launchCmdPath = Join-Path $packageRoot "LAUNCH-CODEX-THEMED.cmd"
$applyCmdPath = Join-Path $packageRoot "APPLY-THEME.cmd"
$failures = [System.Collections.Generic.List[string]]::new()

function Get-Sha256Hex([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "")
        } finally {
            $sha256.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

function Add-Check([bool]$Passed, [string]$Name) {
    if ($Passed) {
        Write-Host "PASS  $Name" -ForegroundColor Green
    } else {
        Write-Host "FAIL  $Name" -ForegroundColor Red
        $failures.Add($Name)
    }
}

$required = @(
    $manifestPath,
    $cssPath,
    $tuningPath,
    $configPath,
    $injectorPath,
    $arcPath,
    $voxPath
) + $tablerIconPaths + @(
    $zhReadmePath,
    $showcaseDocPath,
    $rootContributingPath,
    $rootSecurityPath,
    $codeOfConductPath,
    $buildScriptPath,
    $buildCmdPath,
    $licensePath,
    $launchScriptPath,
    $launchCmdPath,
    $applyCmdPath
) + $showcaseMediaPaths + @(
    $independenceQaPath,
    $adaptiveQaPath,
    $voxResponseQaPath,
    $activityWidgetQaPath,
    $usageGaugeQaPath
)
foreach ($file in $required) {
    Add-Check (Test-Path -LiteralPath $file) ("required file: " + (Split-Path -Leaf $file))
}

$licenseText = if (Test-Path -LiteralPath $licensePath) { Get-Content -Raw -LiteralPath $licensePath } else { "" }
Add-Check ($licenseText.StartsWith("MIT License") -and $licenseText.Contains("Codex Surface Theme contributors")) "root MIT license"
Add-Check (-not (Test-Path -LiteralPath $licenseDecisionPath)) "license decision placeholder removed"

foreach ($mediaPath in $showcaseMediaPaths) {
    if (-not (Test-Path -LiteralPath $mediaPath)) { continue }
    $bytes = [System.IO.File]::ReadAllBytes($mediaPath)
    $signature = if ($bytes.Length -ge 10) { [System.Text.Encoding]::ASCII.GetString($bytes, 0, 6) } else { "" }
    $width = if ($bytes.Length -ge 10) { [System.BitConverter]::ToUInt16($bytes, 6) } else { 0 }
    $height = if ($bytes.Length -ge 10) { [System.BitConverter]::ToUInt16($bytes, 8) } else { 0 }
    Add-Check ($signature -in @("GIF87a", "GIF89a")) ("showcase GIF signature: " + (Split-Path -Leaf $mediaPath))
    Add-Check ($width -eq 880 -and $height -eq 495) ("showcase GIF dimensions: " + (Split-Path -Leaf $mediaPath))
    Add-Check ($bytes.Length -le 2097152) ("showcase GIF <= 2 MiB: " + (Split-Path -Leaf $mediaPath))
}

try {
    $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
    Add-Check ($manifest.packageId -eq "local.codex.surface-theme" -and $manifest.version) "theme manifest parses"
    foreach ($property in $manifest.baselineHashes.PSObject.Properties) {
        $baselineFile = Join-Path $packageRoot $property.Name
        $actualHash = if (Test-Path -LiteralPath $baselineFile) {
            Get-Sha256Hex $baselineFile
        } else {
            ""
        }
        Add-Check ($actualHash -eq $property.Value) ("frozen baseline: " + $property.Name)
    }
} catch {
    Write-Host ("Manifest validation error: " + $_.Exception.Message) -ForegroundColor Red
    Add-Check $false "theme manifest parses"
}

try {
    $null = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
    Add-Check $true "skin config parses"
} catch {
    Add-Check $false "skin config parses"
}

$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if ($nodePath) {
    & $nodePath --check $injectorPath
    Add-Check ($LASTEXITCODE -eq 0) "injector JavaScript syntax"
    & $nodePath --check $independenceQaPath
    Add-Check ($LASTEXITCODE -eq 0) "indicator independence QA syntax"
    & $nodePath --check $adaptiveQaPath
    Add-Check ($LASTEXITCODE -eq 0) "adaptive indicator QA syntax"
    & $nodePath --check $voxResponseQaPath
    Add-Check ($LASTEXITCODE -eq 0) "VOX response QA syntax"
    & $nodePath --check $activityWidgetQaPath
    Add-Check ($LASTEXITCODE -eq 0) "live activity QA syntax"
    & $nodePath --check $usageGaugeQaPath
    Add-Check ($LASTEXITCODE -eq 0) "usage gauge QA syntax"
} else {
    Add-Check $false "Node.js is available"
}

$css = if (Test-Path -LiteralPath $cssPath) { Get-Content -Raw -LiteralPath $cssPath } else { "" }
$tuningCss = if (Test-Path -LiteralPath $tuningPath) { Get-Content -Raw -LiteralPath $tuningPath } else { "" }
$injector = if (Test-Path -LiteralPath $injectorPath) { Get-Content -Raw -LiteralPath $injectorPath } else { "" }
$adaptiveQa = if (Test-Path -LiteralPath $adaptiveQaPath) { Get-Content -Raw -LiteralPath $adaptiveQaPath } else { "" }
$launchScript = if (Test-Path -LiteralPath $launchScriptPath) { Get-Content -Raw -LiteralPath $launchScriptPath } else { "" }
$launchCmd = if (Test-Path -LiteralPath $launchCmdPath) { Get-Content -Raw -LiteralPath $launchCmdPath } else { "" }
$applyCmd = if (Test-Path -LiteralPath $applyCmdPath) { Get-Content -Raw -LiteralPath $applyCmdPath } else { "" }
$themeCss = $css + "`n" + $tuningCss
Add-Check ($launchScript.Contains('THEME_RECOVERY_REQUIRED=1') -and $launchScript.Contains('active tasks remain untouched') -and $launchScript.Contains('exit 2')) "launcher fails closed for running Codex without endpoint"
Add-Check ((-not $launchScript.Contains('CloseMainWindow()')) -and (-not $launchScript.Contains('Stop-Process')) -and (-not $launchScript.Contains('[switch]$AutoRecover'))) "launcher never closes or restarts Codex"
Add-Check ($launchCmd.Contains('Launch-Codex-Themed.ps1"') -and (-not $launchCmd.Contains('-AutoRecover'))) "launcher CMD keeps recovery manual"
Add-Check ($applyCmd.Contains('if not "%exit_code%"=="2" goto pause_now') -and $applyCmd.Contains('No Codex process was closed or restarted') -and (-not $applyCmd.Contains('Launch-Codex-Themed.ps1'))) "Apply entry preserves running Codex"
$markers = [ordered]@{
    "Surface layout" = 'data-codex-surface-layout="surface"'
    "Composer runner" = "surface-composer-ring-flow"
    "Folder colors" = "data-codex-project-color"
    "Project grid" = "data-codex-project-grid"
    "Thread icons" = "data-codex-thread-icon"
    "Rider indicator" = "surface-assistant-rider-sweep"
    "Plasma selector plumbing" = 'data-codex-assistant-indicator="current"'
    "Plasma breathing indicator" = "surface-assistant-plasma-rail-breathe"
    "ECG indicator" = 'data-codex-assistant-indicator="ecg"'
    "VOX indicator" = 'data-codex-assistant-indicator="vox"'
    "VOX Canvas surface" = "data-codex-vox-canvas-container"
    "Adaptive dark indicators" = ".electron-dark"
    "Sidebar online core" = "data-codex-online-core"
    "Online Core enable switch" = "data-codex-online-core-switch"
    "Indicator enable switch" = "data-codex-assistant-enabled-switch"
    "Sidebar live activity" = "data-codex-live-activity"
    "Live activity appearance control" = "data-codex-live-activity-control"
    "Live activity accent palette" = "data-codex-live-activity-accent-value"
    "Segmented truthful progress" = "data-codex-live-progress-segment"
    "Composer native context ring" = "data-codex-context-widget"
    "Native usage gauge" = "data-codex-usage-gauge"
    "Usage gauge appearance control" = "data-codex-usage-gauge-control"
}
foreach ($entry in $markers.GetEnumerator()) {
    Add-Check ($themeCss.Contains($entry.Value)) $entry.Key
}
Add-Check ($injector.Contains('onlineCoreEnabledStorageKey')) "independent Online Core storage"
Add-Check ($injector.Contains('requestAnimationFrame(renderVoxOscilloscopes)')) "VOX shared animation loop"
Add-Check ($injector.Contains('const voxActiveFrameInterval = 1000 / 30')) "VOX active frame-rate governor"
Add-Check ($injector.Contains('const voxIdleFrameInterval = 1000 / 15')) "VOX idle frame-rate governor"
Add-Check ($injector.Contains('voxPaintedCanvases')) "VOX observer repaint deduplication"
Add-Check ($injector.Contains('window.devicePixelRatio')) "VOX DPR-aware canvas"
Add-Check ($injector.Contains('? 0.9 + breath * 0.1')) "VOX active energy floor"
Add-Check ($injector.Contains('distance * 1.18 - voxTime * 14')) "VOX smooth active transient"
Add-Check ($injector.Contains('Repaint only a sub-pixel white-hot core')) "VOX crisp active core repaint"
Add-Check ($tuningCss.Contains('--codex-online-core-width: 192px;')) "VOX extended Online Core width"
Add-Check ($tuningCss.Contains(':has(> [data-composer-surface-variant])') -and $tuningCss.Contains('overflow: visible !important;')) "Composer native menu is not clipped"
Add-Check ($tuningCss.Contains('[id^="terminal-panel-"]') -and $tuningCss.Contains('button[aria-current="location"]') -and $tuningCss.Contains('background: var(--color-token-main-surface-primary, #191919);')) "Terminal source-directory overlay remains opaque"
Add-Check ($tuningCss.Contains('Single-column project tree') -and $tuningCss.Contains('display: flex !important;') -and $tuningCss.Contains('border-inline-start: 1px solid color-mix(')) "Sidebar projects use the single-column tree"
Add-Check ($tuningCss.Contains('[data-app-action-sidebar-thread-row]::before') -and $tuningCss.Contains('[data-codex-thread-icon="true"]') -and $tuningCss.Contains('display: none !important;')) "Sidebar tree branches replace chat-bubble icons"
Add-Check ($injector.Contains('mountProjectIcons') -and $injector.Contains('data-codex-project-icon') -and $injector.Contains('projectIconAssetFiles')) "Sidebar project icons use packaged Tabler glyphs"
Add-Check ($injector.Contains('ensureStartupHydrationObserver') -and $injector.Contains('queueMicrotask(refreshStartupHydration)') -and $injector.Contains('data-codex-startup-sync')) "Cold-start surfaces follow React hydration"
Add-Check ($injector.Contains('reconcileDynamicShell') -and $injector.Contains('sidebar !== projectColorObservedSidebar') -and $injector.Contains('document.body !== onlineCoreObservedBody')) "Route shell replacement remounts startup surfaces"
Add-Check ($injector.Contains('finally {') -and $injector.Contains('if (statusWidgetLoopActive) scheduleStatusWidgetHeartbeat();')) "Status heartbeat survives transient hydration errors"
Add-Check ($tuningCss.Contains('svg:not([data-codex-project-icon])') -and $tuningCss.Contains('[data-codex-project-icon]')) "Official mode preserves native project folder icons"
Add-Check ($injector.Contains('codex.sidebar-project-icons.v1') -and $injector.Contains('data-codex-project-icon-swatch') -and $injector.Contains('projectIconChoices')) "Project icon choices persist independently"
Add-Check ($tuningCss.Contains('[data-codex-project-icon-grid="true"]') -and $tuningCss.Contains('grid-template-columns: repeat(4, 1fr)')) "Project style popover exposes eight icon choices"
Add-Check (($tablerIconNames | Where-Object { Test-Path -LiteralPath (Join-Path $tablerIconRoot $_) }).Count -eq 9) "Tabler icon assets and MIT license are packaged"
Add-Check ($adaptiveQa.Contains("setOnlineCoreState?.('auto')")) "Adaptive QA restores automatic activity"
Add-Check ($tuningCss.Contains('@keyframes codex-online-core-rider-cycle')) "Rider Online Core uses a full-cycle keyframe"
Add-Check (-not $tuningCss.Contains('codex-online-core-scan var(--codex-online-core-duration) ease-in-out infinite alternate')) "Rider Online Core is not half-speed alternate"
Add-Check ($tuningCss.Contains('--codex-online-core-runner-height: 4px;')) "Rider compact mark is optically reduced"
Add-Check ($tuningCss.Contains('inset-block-start: -2px !important;')) "Plasma response single-line alignment"
Add-Check ($tuningCss.Contains('drop-shadow(0 0 0.3px rgb(255 255 255 / 92%))')) "Plasma crisp white-violet core"
Add-Check ($tuningCss.Contains('filter: var(--surface-assistant-thinking-beat-filter);')) "Plasma material shared by Online Core"
Add-Check ($tuningCss.Contains('opacity: 0.62;')) "Plasma Online Core synchronized envelope"
Add-Check ($tuningCss.Contains('[data-codex-online-core-enabled="false"]')) "independent Online Core CSS gate"
Add-Check (-not $injector.Contains('if (!getAssistantIndicatorEnabled()) return;')) "Online Core switch is not gated by response switch"
Add-Check ($injector.Contains('latestTokenUsageInfo')) "Codex context usage source"
Add-Check ($injector.Contains('composer-native-context')) "Composer native context source"
Add-Check ($injector.Contains('threadRuntimeStatus')) "Codex live task runtime source"
Add-Check ($injector.Contains('setLiveActivityState')) "live activity QA state seam"
Add-Check ($injector.Contains('liveActivityEnabledStorageKey')) "independent live activity visibility storage"
Add-Check ($injector.Contains('liveActivityAccentStorageKey')) "independent live activity accent storage"
Add-Check ($injector.Contains('setLiveActivityEnabled')) "live activity enable controller"
Add-Check ($injector.Contains('setLiveActivityAccent')) "live activity accent controller"
Add-Check ($injector.Contains('["rate-limit-status"]')) "native rate-limit query cache source"
Add-Check ($injector.Contains('setUsageGaugeMode')) "usage gauge mode controller"
Add-Check ($injector.Contains('usageGaugeModeStorageKey')) "usage gauge preference storage"
Add-Check ($css.Contains('background: #07080a;') -and $css.Contains('data-codex-usage-gauge-popover')) "usage gauge uses a crisp black instrument surface"
Add-Check ($themeCss.Contains('[data-codex-live-activity-enabled="false"]')) "live activity CSS visibility gate"
Add-Check (-not $injector.Contains('navigator.connection')) "network telemetry removed"

# English LIVE ACTIVITY status recognition. Bilingual visible-label
# localization is intentionally out of scope; the shipped behavior recognizes
# English status text, and this static gate keeps that contract testable.
$activityWidgetQa = if (Test-Path -LiteralPath $activityWidgetQaPath) { Get-Content -Raw -LiteralPath $activityWidgetQaPath } else { "" }
Add-Check ($injector.Contains('stateText.textContent = "READY"')) "LIVE ACTIVITY English READY state"
Add-Check ($injector.Contains('"Running" : completed ? "Complete" : "READY"')) "LIVE ACTIVITY English Running/Complete/READY mapping"
Add-Check ($injector.Contains('"ultra": "ULTRA"') -and $injector.Contains('"最高": "MAX"') -and $injector.Contains('"极高": "XH"') -and $injector.Contains('"高": "H"')) "LIVE ACTIVITY compact effort labels"
Add-Check ($injector.Contains('progress-label="true"]''), "STATUS"')) "LIVE ACTIVITY English STATUS label"
Add-Check ($injector.Contains('agent.status === "done"') -and $injector.Contains('data-codex-live-subtask-total')) "LIVE ACTIVITY English done/total recognition"
Add-Check ($injector.Contains('spawned|created|waiting for|completed')) "LIVE ACTIVITY English agent-status recognition"
Add-Check ($injector.Contains('agent.name')) "LIVE ACTIVITY agent name recognition"
Add-Check ($activityWidgetQa.Contains('"Running title appearance QA"')) "LIVE ACTIVITY QA uses English status fixtures"
Add-Check ($activityWidgetQa.Contains('status: "done"')) "LIVE ACTIVITY QA done status fixture"

# Release manifest guard: every listed public file must exist and match its
# SHA-256, and machine-specific / internal files must never be listed.
$forbiddenManifestPatterns = @(
    "*.log",
    "*.png",
    "*.lnk",
    "runtime.json",
    "recovery-state.json",
    "RECOVERY-SHA256.txt",
    "VERIFY-RECOVERY.cmd",
    "Verify-RecoveryHashes.ps1",
    "FINAL-BACKUP-REPORT.md",
    "AGENTS.md",
    "design-qa.md",
    "DS-SOL-P2-CORRECTION.md",
    "SHA256SUMS.txt",
    "staging/*",
    "reference-assets/*",
    "shortcut-backups/*",
    "RELEASE-INTERNAL/*",
    "dist/*",
    "qa/*/*"
)
if (Test-Path -LiteralPath $manifestListPath) {
    $manifestEntries = 0
    $manifestGifEntries = [System.Collections.Generic.List[string]]::new()
    foreach ($line in Get-Content -LiteralPath $manifestListPath) {
        if ($line -match '^\s*([0-9A-Fa-f]{64})\s+(.+?)\s*$') {
            $manifestEntries++
            $relPath = $Matches[2]
            if ($relPath.EndsWith(".gif", [System.StringComparison]::OrdinalIgnoreCase)) {
                $manifestGifEntries.Add($relPath)
            }
            $forbidden = $forbiddenManifestPatterns | Where-Object { $relPath -like $_ }
            if ($forbidden) {
                Add-Check $false ("no machine/internal file in SHA256SUMS: " + $relPath)
                continue
            }
            $manifestFile = Join-Path $packageRoot ($relPath -replace "/", "\")
            if (-not (Test-Path -LiteralPath $manifestFile)) {
                Add-Check $false ("manifest file exists: " + $relPath)
                continue
            }
            $actualHash = Get-Sha256Hex $manifestFile
            Add-Check ($actualHash -eq $Matches[1].ToUpperInvariant()) ("manifest hash: " + $relPath)
        }
    }
    Add-Check ($manifestEntries -gt 0) "SHA256SUMS.txt parses with entries"
    $expectedGifEntries = @("docs/media/appearance-controls.gif", "docs/media/project-style-menu.gif")
    $actualGifEntries = @($manifestGifEntries | Sort-Object)
    Add-Check (($actualGifEntries -join "|") -eq ($expectedGifEntries -join "|")) "only sanitized showcase GIFs are public"

    # Reverse guard: every non-forbidden file on disk must be listed in the
    # manifest, so a newly added private/stray file can never enter the public
    # tree silently (e.g. staging snapshots, QA screenshots, internal notes).
    $manifestRelSet = @{}
    foreach ($line in Get-Content -LiteralPath $manifestListPath) {
        if ($line -match '^\s*([0-9A-Fa-f]{64})\s+(.+?)\s*$') {
            $manifestRelSet[$Matches[2]] = $true
        }
    }
    $unlistedPublic = [System.Collections.Generic.List[string]]::new()
    foreach ($diskFile in Get-ChildItem -LiteralPath $packageRoot -Recurse -File | Where-Object { $_.FullName -notmatch '\\\.git\\' }) {
        $rel = $diskFile.FullName.Substring($packageRoot.Length + 1).Replace("\", "/")
        $isForbidden = $forbiddenManifestPatterns | Where-Object { $rel -like $_ }
        if ($isForbidden) { continue }
        if (-not $manifestRelSet.ContainsKey($rel)) {
            $unlistedPublic.Add($rel)
        }
    }
    Add-Check ($unlistedPublic.Count -eq 0) "manifest covers every public file on disk"
} else {
    Add-Check $false "SHA256SUMS.txt exists"
}

Add-Check (-not (Test-Path -LiteralPath (Join-Path $engineRoot "surface-theme.log"))) "no runtime log in package tree"

if ($failures.Count -gt 0) {
    Write-Host "Theme package validation failed: $($failures.Count) check(s)." -ForegroundColor Red
    exit 1
}

Write-Output "THEME_PACKAGE_TEST=PASS"
Write-Host "All package checks passed." -ForegroundColor Green
