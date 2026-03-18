[CmdletBinding()]
param(
    [switch]$Clean,
    [switch]$Info
)

. "$PSScriptRoot\common.ps1"
Initialize-NevexAndroidEnvironment -RequireJava -RequireGradleWrapper

Push-Location $script:NevexAndroidAppRoot
try {
    $gradleArgs = @()
    if ($Clean) {
        $gradleArgs += "clean"
    }
    $gradleArgs += "assembleDebug"
    if ($Info) {
        $gradleArgs += "--info"
    }

    & $script:NevexGradleWrapper @gradleArgs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Write-Host ""
    Write-Host "Debug APK ready:"
    Write-Host $script:NevexDebugApk
} finally {
    Pop-Location
}
