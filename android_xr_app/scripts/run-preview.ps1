[CmdletBinding()]
param(
    [string]$Serial,
    [string]$JetsonHost = "192.168.1.56",
    [int]$WaitSeconds = 8
)

. "$PSScriptRoot\common.ps1"
Initialize-NevexAndroidEnvironment -RequireJava -RequireGradleWrapper

$resolvedSerial = Resolve-NevexDeviceSerial -Serial $Serial
$targetInfo = Get-NevexConnectedTargetInfo -Serial $resolvedSerial
Show-NevexTargetSummary -TargetInfo $targetInfo -WarnIfNotXr

Push-Location $script:NevexAndroidAppRoot
try {
    $previousAndroidSerial = $env:ANDROID_SERIAL
    $env:ANDROID_SERIAL = $resolvedSerial

    $gradleArgs = @(
        "-Pandroid.injected.device.serial=$resolvedSerial",
        "installDebug"
    )

    try {
        & $script:NevexGradleWrapper @gradleArgs
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    } finally {
        if ($null -eq $previousAndroidSerial) {
            Remove-Item Env:ANDROID_SERIAL -ErrorAction SilentlyContinue
        } else {
            $env:ANDROID_SERIAL = $previousAndroidSerial
        }
    }
} finally {
    Pop-Location
}

& "$PSScriptRoot\launch-app.ps1" `
    -Serial $resolvedSerial `
    -StopFirst `
    -AutoConnect `
    -JetsonHost $JetsonHost `
    -PreviewBootMode
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Waiting $WaitSeconds seconds for preview startup..."
Start-Sleep -Seconds $WaitSeconds

Write-Host ""
Write-Host "Preview workflow ready on $resolvedSerial"
Write-Host "Jetson host: $JetsonHost"
Write-Host "Launch extras: auto-connect, preview-boot"
