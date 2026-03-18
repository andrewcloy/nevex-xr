[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function ConvertTo-NevexSafeName {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $safeName = $Name.ToLowerInvariant()
    $safeName = [Regex]::Replace($safeName, "[^a-z0-9_]+", "_")
    $safeName = [Regex]::Replace($safeName, "_+", "_")
    $safeName = $safeName.Trim("_")

    if ([string]::IsNullOrWhiteSpace($safeName)) {
        throw "Failed to normalize resource name: '$Name'"
    }

    return $safeName
}

function ConvertTo-RepoRelativePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$TargetPath
    )

    $fullRepoRoot = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd("\")
    $fullTargetPath = [System.IO.Path]::GetFullPath($TargetPath)

    if ($fullTargetPath.StartsWith($fullRepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $fullTargetPath.Substring($fullRepoRoot.Length).TrimStart("\").Replace("\", "/")
    }

    return $fullTargetPath.Replace("\", "/")
}

function Ensure-Directory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

$moduleRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $moduleRoot ".."))

$audioSource = Join-Path $repoRoot "NEVEX_XR_AudioPack"
$interfaceSource = Join-Path $repoRoot "NEVEX_XR_InterfacePack"

foreach ($requiredPath in @($audioSource, $interfaceSource)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Missing source pack: $requiredPath"
    }
}

$archiveRoot = Join-Path $moduleRoot "asset_sources"
$audioArchive = Join-Path $archiveRoot "NEVEX_XR_AudioPack"
$interfaceArchive = Join-Path $archiveRoot "NEVEX_XR_InterfacePack"
$rawRoot = Join-Path $moduleRoot "app\src\main\res\raw"
$drawableRoot = Join-Path $moduleRoot "app\src\main\res\drawable-nodpi"
$catalogRoot = Join-Path $moduleRoot "app\src\main\assets\nevex_asset_catalog"
$audioCatalogRoot = Join-Path $catalogRoot "audio"
$interfaceCatalogRoot = Join-Path $catalogRoot "interface"
$inventoryPath = Join-Path $moduleRoot "ASSET_INVENTORY.md"
$runtimeMapPath = Join-Path $catalogRoot "runtime_resource_map.json"

if (Test-Path -LiteralPath $audioArchive) {
    throw "Archive destination already exists: $audioArchive"
}

if (Test-Path -LiteralPath $interfaceArchive) {
    throw "Archive destination already exists: $interfaceArchive"
}

foreach ($directory in @(
    $archiveRoot,
    $rawRoot,
    $drawableRoot,
    $catalogRoot,
    $audioCatalogRoot,
    $interfaceCatalogRoot
)) {
    Ensure-Directory -Path $directory
}

Copy-Item -LiteralPath $audioSource -Destination $archiveRoot -Recurse
Copy-Item -LiteralPath $interfaceSource -Destination $archiveRoot -Recurse

$usedDestinationPaths = @{}
$audioEntries = New-Object System.Collections.Generic.List[object]
$interfaceGlyphEntries = New-Object System.Collections.Generic.List[object]
$interfaceTileEntries = New-Object System.Collections.Generic.List[object]
$interfacePlaceholderEntries = New-Object System.Collections.Generic.List[object]
$catalogEntries = New-Object System.Collections.Generic.List[object]

function Register-Resource {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourcePath,
        [Parameter(Mandatory = $true)]
        [string]$DestinationDirectory,
        [Parameter(Mandatory = $true)]
        [string]$ResourceName,
        [Parameter(Mandatory = $true)]
        [string]$CodeReference,
        [Parameter(Mandatory = $true)]
        [string]$SourcePack,
        [Parameter(Mandatory = $true)]
        [string]$Kind,
        [Parameter(Mandatory = $true)]
        [string]$Category
    )

    $extension = [System.IO.Path]::GetExtension($SourcePath).ToLowerInvariant()
    $destinationPath = Join-Path $DestinationDirectory ($ResourceName + $extension)
    $destinationKey = $destinationPath.ToLowerInvariant()

    if ($usedDestinationPaths.ContainsKey($destinationKey)) {
        throw "Destination collision: $destinationPath from '$SourcePath' and '$($usedDestinationPaths[$destinationKey])'"
    }

    if (Test-Path -LiteralPath $destinationPath) {
        throw "Destination already exists: $destinationPath"
    }

    Copy-Item -LiteralPath $SourcePath -Destination $destinationPath
    $usedDestinationPaths[$destinationKey] = $SourcePath

    $sourceRootPath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $SourcePack)).TrimEnd("\")
    $archivedRootPath = [System.IO.Path]::GetFullPath((Join-Path $archiveRoot $SourcePack)).TrimEnd("\")
    $fullSourcePath = [System.IO.Path]::GetFullPath($SourcePath)

    if (-not $fullSourcePath.StartsWith($sourceRootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Source path '$SourcePath' is not inside expected pack root '$sourceRootPath'"
    }

    $archivedFullPath = $archivedRootPath + $fullSourcePath.Substring($sourceRootPath.Length)

    return [pscustomobject]@{
        sourcePack = $SourcePack
        kind = $Kind
        category = $Category
        originalFilename = [System.IO.Path]::GetFileName($SourcePath)
        originalRelativePath = ConvertTo-RepoRelativePath -RepoRoot $repoRoot -TargetPath $SourcePath
        archivedRelativePath = ConvertTo-RepoRelativePath -RepoRoot $repoRoot -TargetPath $archivedFullPath
        resourceName = $ResourceName
        destinationRelativePath = ConvertTo-RepoRelativePath -RepoRoot $repoRoot -TargetPath $destinationPath
        codeReference = $CodeReference
    }
}

function Register-CatalogFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourcePath,
        [Parameter(Mandatory = $true)]
        [string]$DestinationPath,
        [Parameter(Mandatory = $true)]
        [string]$SourcePack
    )

    if (Test-Path -LiteralPath $DestinationPath) {
        throw "Catalog destination already exists: $DestinationPath"
    }

    Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath

    return [pscustomobject]@{
        sourcePack = $SourcePack
        originalFilename = [System.IO.Path]::GetFileName($SourcePath)
        originalRelativePath = ConvertTo-RepoRelativePath -RepoRoot $repoRoot -TargetPath $SourcePath
        destinationRelativePath = ConvertTo-RepoRelativePath -RepoRoot $repoRoot -TargetPath $DestinationPath
    }
}

