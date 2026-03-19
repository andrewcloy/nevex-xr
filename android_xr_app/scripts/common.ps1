Set-StrictMode -Version Latest

function Get-NevexAndroidAppRoot {
    return (Split-Path -Parent $PSScriptRoot)
}

function Get-NevexPackageName {
    return "com.nevex.xr.nativeapp"
}

function Get-NevexMainActivity {
    return "com.nevex.xr.nativeapp/.SplashActivity"
}

function Get-NevexAndroidStudioInstallRoot {
    $runningStudioProcess = Get-CimInstance Win32_Process -Filter "name='studio64.exe'" -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($runningStudioProcess -and -not [string]::IsNullOrWhiteSpace($runningStudioProcess.ExecutablePath)) {
        $studioBinPath = Split-Path -Parent $runningStudioProcess.ExecutablePath
        $studioRoot = Split-Path -Parent $studioBinPath
        if (Test-Path $studioRoot) {
            return $studioRoot
        }
    }

    $candidateRoots = @(
        "C:\Program Files\Android",
        "C:\Program Files\Android\Android Studio",
        "$env:LOCALAPPDATA\Programs"
    )

    foreach ($candidateRoot in $candidateRoots) {
        if (-not (Test-Path $candidateRoot)) {
            continue
        }

        if (Test-Path (Join-Path $candidateRoot "product-info.json")) {
            return $candidateRoot
        }

        $studioDirectories = @(
            Get-ChildItem -Path $candidateRoot -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like "Android Studio*" }
        )

        foreach ($directory in $studioDirectories) {
            if (
                (Test-Path (Join-Path $directory.FullName "product-info.json")) -or
                (Test-Path (Join-Path $directory.FullName "bin\studio64.exe"))
            ) {
                return $directory.FullName
            }
        }
    }

    return $null
}

function Initialize-NevexAndroidEnvironment {
    param(
        [switch]$RequireJava,
        [switch]$RequireGradleWrapper,
        [switch]$RequireEmulator
    )

    $appRoot = Get-NevexAndroidAppRoot
    $studioRoot = Get-NevexAndroidStudioInstallRoot
    $studioJbr = if ($null -ne $studioRoot) { Join-Path $studioRoot "jbr" } else { $null }
    $defaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"

    if ($RequireJava) {
        if (
            -not $env:JAVA_HOME -or
            -not (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))
        ) {
            if ($studioJbr -and (Test-Path (Join-Path $studioJbr "bin\java.exe"))) {
                $env:JAVA_HOME = $studioJbr
            } else {
                throw "JAVA_HOME is not set and Android Studio's bundled JBR was not found."
            }
        }
    }

    if (-not $env:ANDROID_SDK_ROOT -or -not (Test-Path $env:ANDROID_SDK_ROOT)) {
        if (Test-Path $defaultSdk) {
            $env:ANDROID_SDK_ROOT = $defaultSdk
        } else {
            throw "ANDROID_SDK_ROOT is not set and the default SDK path was not found."
        }
    }

    $script:NevexAndroidAppRoot = $appRoot
    $script:NevexGradleWrapper = Join-Path $appRoot "gradlew.bat"
    $script:NevexAdb = Join-Path $env:ANDROID_SDK_ROOT "platform-tools\adb.exe"
    $script:NevexEmulator = Join-Path $env:ANDROID_SDK_ROOT "emulator\emulator.exe"
    $script:NevexSdkManager = Get-NevexSdkManagerPath
    $script:NevexDebugApk = Join-Path $appRoot "app\build\outputs\apk\debug\app-debug.apk"

    $requiredPaths = @($script:NevexAdb)
    if ($RequireGradleWrapper) {
        $requiredPaths += $script:NevexGradleWrapper
    }
    if ($RequireEmulator) {
        $requiredPaths += $script:NevexEmulator
    }

    foreach ($requiredPath in $requiredPaths) {
        if (-not (Test-Path $requiredPath)) {
            throw "Required Android tool was not found: $requiredPath"
        }
    }
}

function Get-NevexConnectedDeviceSerials {
    $adbOutput = & $script:NevexAdb devices
    return @(
        $adbOutput |
            Where-Object { $_ -match "^\S+\s+device$" } |
            ForEach-Object { ($_ -split "\s+")[0] }
    )
}

