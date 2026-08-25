[CmdletBinding()]
param()

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
    Write-Host "The theme launcher did not close or restart Codex, so active tasks remain untouched." -ForegroundColor Yellow
    Write-Host "Finish active work, fully exit Codex from the tray, then run LAUNCH-CODEX-THEMED.cmd again." -ForegroundColor Yellow
    exit 2
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