$audioFiles = Get-ChildItem -LiteralPath (Join-Path $audioSource "03_ASSETS\audio") -Filter "*.wav" -Recurse | Sort-Object FullName
foreach ($file in $audioFiles) {
    $resourceName = "nevex_audio_" + (ConvertTo-NevexSafeName -Name $file.BaseName)
    $entry = Register-Resource `
        -SourcePath $file.FullName `
        -DestinationDirectory $rawRoot `
        -ResourceName $resourceName `
        -CodeReference ("R.raw." + $resourceName) `
        -SourcePack "NEVEX_XR_AudioPack" `
        -Kind "audio" `
        -Category $file.Directory.Name
    $audioEntries.Add($entry)
}

$glyphFiles = Get-ChildItem -LiteralPath (Join-Path $interfaceSource "03_ASSETS\png\glyph_icons") -Filter "*.png" | Sort-Object Name
foreach ($file in $glyphFiles) {
    $resourceName = "nevex_glyph_" + (ConvertTo-NevexSafeName -Name $file.BaseName)
    $entry = Register-Resource `
        -SourcePath $file.FullName `
        -DestinationDirectory $drawableRoot `
        -ResourceName $resourceName `
        -CodeReference ("R.drawable." + $resourceName) `
        -SourcePack "NEVEX_XR_InterfacePack" `
        -Kind "interface_glyph" `
        -Category "glyph_icons"
    $interfaceGlyphEntries.Add($entry)
}

$tileFiles = Get-ChildItem -LiteralPath (Join-Path $interfaceSource "03_ASSETS\png\tile_icons") -Filter "*.png" | Sort-Object Name
foreach ($file in $tileFiles) {
    $resourceName = "nevex_tile_" + (ConvertTo-NevexSafeName -Name $file.BaseName)
    $entry = Register-Resource `
        -SourcePath $file.FullName `
        -DestinationDirectory $drawableRoot `
        -ResourceName $resourceName `
        -CodeReference ("R.drawable." + $resourceName) `
        -SourcePack "NEVEX_XR_InterfacePack" `
        -Kind "interface_tile" `
        -Category "tile_icons"
    $interfaceTileEntries.Add($entry)
}

$placeholderFiles = Get-ChildItem -LiteralPath (Join-Path $interfaceSource "03_ASSETS\png\placeholders") -Filter "*.png" | Sort-Object Name
foreach ($file in $placeholderFiles) {
    $family = "placeholder"
    $baseName = $file.BaseName

    if ($file.BaseName -match "^(?<name>.+)__(?<family>glyph|tile|panel)$") {
        $family = ConvertTo-NevexSafeName -Name $Matches.family
        $baseName = $Matches.name
    }

    $resourceName = "nevex_placeholder_" + $family + "_" + (ConvertTo-NevexSafeName -Name $baseName)
    $entry = Register-Resource `
        -SourcePath $file.FullName `
        -DestinationDirectory $drawableRoot `
        -ResourceName $resourceName `
        -CodeReference ("R.drawable." + $resourceName) `
        -SourcePack "NEVEX_XR_InterfacePack" `
        -Kind "interface_placeholder" `
        -Category ("placeholders_" + $family)
    $interfacePlaceholderEntries.Add($entry)
}

