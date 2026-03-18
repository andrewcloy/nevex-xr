[CmdletBinding()]
param(
    [string]$Serial,
    [string]$AvdName,
    [switch]$StartEmulator,
    [switch]$RequireXr,
    [switch]$SkipBuild,
    [switch]$WatchLogcat
)

. "$PSScriptRoot\common.ps1"
Initialize-NevexAndroidEnvironment -RequireEmulator:$StartEmulator

if ($StartEmulator) {
    & "$PSScriptRoot\start-emulator.ps1" -AvdName $AvdName -WaitForBoot -RequireXr:$RequireXr
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

$resolvedSerial = Resolve-NevexDeviceSerial -Serial $Serial
$targetInfo = Get-NevexConnectedTargetInfo -Serial $resolvedSerial
Show-NevexTargetSummary -TargetInfo $targetInfo -WarnIfNotXr

if ($RequireXr) {
    Assert-NevexXrTarget -TargetInfo $targetInfo -Context "run-live-view.ps1"
}

if (-not $SkipBuild) {
    & "$PSScriptRoot\build-debug.ps1"
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

& "$PSScriptRoot\install-debug.ps1" -Serial $resolvedSerial
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

& "$PSScriptRoot\launch-app.ps1" -Serial $resolvedSerial -StopFirst
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if ($WatchLogcat) {
    & "$PSScriptRoot\logcat-nevex.ps1" -Serial $resolvedSerial -Clear
    exit $LASTEXITCODE
}
