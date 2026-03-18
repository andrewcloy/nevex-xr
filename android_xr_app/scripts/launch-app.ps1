[CmdletBinding()]
param(
    [string]$Serial,
    [switch]$StopFirst,
    [switch]$AutoConnect,
    [string]$JetsonHost,
    [string]$PresenterMode
)

. "$PSScriptRoot\common.ps1"
Initialize-NevexAndroidEnvironment

$resolvedSerial = Resolve-NevexDeviceSerial -Serial $Serial
$adbArgs = Get-NevexAdbArgs -Serial $resolvedSerial
$packageName = Get-NevexPackageName
$mainActivity = Get-NevexMainActivity
$targetInfo = Get-NevexConnectedTargetInfo -Serial $resolvedSerial
Show-NevexTargetSummary -TargetInfo $targetInfo -WarnIfNotXr

if ($StopFirst) {
    & $script:NevexAdb @adbArgs shell am force-stop $packageName | Out-Null
}

$startArgs = @("shell", "am", "start", "-n", $mainActivity)
if ($AutoConnect) {
    $startArgs += @("--ez", "nevex.auto_connect", "true")
}
if ($JetsonHost) {
    $startArgs += @("--es", "nevex.jetson_host", $JetsonHost)
}
if ($PresenterMode) {
    $startArgs += @("--es", "nevex.presenter_mode", $PresenterMode)
}

& $script:NevexAdb @adbArgs @startArgs
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Launched $mainActivity on device $resolvedSerial"
if ($AutoConnect -or $JetsonHost -or $PresenterMode) {
    $launchSummary = @()
    if ($AutoConnect) {
        $launchSummary += "auto-connect"
    }
    if ($JetsonHost) {
        $launchSummary += "host=$JetsonHost"
    }
    if ($PresenterMode) {
        $launchSummary += "mode=$PresenterMode"
    }
    Write-Host ("Launch extras: " + ($launchSummary -join ", "))
}