function Get-NevexConnectedTargetInfos {
    $serials = @(Get-NevexConnectedDeviceSerials)
    return @(
        $serials | ForEach-Object {
            Get-NevexConnectedTargetInfo -Serial $_
        }
    )
}

function Resolve-NevexDeviceSerial {
    param(
        [string]$Serial
    )

    $devices = @(Get-NevexConnectedDeviceSerials)

    if ($Serial) {
        if ($devices -contains $Serial) {
            return $Serial
        }
        throw "Device '$Serial' is not connected. Connected devices: $($devices -join ', ')"
    }

    if ($devices.Count -eq 1) {
        return $devices[0]
    }

    if ($devices.Count -eq 0) {
        throw "No Android device or emulator is connected. Start an emulator or connect the headset first."
    }

    throw "Multiple Android devices are connected. Pass -Serial with one of: $($devices -join ', ')"
}

function Get-NevexAdbArgs {
    param(
        [string]$Serial
    )

    if ($Serial) {
        return @("-s", $Serial)
    }

    return @()
}

function Get-NevexSdkManagerPath {
    $sdkManagerPath = Join-Path $env:ANDROID_SDK_ROOT "cmdline-tools\latest\bin\sdkmanager.bat"
    if (Test-Path $sdkManagerPath) {
        return $sdkManagerPath
    }

    return $null
}

function Get-NevexAndroidStudioInfo {
    $studioRoot = Get-NevexAndroidStudioInstallRoot
    if ($null -eq $studioRoot) {
        return $null
    }

    $productInfoPath = Join-Path $studioRoot "product-info.json"
    if (-not (Test-Path $productInfoPath)) {
        return $null
    }

    $productInfo = Get-Content -LiteralPath $productInfoPath -Raw | ConvertFrom-Json
    return [pscustomobject]@{
        StudioRoot      = $studioRoot
        ProductInfoPath = $productInfoPath
        Name            = $productInfo.name
        Version         = $productInfo.version
        BuildNumber     = $productInfo.buildNumber
        ProductCode     = $productInfo.productCode
    }
}

function Get-NevexIniProperties {
    param(
        [string]$Path
    )

    $properties = @{}
    if (-not (Test-Path $Path)) {
        return $properties
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match "^\s*([^=]+)=(.*)$") {
            $properties[$matches[1].Trim()] = $matches[2].Trim()
        }
    }

    return $properties
}

function Get-NevexPackageMetadata {
    param(
        [string]$PackageXmlPath
    )

    if (-not (Test-Path $PackageXmlPath)) {
        return $null
    }

    $rawContent = Get-Content -LiteralPath $PackageXmlPath -Raw
    $packagePath = [regex]::Match($rawContent, 'localPackage path="([^"]+)"').Groups[1].Value
    $displayName = [regex]::Match($rawContent, '<display-name>([^<]+)</display-name>').Groups[1].Value
    $revisionMatch = [regex]::Match(
        $rawContent,
        '<revision>\s*<major>(\d+)</major>(?:\s*<minor>(\d+)</minor>)?(?:\s*<micro>(\d+)</micro>)?'
    )

    $revisionParts = @()
    foreach ($groupIndex in 1..3) {
        $revisionPart = $revisionMatch.Groups[$groupIndex].Value
        if (-not [string]::IsNullOrWhiteSpace($revisionPart)) {
            $revisionParts += $revisionPart
        }
    }

    return [pscustomobject]@{
        PackagePath   = $packagePath
        DisplayName   = $displayName
        Revision      = $revisionParts -join "."
        PackageXmlPath = $PackageXmlPath
    }
}

function Test-NevexValueLooksXr {
    param(
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $false
    }

    return $Value -match '(?i)(^|[^a-z0-9])(xr|headset|glasses|android[-_ ]xr)([^a-z0-9]|$)'
}