$audioManifestFiles = Get-ChildItem -LiteralPath (Join-Path $audioSource "02_MANIFESTS") | Sort-Object Name
foreach ($file in $audioManifestFiles) {
    $entry = Register-CatalogFile `
        -SourcePath $file.FullName `
        -DestinationPath (Join-Path $audioCatalogRoot $file.Name) `
        -SourcePack "NEVEX_XR_AudioPack"
    $catalogEntries.Add($entry)
}

$interfaceManifestFiles = Get-ChildItem -LiteralPath (Join-Path $interfaceSource "02_MANIFESTS") | Sort-Object Name
foreach ($file in $interfaceManifestFiles) {
    $entry = Register-CatalogFile `
        -SourcePath $file.FullName `
        -DestinationPath (Join-Path $interfaceCatalogRoot $file.Name) `
        -SourcePack "NEVEX_XR_InterfacePack"
    $catalogEntries.Add($entry)
}

$runtimeMap = [ordered]@{
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    archivedSourcePacks = @(
        (ConvertTo-RepoRelativePath -RepoRoot $repoRoot -TargetPath $audioArchive),
        (ConvertTo-RepoRelativePath -RepoRoot $repoRoot -TargetPath $interfaceArchive)
    )
    counts = [ordered]@{
        audio = $audioEntries.Count
        interfaceGlyphs = $interfaceGlyphEntries.Count
        interfaceTiles = $interfaceTileEntries.Count
        interfacePlaceholders = $interfacePlaceholderEntries.Count
        catalogFiles = $catalogEntries.Count
        totalRuntimeResources = $audioEntries.Count + $interfaceGlyphEntries.Count + $interfaceTileEntries.Count + $interfacePlaceholderEntries.Count
    }
    audio = $audioEntries
    interfaceGlyphs = $interfaceGlyphEntries
    interfaceTiles = $interfaceTileEntries
    interfacePlaceholders = $interfacePlaceholderEntries
    catalogFiles = $catalogEntries
}

$runtimeMap | ConvertTo-Json -Depth 8 | Set-Content -Path $runtimeMapPath -Encoding UTF8

$inventoryContent = @"
# NEVEX XR Asset Inventory

This file records the first permanent integration of the loose NEVEX XR asset packs into the native Android XR module.

## Archived source packs

- asset_sources/NEVEX_XR_AudioPack
- asset_sources/NEVEX_XR_InterfacePack

These archived copies preserve the full original handoff packs, including docs, manifests, preview files, prompts, tools, and logs.

## Runtime destinations

- app/src/main/res/raw
  - 43 production WAV files from the audio pack
  - reference in code as R.raw.nevex_audio_*
- app/src/main/res/drawable-nodpi
  - 53 generated glyph icons as R.drawable.nevex_glyph_*
  - 32 generated tile icons as R.drawable.nevex_tile_*
  - 28 placeholder and panel PNGs as R.drawable.nevex_placeholder_*
- app/src/main/assets/nevex_asset_catalog
  - copied pack manifests and naming docs
  - generated runtime_resource_map.json with exact old-path to new-resource mapping

## Naming normalization

- audio: ui_click_soft.wav -> R.raw.nevex_audio_ui_click_soft
- glyph: power.png -> R.drawable.nevex_glyph_power
- tile: power.png -> R.drawable.nevex_tile_power
- placeholder: alert_low_battery__tile.png -> R.drawable.nevex_placeholder_tile_alert_low_battery
- panel placeholder: detection_panel_shell__panel.png -> R.drawable.nevex_placeholder_panel_detection_panel_shell

All runtime resource names use lowercase snake_case and a NEVEX-specific prefix to avoid collisions with existing Android resources.

## Code reference guidance

- Use audio through R.raw resource IDs rather than direct filenames.
- Use the audio event mapping in app/src/main/assets/nevex_asset_catalog/audio/audio_runtime_event_map.json as the event-to-sound source of truth.
- Use UI art through R.drawable resource IDs.
- Use app/src/main/assets/nevex_asset_catalog/runtime_resource_map.json when you need the exact source-pack filename, destination resource, or destination path.

## Imported counts

- audio runtime assets: $($audioEntries.Count)
- interface glyph icons: $($interfaceGlyphEntries.Count)
- interface tile icons: $($interfaceTileEntries.Count)
- interface placeholder and panel images: $($interfacePlaceholderEntries.Count)
- copied catalog files: $($catalogEntries.Count)
"@

$inventoryContent | Set-Content -Path $inventoryPath -Encoding UTF8

Write-Host "Archived source packs:"
Write-Host "  $(ConvertTo-RepoRelativePath -RepoRoot $repoRoot -TargetPath $audioArchive)"
Write-Host "  $(ConvertTo-RepoRelativePath -RepoRoot $repoRoot -TargetPath $interfaceArchive)"
Write-Host "Imported runtime resources:"
Write-Host "  audio: $($audioEntries.Count)"
Write-Host "  interface glyphs: $($interfaceGlyphEntries.Count)"
Write-Host "  interface tiles: $($interfaceTileEntries.Count)"
Write-Host "  interface placeholders: $($interfacePlaceholderEntries.Count)"
Write-Host "Catalog files copied: $($catalogEntries.Count)"
Write-Host "Inventory: $(ConvertTo-RepoRelativePath -RepoRoot $repoRoot -TargetPath $inventoryPath)"
Write-Host "Runtime map: $(ConvertTo-RepoRelativePath -RepoRoot $repoRoot -TargetPath $runtimeMapPath)"
