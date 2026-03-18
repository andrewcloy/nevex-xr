[CmdletBinding()]
param(
    [string]$Serial,
    [switch]$Clear,
    [switch]$Launch
)

. "$PSScriptRoot\common.ps1"
Initialize-NevexAndroidEnvironment

$resolvedSerial = Resolve-NevexDeviceSerial -Serial $Serial
$adbArgs = Get-NevexAdbArgs -Serial $resolvedSerial
$packageName = Get-NevexPackageName
$mainActivity = Get-NevexMainActivity
$targetInfo = Get-NevexConnectedTargetInfo -Serial $resolvedSerial
Show-NevexTargetSummary -TargetInfo $targetInfo -WarnIfNotXr

if ($Clear) {
    & $script:NevexAdb @adbArgs logcat -c
}

if ($Launch) {
    & $script:NevexAdb @adbArgs shell am start -n $mainActivity | Out-Host
    Start-Sleep -Seconds 2
}

$processId = (& $script:NevexAdb @adbArgs shell pidof -s $packageName).Trim()

if ($processId) {
    Write-Host "Streaming logcat for $packageName on device $resolvedSerial (pid $processId)"
    & $script:NevexAdb @adbArgs logcat "--pid=$processId"
    exit $LASTEXITCODE
}

Write-Host "App PID not found yet. Falling back to tagged startup logs."
& $script:NevexAdb @adbArgs logcat NevexXrStream:V NevexXrUi:V AndroidRuntime:E ActivityManager:I *:S
exit $LASTEXITCODE
