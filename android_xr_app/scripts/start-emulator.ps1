[CmdletBinding()]
param(
    [string]$AvdName,
    [switch]$ListOnly,
    [switch]$WaitForBoot,
    [switch]$RequireXr
)

. "$PSScriptRoot\common.ps1"
Initialize-NevexAndroidEnvironment -RequireEmulator

$availableAvds = @(Get-NevexAvailableAvdMetadata | Where-Object { $null -ne $_ })

if ($availableAvds.Count -eq 0) {
    throw "No Android Virtual Devices are configured on this machine."
}

if ($ListOnly) {
    Write-Host "Configured AVDs:"
    $availableAvds | ForEach-Object {
        $targetLabel = if ($_.IsXr) { "XR" } else { "Standard" }
        Write-Host " - $($_.AvdName) [$targetLabel]"
        if ($_.SystemImagePath) {
            Write-Host "   $($_.SystemImagePath)"
        }
    }
    return
}

if (-not $AvdName) {
    if ($availableAvds.Count -eq 1) {
        $AvdName = $availableAvds[0].AvdName
    } else {
        throw "Multiple AVDs are configured. Pass -AvdName with one of: $($availableAvds.AvdName -join ', ')"
    }
}

    $selectedAvd = $availableAvds | Where-Object { $_.AvdName -eq $AvdName } | Select-Object -First 1
    if ($null -eq $selectedAvd) {
        throw "AVD '$AvdName' is not configured. Available AVDs: $($availableAvds.AvdName -join ', ')"
    }

    if ($RequireXr -and -not $selectedAvd.IsXr) {
        throw "AVD '$AvdName' is not classified as Android XR. Pick an XR AVD or omit -RequireXr."
    }

    if (-not $selectedAvd.IsXr) {
        Write-Warning "AVD '$AvdName' is a standard emulator. XR-only features like Full Space and spatial panels will not be fully validated."
    }

Write-Host "Launching emulator AVD '$AvdName'..."
Start-Process -FilePath $script:NevexEmulator -ArgumentList @("-avd", $AvdName)

if (-not $WaitForBoot) {
    return
}

Write-Host "Waiting for emulator boot..."
& $script:NevexAdb wait-for-device | Out-Null
do {
    Start-Sleep -Seconds 2
    $bootState = (& $script:NevexAdb shell getprop sys.boot_completed).Trim()
} until ($bootState -eq "1")

Write-Host "Emulator boot completed."
$targetInfo = Get-NevexConnectedTargetInfo
Show-NevexTargetSummary -TargetInfo $targetInfo -WarnIfNotXr
