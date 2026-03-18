[CmdletBinding()]
param(
    [string]$Serial,
    [string]$JetsonHost = "192.168.1.56",
    [int]$DurationSeconds = 35,
    [string[]]$Modes = @("normal", "clear", "pattern", "post-only"),
    [switch]$RequirePhysical
)

. "$PSScriptRoot\common.ps1"
Initialize-NevexAndroidEnvironment

$resolvedSerial = Resolve-NevexDeviceSerial -Serial $Serial
$adbArgs = Get-NevexAdbArgs -Serial $resolvedSerial
$packageName = Get-NevexPackageName
$mainActivity = Get-NevexMainActivity
$targetInfo = Get-NevexConnectedTargetInfo -Serial $resolvedSerial
$targetKindLabel = Get-NevexTargetKindLabel -TargetInfo $targetInfo
Show-NevexTargetSummary -TargetInfo $targetInfo -WarnIfNotXr
if ($RequirePhysical) {
    Assert-NevexPhysicalTarget -TargetInfo $targetInfo -Context "compare-presenter-modes.ps1"
}

Write-Host ""
Write-Host "Presenter comparison target metadata"
Write-Host " Serial: $($targetInfo.Serial)"
Write-Host " Kind: $targetKindLabel"
if (-not [string]::IsNullOrWhiteSpace($targetInfo.DisplayName)) {
    Write-Host " Name: $($targetInfo.DisplayName)"
}
if (-not [string]::IsNullOrWhiteSpace($targetInfo.DeviceName)) {
    Write-Host " Device: $($targetInfo.DeviceName)"
}
Write-Host " XR classified: $($targetInfo.IsXr)"

function Convert-NevexMetricValue {
    param(
        [string]$RawValue
    )

    if ([string]::IsNullOrWhiteSpace($RawValue) -or $RawValue -eq "--") {
        return $null
    }

    return [double]$RawValue
}

function Get-NevexLatestMatchingLine {
    param(
        [string[]]$Lines,
        [string]$Pattern
    )

    $matches = @($Lines | Where-Object { $_ -match $Pattern })
    if ($matches.Count -eq 0) {
        return $null
    }

    return $matches[-1]
}

function Get-NevexPairMetric {
    param(
        [string]$Line,
        [string]$Label
    )

    if ($null -eq $Line -or $Line -notmatch "$Label=([^ ]+)") {
        return $null
    }

    $parts = $matches[1] -split "/"
    if ($parts.Count -lt 2) {
        return $null
    }

    return [pscustomobject]@{
        First  = Convert-NevexMetricValue -RawValue $parts[0]
        Second = Convert-NevexMetricValue -RawValue $parts[1]
    }
}

function Get-NevexTripleMetric {
    param(
        [string]$Line,
        [string]$Label
    )

    if ($null -eq $Line -or $Line -notmatch "$Label=([^ ]+)") {
        return $null
    }

    $parts = $matches[1] -split "/"
    if ($parts.Count -lt 3) {
        return $null
    }

    return [pscustomobject]@{
        First   = Convert-NevexMetricValue -RawValue $parts[0]
        Average = Convert-NevexMetricValue -RawValue $parts[1]
        Third   = Convert-NevexMetricValue -RawValue $parts[2]
    }
}

function Get-NevexIntegerMetric {
    param(
        [string]$Line,
        [string]$Label
    )

    if ($null -eq $Line -or $Line -notmatch "$Label=(\d+)") {
        return $null
    }

    return [int64]$matches[1]
}

function Get-NevexDominantStage {
    param(
        [string]$Line
    )

    $stageAverages = @{}
    foreach ($stage in @("q", "lock", "draw", "post", "cb")) {
        if ($Line -match "${stage}:([^, ]+)") {
            $parts = $matches[1] -split "/"
            if ($parts.Count -ge 2) {
                $averageValue = Convert-NevexMetricValue -RawValue $parts[1]
                if ($null -ne $averageValue) {
                    $stageAverages[$stage] = $averageValue
                }
            }
        }
    }

    if ($stageAverages.Count -eq 0) {
        return "--"
    }

    $dominantStage = $stageAverages.GetEnumerator() |
        Sort-Object -Property Value -Descending |
        Select-Object -First 1
    return "{0} ({1:N2} ms avg)" -f $dominantStage.Key, $dominantStage.Value
}

