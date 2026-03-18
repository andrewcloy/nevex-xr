[CmdletBinding()]
param(
    [string]$Serial,
    [switch]$Build
)

. "$PSScriptRoot\common.ps1"
Initialize-NevexAndroidEnvironment

if ($Build) {
    & "$PSScriptRoot\build-debug.ps1"
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

if (-not (Test-Path $script:NevexDebugApk)) {
    throw "Debug APK not found at '$script:NevexDebugApk'. Run build-debug.ps1 first."
}

$resolvedSerial = Resolve-NevexDeviceSerial -Serial $Serial
$adbArgs = Get-NevexAdbArgs -Serial $resolvedSerial
$targetInfo = Get-NevexConnectedTargetInfo -Serial $resolvedSerial
Show-NevexTargetSummary -TargetInfo $targetInfo -WarnIfNotXr

& $script:NevexAdb @adbArgs install -r $script:NevexDebugApk
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Installed $($script:NevexDebugApk) on device $resolvedSerial"