function Get-NevexInstalledSystemImages {
    $systemImagesRoot = Join-Path $env:ANDROID_SDK_ROOT "system-images"
    if (-not (Test-Path $systemImagesRoot)) {
        return @()
    }

    return @(
        Get-ChildItem -Path $systemImagesRoot -Filter "package.xml" -Recurse -File |
            ForEach-Object {
                $packageMetadata = Get-NevexPackageMetadata -PackageXmlPath $_.FullName
                if ($null -eq $packageMetadata) {
                    return
                }

                $summaryText = @(
                    $packageMetadata.PackagePath,
                    $packageMetadata.DisplayName,
                    $packageMetadata.PackageXmlPath
                ) -join " "

                [pscustomobject]@{
                    PackagePath    = $packageMetadata.PackagePath
                    DisplayName    = $packageMetadata.DisplayName
                    Revision       = $packageMetadata.Revision
                    PackageXmlPath = $packageMetadata.PackageXmlPath
                    IsXr           = Test-NevexValueLooksXr -Value $summaryText
                }
            }
    )
}

function Get-NevexEmulatorRevision {
    $emulatorPackageXml = Join-Path $env:ANDROID_SDK_ROOT "emulator\package.xml"
    $packageMetadata = Get-NevexPackageMetadata -PackageXmlPath $emulatorPackageXml
    if ($null -eq $packageMetadata) {
        return $null
    }

    return $packageMetadata.Revision
}

function Get-NevexAvdMetadata {
    param(
        [string]$AvdName
    )

    $avdRoot = Join-Path $env:USERPROFILE ".android\avd"
    $avdIniPath = Join-Path $avdRoot "$AvdName.ini"
    if (-not (Test-Path $avdIniPath)) {
        return $null
    }

    $avdIniProperties = Get-NevexIniProperties -Path $avdIniPath
    $configRoot = $avdIniProperties["path"]
    if ([string]::IsNullOrWhiteSpace($configRoot)) {
        $relativePath = $avdIniProperties["path.rel"]
        if (-not [string]::IsNullOrWhiteSpace($relativePath)) {
            $configRoot = Join-Path (Join-Path $env:USERPROFILE ".android") $relativePath
        }
    }

    if ([string]::IsNullOrWhiteSpace($configRoot)) {
        return $null
    }

    $configIniPath = Join-Path $configRoot "config.ini"
    $configProperties = Get-NevexIniProperties -Path $configIniPath
    $summaryText = @(
        $AvdName,
        $configProperties["AvdId"],
        $configProperties["avd.ini.displayname"],
        $configProperties["hw.device.name"],
        $configProperties["hw.device.manufacturer"],
        $configProperties["image.sysdir.1"],
        $configProperties["tag.id"],
        $configProperties["tag.display"]
    ) -join " "
    $isXr = Test-NevexValueLooksXr -Value $summaryText

    return [pscustomobject]@{
        Serial          = $null
        IsEmulator      = $true
        IsXr            = $isXr
        TargetClass     = if ($isXr) { "xr_emulator" } else { "standard_emulator" }
        AvdName         = $AvdName
        DisplayName     = $configProperties["avd.ini.displayname"]
        DeviceName      = $configProperties["hw.device.name"]
        Manufacturer    = $configProperties["hw.device.manufacturer"]
        SystemImagePath = $configProperties["image.sysdir.1"]
        TagId           = $configProperties["tag.id"]
    }
}

function Get-NevexAvailableAvdMetadata {
    $availableAvds = @(& $script:NevexEmulator -list-avds)
    return @(
        $availableAvds | ForEach-Object {
            Get-NevexAvdMetadata -AvdName $_
        }
    )
}

