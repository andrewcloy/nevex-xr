[CmdletBinding()]
param(
    [switch]$FailIfMissing
)

. "$PSScriptRoot\common.ps1"
Initialize-NevexAndroidEnvironment -RequireEmulator

$studioInfo = Get-NevexAndroidStudioInfo
$sdkManagerAvailable = -not [string]::IsNullOrWhiteSpace($script:NevexSdkManager)
$emulatorRevision = Get-NevexEmulatorRevision
$installedSystemImages = @(Get-NevexInstalledSystemImages)
$xrSystemImages = @($installedSystemImages | Where-Object { $_.IsXr })
$availableAvds = @(Get-NevexAvailableAvdMetadata | Where-Object { $null -ne $_ })
$xrAvds = @($availableAvds | Where-Object { $_.IsXr })
$emulatorRevisionText = if ([string]::IsNullOrWhiteSpace($emulatorRevision)) { "unknown" } else { $emulatorRevision }
$blockers = @()

Write-Host "NEVEX XR Android tooling summary"
if ($null -ne $studioInfo) {
    Write-Host "Android Studio build: $($studioInfo.Version)"
    Write-Host "Android Studio root: $($studioInfo.StudioRoot)"
    Write-Host "Android Studio product info: $($studioInfo.ProductInfoPath)"
} else {
    Write-Warning "Android Studio product-info.json could not be found from the detected install roots."
}
Write-Host "SDK root: $env:ANDROID_SDK_ROOT"
Write-Host "Android Emulator revision: $emulatorRevisionText"
Write-Host "sdkmanager available: $sdkManagerAvailable"
Write-Host "Android Studio requirement: latest Canary build with XR tools"
Write-Host ""

Write-Host "Installed system images:"
if ($installedSystemImages.Count -eq 0) {
    Write-Warning "No Android system images were found under $env:ANDROID_SDK_ROOT\system-images."
} else {
    $installedSystemImages | ForEach-Object {
        $targetLabel = if ($_.IsXr) { "XR" } else { "Standard" }
        Write-Host " - [$targetLabel] $($_.PackagePath)"
    }
}

Write-Host ""
Write-Host "Configured AVDs:"
if ($availableAvds.Count -eq 0) {
    Write-Warning "No Android Virtual Devices are configured."
} else {
    $availableAvds | ForEach-Object {
        $targetLabel = if ($_.IsXr) { "XR" } else { "Standard" }
        Write-Host " - [$targetLabel] $($_.AvdName)"
        if ($_.SystemImagePath) {
            Write-Host "   $($_.SystemImagePath)"
        }
    }
}

Write-Host ""
if (-not $sdkManagerAvailable) {
    $blockers += "cmdline-tools/latest is missing"
    Write-Warning "cmdline-tools/latest is not installed. Use Android Studio SDK Manager to install XR packages, or install Command-line Tools."
}

if ($xrSystemImages.Count -eq 0) {
    $blockers += "no XR system image is installed"
    Write-Warning "No XR system image is installed. Install an Android XR emulator image before treating emulator validation as XR truth."
}

if ($xrAvds.Count -eq 0) {
    $blockers += "no XR AVD is configured"
    Write-Warning "No XR AVD is configured. Create one in Android Studio Device Manager using the XR form factor."
}

Write-Host ""
Write-Host "Remaining XR blockers on this machine:"
if ($blockers.Count -eq 0) {
    Write-Host " - none detected by the local tooling checks"
} else {
    $blockers | ForEach-Object { Write-Host " - $_" }
}

Write-Host ""
Write-Host "Next actions:"
Write-Host " 1. Open Android Studio Canary."
Write-Host " 2. SDK Manager -> SDK Tools -> install Android Emulator, Platform-Tools, Build-Tools, Layout Inspector for API 31 - 36."
Write-Host " 3. Device Manager -> Create Virtual Device -> XR -> choose headset or XR glasses -> pick the Android 14 XR image named Google Play XR Intel x86_64 Atom System Image (Developer Preview), if that is the installed XR image shown."
Write-Host " 4. Run .\\scripts\\inspect-xr-tooling.ps1 again until at least one XR system image and XR AVD are reported."
Write-Host ' 5. Start the XR AVD with .\scripts\start-emulator.ps1 -AvdName "<xr-avd-name>" -RequireXr -WaitForBoot.'
Write-Host ' 6. Run .\scripts\run-live-view.ps1 -StartEmulator -AvdName "<xr-avd-name>" -RequireXr.'

if ($FailIfMissing -and (
        -not $sdkManagerAvailable -or
        $xrSystemImages.Count -eq 0 -or
        $xrAvds.Count -eq 0
    )
) {
    exit 1
}