function ConvertTo-NevexEyeSummary {
    param(
        [string]$Line
    )

    $fpsPair = Get-NevexPairMetric -Line $Line -Label "fps"
    $frameReadyToLockTriple = Get-NevexTripleMetric -Line $Line -Label "frameReadyToLockMs"
    $presentLatency = Get-NevexTripleMetric -Line $Line -Label "presenterToPresentMs"
    $jitterTriple = Get-NevexTripleMetric -Line $Line -Label "intervalMs"

    return [pscustomobject]@{
        PresentFps         = if ($null -ne $fpsPair) { $fpsPair.Second } else { $null }
        FrameReadyToLockMs = if ($null -ne $frameReadyToLockTriple) { $frameReadyToLockTriple.Average } else { $null }
        AvgPresentMs       = if ($null -ne $presentLatency) { $presentLatency.Average } else { $null }
        JitterMs           = if ($null -ne $jitterTriple) { $jitterTriple.Third } else { $null }
        ReadyCount       = Get-NevexIntegerMetric -Line $Line -Label "ready"
        SupersededCount  = Get-NevexIntegerMetric -Line $Line -Label "superseded"
        DominantStage    = Get-NevexDominantStage -Line $Line
    }
}

function ConvertTo-NevexPairSummary {
    param(
        [string]$Line
    )

    $presentSkew = Get-NevexTripleMetric -Line $Line -Label "presentSkewMs"
    return [pscustomobject]@{
        PresentSkewAvgMs = if ($null -ne $presentSkew) { $presentSkew.Average } else { $null }
    }
}

$results = @()

foreach ($mode in $Modes) {
    Write-Host ""
    Write-Host "Running presenter experiment mode '$mode' on $resolvedSerial ($targetKindLabel) for $DurationSeconds seconds..."

    & $script:NevexAdb @adbArgs logcat -c | Out-Null
    & $script:NevexAdb @adbArgs shell am force-stop $packageName | Out-Null
    & $script:NevexAdb @adbArgs shell am start `
        -n $mainActivity `
        --ez nevex.auto_connect true `
        --es nevex.jetson_host $JetsonHost `
        --es nevex.presenter_mode $mode | Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw "Failed to launch $mainActivity with presenter mode '$mode'."
    }

    Start-Sleep -Seconds $DurationSeconds

    $logs = & $script:NevexAdb @adbArgs logcat -d -v time NevexXrStream:I NevexXrUi:I *:S
    $escapedMode = [regex]::Escape($mode)
    $leftLine = Get-NevexLatestMatchingLine -Lines $logs -Pattern "XR present mode=$escapedMode left:"
    $rightLine = Get-NevexLatestMatchingLine -Lines $logs -Pattern "XR present mode=$escapedMode right:"
    $pairLine = Get-NevexLatestMatchingLine -Lines $logs -Pattern "XR stereo pair mode=${escapedMode}:"

    if (-not $leftLine -or -not $rightLine -or -not $pairLine) {
        Write-Warning "Could not find complete presenter summary lines for mode '$mode'."
        continue
    }

    $leftSummary = ConvertTo-NevexEyeSummary -Line $leftLine
    $rightSummary = ConvertTo-NevexEyeSummary -Line $rightLine
    $pairSummary = ConvertTo-NevexPairSummary -Line $pairLine

    $results += [pscustomobject]@{
        TargetSerial         = $targetInfo.Serial
        TargetKind           = $targetKindLabel
        TargetName           = $targetInfo.DisplayName
        TargetDevice         = $targetInfo.DeviceName
        TargetIsEmulator     = $targetInfo.IsEmulator
        TargetIsXr           = $targetInfo.IsXr
        Mode                = $mode
        LeftPresentMs       = $leftSummary.AvgPresentMs
        RightPresentMs      = $rightSummary.AvgPresentMs
        LeftPresentFps      = $leftSummary.PresentFps
        RightPresentFps     = $rightSummary.PresentFps
        LeftJitterMs        = $leftSummary.JitterMs
        RightJitterMs       = $rightSummary.JitterMs
        LeftFrameReadyToLockMs  = $leftSummary.FrameReadyToLockMs
        RightFrameReadyToLockMs = $rightSummary.FrameReadyToLockMs
        LeftReady           = $leftSummary.ReadyCount
        RightReady          = $rightSummary.ReadyCount
        LeftSuperseded      = $leftSummary.SupersededCount
        RightSuperseded     = $rightSummary.SupersededCount
        PresentSkewAvgMs    = $pairSummary.PresentSkewAvgMs
        LeftDominantStage   = $leftSummary.DominantStage
        RightDominantStage  = $rightSummary.DominantStage
    }
}

if ($results.Count -eq 0) {
    throw "No presenter-mode summaries were collected."
}

Write-Host ""
Write-Host "Presenter mode comparison summary"
$results | Format-Table -AutoSize

Write-Host ""
Write-Host "Presenter mode comparison JSON"
$results | ConvertTo-Json -Depth 4
