[CmdletBinding()]
param(
    [string]$JetsonHost = "192.168.1.56",
    [int]$Port = 8090,
    [string]$Serial,
    [switch]$SkipDeviceCheck
)

. "$PSScriptRoot\common.ps1"
Initialize-NevexAndroidEnvironment

$endpointUrl = "ws://$JetsonHost`:$Port/jetson/messages"

Write-Host "Checking Jetson endpoint from Windows host: $endpointUrl"
$hostResult = Test-NetConnection -ComputerName $JetsonHost -Port $Port -WarningAction SilentlyContinue

if ($hostResult.TcpTestSucceeded) {
    Write-Host "Host TCP check: PASS"
} else {
    Write-Warning "Host TCP check failed. The Jetson sender is not reachable from Windows at $JetsonHost`:$Port."
}

if ($SkipDeviceCheck) {
    return
}

try {
    $resolvedSerial = Resolve-NevexDeviceSerial -Serial $Serial
} catch {
    Write-Warning $_
    return
}

$adbArgs = Get-NevexAdbArgs -Serial $resolvedSerial

Write-Host ""
Write-Host "Checking Jetson reachability from device $resolvedSerial"

$pingOutput = & $script:NevexAdb @adbArgs shell ping -c 1 $JetsonHost 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Device ping check: PASS"
} else {
    Write-Warning "Device ping check failed or ping is unavailable."
    $pingOutput | Out-Host
}

$tcpProbeCommand = "netcat -w 3 $JetsonHost $Port < /dev/null > /dev/null 2>&1"
$null = & $script:NevexAdb @adbArgs shell sh -c $tcpProbeCommand
$tcpExitCode = $LASTEXITCODE

if ($tcpExitCode -eq 0) {
    Write-Host "Device TCP check: PASS"
} else {
    Write-Warning "Device TCP check is inconclusive or failed on this target for $JetsonHost`:$Port. Treat app logcat as the source of truth for real WebSocket reachability."
    Write-Host "adb shell netcat exit code: $tcpExitCode"
}
