[CmdletBinding()]
param(
    [switch]$AutoRecover,

    [switch]$NonInteractive,

    [ValidateRange(5, 60)]
    [int]$GracefulCloseSeconds = 8
)

$ErrorActionPreference = "Stop"
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$applyPath = Join-Path $packageRoot "Apply-Theme.ps1"

function Get-RunningCodexProcess {
    @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq "ChatGPT.exe" -and
        $_.ExecutablePath -like "*OpenAI.Codex_*" -and
        $_.CommandLine -notmatch "--type="
    })
}

function Wait-CodexExit {
    param(
        [Parameter(Mandatory)]
        [int]$WaitSeconds
    )

    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    do {
        if (@(Get-RunningCodexProcess).Count -eq 0) {
            return $true
        }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)

    return $false
}

function Start-CodexPackageApplication {
    param(
        [Parameter(Mandatory)]
        [string]$AppUserModelId,

        [string[]]$ArgumentList = @()
    )

    if (-not ("CodexSurfaceTheme.AppxActivator" -as [type])) {
        $activationSource = @'
using System;
using System.Runtime.InteropServices;

namespace CodexSurfaceTheme {
    [Flags]
    internal enum ActivateOptions : uint {
        None = 0
    }

    [ComImport]
    [Guid("2e941141-7f97-4756-ba1d-9decde894a3d")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IApplicationActivationManager {
        [PreserveSig]
        int ActivateApplication(
            [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            [MarshalAs(UnmanagedType.LPWStr)] string arguments,
            ActivateOptions options,
            out uint processId);
    }

    [ComImport]
    [Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
    internal class ApplicationActivationManager {
    }

    public static class AppxActivator {
        public static uint Activate(string appUserModelId, string arguments) {
            var manager = (IApplicationActivationManager)new ApplicationActivationManager();
            uint processId;
            int result = manager.ActivateApplication(
                appUserModelId,
                arguments,
                ActivateOptions.None,
                out processId);
            Marshal.ThrowExceptionForHR(result);
            return processId;
        }
    }
}
'@
        Add-Type -TypeDefinition $activationSource -ErrorAction Stop
    }

    $arguments = $ArgumentList -join " "
    $activatedPid = [CodexSurfaceTheme.AppxActivator]::Activate($AppUserModelId, $arguments)
    if ($activatedPid -eq 0) {
        throw "Windows did not return a process ID while activating $AppUserModelId."
    }

    return [int]$activatedPid
}

$running = @(Get-RunningCodexProcess)
if ($running.Count -gt 0) {
    $themed = @($running | Where-Object { $_.CommandLine -match "--remote-debugging-port=(\d+)" })
    if ($themed.Count -gt 0) {
        & $applyPath -WaitSeconds 5
        exit $LASTEXITCODE
    }

    Write-Warning "Codex is running without the local theme endpoint, usually after an app update or an official launch."
    Write-Output "THEME_RECOVERY_REQUIRED=1"
    if ($NonInteractive) {
        Write-Host "Fully exit Codex, then run LAUNCH-CODEX-THEMED.cmd again." -ForegroundColor Yellow
        exit 2
    }

    if ($AutoRecover) {
        Write-Host "Codex will restart automatically in 3 seconds to restore the theme." -ForegroundColor Cyan
        Write-Host "Close this command window now to cancel and keep active tasks running." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    } else {
        Write-Host "The recovery launcher can restart Codex and restore the theme." -ForegroundColor Cyan
        Write-Host "Save or finish active work before continuing." -ForegroundColor Yellow
        $restartAnswer = Read-Host "Restart Codex now? [y/N]"
        if ($restartAnswer -notmatch "^(?i:y|yes)$") {
            Write-Output "THEME_RECOVERY_CANCELLED=1"
            exit 2
        }
    }

    foreach ($candidate in $running) {
        try {
            $process = Get-Process -Id $candidate.ProcessId -ErrorAction Stop
            $null = $process.CloseMainWindow()
        } catch {
            # The main process may have already exited while the prompt was open.
        }
    }

    if (-not (Wait-CodexExit -WaitSeconds $GracefulCloseSeconds)) {
        Write-Warning "Codex is still running, most likely in the system tray."
        if (-not $AutoRecover) {
            $forceAnswer = Read-Host "Force-close Codex and continue? Active tasks may be interrupted. [y/N]"
            if ($forceAnswer -notmatch "^(?i:y|yes)$") {
                Write-Host "Exit Codex from the tray, then run this launcher again." -ForegroundColor Yellow
                Write-Output "THEME_RECOVERY_CANCELLED=1"
                exit 2
            }
        } else {
            Write-Host "Automatic recovery is force-closing the tray process now." -ForegroundColor Yellow
        }

        foreach ($candidate in @(Get-RunningCodexProcess)) {
            Stop-Process -Id $candidate.ProcessId -Force -ErrorAction SilentlyContinue
        }
        if (-not (Wait-CodexExit -WaitSeconds 10)) {
            throw "Codex did not exit, so the themed restart was cancelled."
        }
    }

    Write-Output "THEME_RECOVERY_RESTARTING=1"
    Start-Sleep -Milliseconds 500
}

$package = Get-AppxPackage -Name "OpenAI.Codex" -ErrorAction Stop |
    Sort-Object Version -Descending |
    Select-Object -First 1
if (-not $package.PackageFamilyName) {
    throw "The OpenAI.Codex package does not expose a package family name."
}
$appUserModelId = "$($package.PackageFamilyName)!App"

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$debugPort = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()

Write-Host "Starting Codex with the local theme endpoint..." -ForegroundColor Cyan
$codexArguments = @(
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=$debugPort"
)
$null = Start-CodexPackageApplication -AppUserModelId $appUserModelId -ArgumentList $codexArguments

& $applyPath -WaitSeconds 30
exit $LASTEXITCODE
