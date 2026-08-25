[CmdletBinding()]
param(
    [string]$PackageRoot = $PSScriptRoot,
    [string]$ZipName = "codex-surface-theme-1.12.3.zip",
    [switch]$SkipTest
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($PackageRoot)) {
    $PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$packageRoot = [System.IO.Path]::GetFullPath($PackageRoot)

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

function Test-ForbiddenRelative([string]$RelPath) {
    $segments = $RelPath -split '/'
    $first = $segments[0]
    $leaf = $segments[-1]
    $allowedShowcaseGifs = @(
        "docs/media/appearance-controls.gif",
        "docs/media/project-style-menu.gif"
    )
    if ($first -in @(".git", "dist", "RELEASE-INTERNAL", "staging", "reference-assets", "shortcut-backups")) { return $true }
    if ($first -eq "qa") {
        # Only top-level *.mjs QA scripts are public; screenshots and QA
        # subfolders (artifacts, indicators, ...) stay private.
        if ($segments.Count -eq 2 -and $leaf.EndsWith(".mjs")) { return $false }
        return $true
    }
    if ($first -eq "AGENTS.md") { return $true }
    if ($leaf -in @("runtime.json", "recovery-state.json", "RECOVERY-SHA256.txt", "VERIFY-RECOVERY.cmd", "Verify-RecoveryHashes.ps1", "FINAL-BACKUP-REPORT.md", "design-qa.md", "DS-SOL-P2-CORRECTION.md", "SHA256SUMS.txt")) { return $true }
    if ($leaf.EndsWith(".log") -or $leaf.EndsWith(".png") -or $leaf.EndsWith(".lnk")) { return $true }
    if ($leaf.EndsWith(".gif") -and $RelPath -notin $allowedShowcaseGifs) { return $true }
    return $false
}

# 1. Clean runtime logs inside the package (validated scope: <root>\engine\*.log),
#    so a previously used working tree is always a clean release tree.
$engineRoot = Join-Path $packageRoot "engine"
if (Test-Path -LiteralPath $engineRoot) {
    Get-ChildItem -LiteralPath $engineRoot -Filter "*.log" -File -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Force
    }
}

# 2. Hard gate: package tests must pass before packaging.
if (-not $SkipTest) {
    $testScript = Join-Path $packageRoot "Test-ThemePackage.ps1"
    if (-not (Test-Path -LiteralPath $testScript)) { throw "Missing package test: $testScript" }
    $pwsh = (Get-Command powershell.exe -ErrorAction Stop).Source
    & $pwsh -NoProfile -ExecutionPolicy Bypass -File $testScript
    if ($LASTEXITCODE -ne 0) {
        throw "Package test failed; refusing to build. After intentional content changes, run once with -SkipTest to regenerate SHA256SUMS.txt, then re-run this gated build and TEST-THEME-PACKAGE.cmd."
    }
}

# 3. Enumerate public files.
$public = @(Get-ChildItem -LiteralPath $packageRoot -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($packageRoot.Length + 1).Replace("\", "/")
    if (-not (Test-ForbiddenRelative $rel)) { $rel }
} | Sort-Object)

$forbiddenFound = @($public | Where-Object { Test-ForbiddenRelative $_ })
if ($forbiddenFound.Count -gt 0) {
    throw "Forbidden entries would be packaged: $($forbiddenFound -join ', ')"
}

# 4. Regenerate SHA256SUMS.txt (deterministic: sorted relative paths, UTF-8 no BOM).
$dateStamp = Get-Date -Format "yyyy-MM-dd"
$fixedEntryTime = [DateTimeOffset]::new([DateTime]::ParseExact($dateStamp + " 00:00:00", "yyyy-MM-dd HH:mm:ss", $null), [TimeSpan]::Zero)
$lines = New-Object System.Collections.Generic.List[string]
$releaseLabel = [System.IO.Path]::GetFileNameWithoutExtension($ZipName) -replace '^codex-surface-theme-', ''
$lines.Add("# Codex Surface Theme $releaseLabel public file hashes")
$lines.Add("# Format: SHA256  relative-path")
$lines.Add("# Generated $dateStamp; excludes machine-specific files, runtime logs (*.log), and internal files.")
foreach ($rel in $public) {
    $diskPath = Join-Path $packageRoot ($rel -replace "/", "\")
    $lines.Add((Get-Sha256Hex $diskPath) + "  " + $rel)
}
$manifestPath = Join-Path $packageRoot "SHA256SUMS.txt"
[System.IO.File]::WriteAllLines($manifestPath, $lines, (New-Object System.Text.UTF8Encoding($false)))

# 5. Build the release ZIP: public files + SHA256SUMS.txt.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$distDir = Join-Path $packageRoot "dist"
New-Item -ItemType Directory -Path $distDir -Force | Out-Null
$zipPath = Join-Path $distDir $ZipName
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($rel in @($public) + @("SHA256SUMS.txt")) {
        $entry = $zip.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
        $entry.LastWriteTime = $fixedEntryTime
        $stream = $entry.Open()
        try {
            $bytes = [System.IO.File]::ReadAllBytes((Join-Path $packageRoot ($rel -replace "/", "\")))
            $stream.Write($bytes, 0, $bytes.Length)
        } finally {
            $stream.Dispose()
        }
    }
} finally {
    $zip.Dispose()
}

# 6. Sidecar hash.
$zipHash = Get-Sha256Hex $zipPath
$sidecarPath = Join-Path $distDir ($ZipName + ".sha256")
[System.IO.File]::WriteAllText($sidecarPath, "$zipHash  $ZipName`r`n", (New-Object System.Text.UTF8Encoding($false)))

Write-Output "PUBLIC_FILES=$($public.Count)"
Write-Output "ZIP_ENTRIES=$($public.Count + 1)"
Write-Output "ZIP_PATH=$zipPath"
Write-Output "ZIP_SHA256=$zipHash"
Write-Output "BUILD_RELEASE=PASS"
