[CmdletBinding()]
param(
    [string]$Serial,
    [string]$JetsonHost = "192.168.1.56",
    [int]$DurationSeconds = 30
)

. "$PSScriptRoot\common.ps1"
Initialize-NevexAndroidEnvironment

$connectedTargets = @(Get-NevexConnectedTargetInfos)
if ($connectedTargets.Count -eq 0) {
    throw "No adb targets are connected. Connect the Samsung XR headset and confirm it appears in 'adb devices -l' first."
}

Write-Host "Connected adb targets"
$connectedTargets |
    Select-Object `
        @{ Name = "Serial"; Expression = { $_.Serial } }, `
        @{ Name = "Kind"; Expression = { Get-NevexTargetKindLabel -TargetInfo $_ } }, `
        @{ Name = "XR"; Expression = { $_.IsXr } }, `
        @{ Name = "Name"; Expression = { $_.DisplayName } }, `
        @{ Name = "Device"; Expression = { $_.DeviceName } } |
    Format-Table -AutoSize

$physicalTargets = @($connectedTargets | Where-Object { -not $_.IsEmulator })
if ($physicalTargets.Count -eq 0) {
    $placeholderSerial = "<headset-serial>"
    Write-Warning "Only emulator targets are currently connected. Headset presenter validation remains hardware-blocked."
    Write-Host ""
    Write-Host "Paste this once the Samsung XR headset appears in adb:"
    Write-Host ".\scripts\compare-presenter-modes.ps1 -Serial `"$placeholderSerial`" -RequirePhysical -JetsonHost $JetsonHost -DurationSeconds $DurationSeconds"
    throw "No physical adb targets are currently connected."
}

$selectedTarget = if ($Serial) {
    $connectedTargets | Where-Object { $_.Serial -eq $Serial } | Select-Object -First 1
} elseif ($physicalTargets.Count -eq 1) {
    $physicalTargets[0]
} else {
    $xrPhysicalTargets = @($physicalTargets | Where-Object { $_.IsXr })
    if ($xrPhysicalTargets.Count -eq 1) {
        $xrPhysicalTargets[0]
    } else {
        $null
    }
}

if ($null -eq $selectedTarget) {
    $availablePhysicalSerials = @($physicalTargets | ForEach-Object { $_.Serial })
    throw "Multiple physical adb targets are connected. Re-run with -Serial using one of: $($availablePhysicalSerials -join ', ')"
}

Assert-NevexPhysicalTarget -TargetInfo $selectedTarget -Context "headset-presenter-preflight.ps1"
Write-Host ""
Write-Host "Selected headset-validation target"
Show-NevexTargetSummary -TargetInfo $selectedTarget
if (-not $selectedTarget.IsXr) {
    Write-Warning "The selected physical device is not XR-classified. Reconfirm that the Samsung XR headset is the chosen adb target."
}

Write-Host ""
Write-Host "Exact next commands"
Write-Host ".\scripts\install-debug.ps1 -Serial `"$($selectedTarget.Serial)`" -Build"
Write-Host ".\scripts\launch-app.ps1 -Serial `"$($selectedTarget.Serial)`" -StopFirst -AutoConnect -JetsonHost $JetsonHost -PresenterMode normal"
Write-Host ".\scripts\compare-presenter-modes.ps1 -Serial `"$($selectedTarget.Serial)`" -RequirePhysical -JetsonHost $JetsonHost -DurationSeconds $DurationSeconds"