function Get-NevexConnectedTargetInfo {
    param(
        [string]$Serial
    )

    $resolvedSerial = Resolve-NevexDeviceSerial -Serial $Serial
    $adbArgs = Get-NevexAdbArgs -Serial $resolvedSerial

    if ($resolvedSerial -like "emulator-*") {
        $avdName = @(
            & $script:NevexAdb @adbArgs emu avd name 2>$null |
                Where-Object {
                    -not [string]::IsNullOrWhiteSpace($_) -and
                    $_.Trim() -ne "OK"
                } |
                ForEach-Object { $_.Trim() }
        ) | Select-Object -First 1
        if ([string]::IsNullOrWhiteSpace($avdName)) {
            $avdName = (& $script:NevexAdb @adbArgs shell getprop ro.boot.qemu.avd_name 2>$null).Trim()
        }

        $avdMetadata = if ([string]::IsNullOrWhiteSpace($avdName)) {
            $null
        } else {
            Get-NevexAvdMetadata -AvdName $avdName
        }

        if ($null -ne $avdMetadata) {
            $avdMetadata.Serial = $resolvedSerial
            return $avdMetadata
        }

        return [pscustomobject]@{
            Serial          = $resolvedSerial
            IsEmulator      = $true
            IsXr            = $false
            TargetClass     = "standard_emulator"
            AvdName         = $avdName
            DisplayName     = $avdName
            DeviceName      = $null
            Manufacturer    = "Android Emulator"
            SystemImagePath = $null
            TagId           = $null
        }
    }

    $manufacturer = (& $script:NevexAdb @adbArgs shell getprop ro.product.manufacturer).Trim()
    $model = (& $script:NevexAdb @adbArgs shell getprop ro.product.model).Trim()
    $deviceName = (& $script:NevexAdb @adbArgs shell getprop ro.product.device).Trim()
    $characteristics = (& $script:NevexAdb @adbArgs shell getprop ro.build.characteristics).Trim()
    $summaryText = @($manufacturer, $model, $deviceName, $characteristics) -join " "
    $isXr = Test-NevexValueLooksXr -Value $summaryText

    return [pscustomobject]@{
        Serial          = $resolvedSerial
        IsEmulator      = $false
        IsXr            = $isXr
        TargetClass     = if ($isXr) { "xr_device" } else { "android_device" }
        AvdName         = $null
        DisplayName     = @($manufacturer, $model) -join " "
        DeviceName      = $deviceName
        Manufacturer    = $manufacturer
        SystemImagePath = $null
        TagId           = $characteristics
    }
}

function Show-NevexTargetSummary {
    param(
        [psobject]$TargetInfo,
        [switch]$WarnIfNotXr
    )

    if ($null -eq $TargetInfo) {
        return
    }

    Write-Host "Target: $($TargetInfo.Serial)"
    switch ($TargetInfo.TargetClass) {
        "xr_emulator" { Write-Host "Type: Android XR emulator" }
        "standard_emulator" { Write-Host "Type: Standard Android emulator" }
        "xr_device" { Write-Host "Type: XR hardware device" }
        default { Write-Host "Type: Android device" }
    }

    if (-not [string]::IsNullOrWhiteSpace($TargetInfo.DisplayName)) {
        Write-Host "Name: $($TargetInfo.DisplayName)"
    }
    if (-not [string]::IsNullOrWhiteSpace($TargetInfo.AvdName)) {
        Write-Host "AVD: $($TargetInfo.AvdName)"
    }
    if (-not [string]::IsNullOrWhiteSpace($TargetInfo.SystemImagePath)) {
        Write-Host "System image: $($TargetInfo.SystemImagePath)"
    }

    if ($WarnIfNotXr -and -not $TargetInfo.IsXr) {
        Write-Warning "XR-specific features like Full Space and spatial panels will not be fully validated on this target."
    }
}

function Get-NevexTargetKindLabel {
    param(
        [psobject]$TargetInfo
    )

    if ($null -eq $TargetInfo) {
        return "Unknown target"
    }

    switch ($TargetInfo.TargetClass) {
        "xr_emulator" { return "Android XR emulator" }
        "standard_emulator" { return "Standard Android emulator" }
        "xr_device" { return "XR hardware device" }
        default {
            if ($TargetInfo.IsEmulator) {
                return "Android emulator"
            }
            return "Physical Android device"
        }
    }
}

function Assert-NevexXrTarget {
    param(
        [psobject]$TargetInfo,
        [string]$Context
    )

    if ($null -eq $TargetInfo) {
        throw "Unable to inspect the current Android target."
    }

    if (-not $TargetInfo.IsXr) {
        $contextText = if ([string]::IsNullOrWhiteSpace($Context)) {
            "This command"
        } else {
            $Context
        }
        throw "$contextText requires an XR-capable target, but '$($TargetInfo.Serial)' is classified as $($TargetInfo.TargetClass)."
    }
}

function Assert-NevexPhysicalTarget {
    param(
        [psobject]$TargetInfo,
        [string]$Context
    )

    if ($null -eq $TargetInfo) {
        throw "Unable to inspect the current Android target."
    }

    if ($TargetInfo.IsEmulator) {
        $contextText = if ([string]::IsNullOrWhiteSpace($Context)) {
            "This command"
        } else {
            $Context
        }
        throw "$contextText requires a physical device, but '$($TargetInfo.Serial)' is classified as $($TargetInfo.TargetClass)."
    }
}
