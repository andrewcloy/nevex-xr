package com.nevex.xr.nativeapp.ui.menu

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.R
import com.nevex.xr.nativeapp.ui.components.MenuButton
import com.nevex.xr.nativeapp.ui.components.ToggleItem
import com.nevex.xr.nativeapp.ui.overlay.LiveViewOverlayLayer
import com.nevex.xr.nativeapp.ui.state.MenuSelectionIndex
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.state.OverlayUiState
import com.nevex.xr.nativeapp.ui.state.ThermalOverlayMode
import com.nevex.xr.nativeapp.ui.theme.NevexBorder
import com.nevex.xr.nativeapp.ui.theme.NevexPanel
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary

@Composable
fun DisplayMenu(
    menuUiState: NevexMenuUiState,
    overlayUiState: OverlayUiState,
    onSelectIndex: (Int) -> Unit,
    onReticleToggle: (Boolean) -> Unit,
    onGridToggle: (Boolean) -> Unit,
    onBoundingBoxesToggle: (Boolean) -> Unit,
    onCycleThermalMode: () -> Unit,
    onOpenThermalPresentation: () -> Unit,
    onThermalPreviewModeToggle: (Boolean) -> Unit,
    onCycleThermalPreviewOpacityPreset: () -> Unit,
    onOpenThermalAlignment: () -> Unit,
    onReturnSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val thermalMode = menuUiState.displaySettings.thermalMode
    val thermalPreviewModeEnabled = menuUiState.displaySettings.thermalPreviewModeEnabled
    val thermalPreviewOpacityPreset = menuUiState.displaySettings.thermalPreviewOpacityPreset
    val thermalSubtitle = when (thermalMode) {
        ThermalOverlayMode.Off -> "Overlay hidden"
        ThermalOverlayMode.Placeholder -> "Placeholder preview active"
        ThermalOverlayMode.Live -> overlayUiState.thermal.detailText
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "Display controls stay lightweight and layer above the live image without touching the stereo presenter path.",
            style = MaterialTheme.typography.bodyMedium,
            color = NevexTextSecondary,
        )
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .height(168.dp),
            color = NevexPanel.copy(alpha = 0.84f),
            border = BorderStroke(1.dp, NevexBorder),
            shape = MaterialTheme.shapes.small,
        ) {
            Box {
                LiveViewOverlayLayer(
                    overlayUiState = overlayUiState,
                    showThermalHud = false,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        ToggleItem(
            title = "Reticle",
            subtitle = "Minimal center reticle",
            checked = menuUiState.displaySettings.reticleEnabled,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Display.Reticle,
            iconResId = R.drawable.nevex_glyph_reticle_center,
            onToggle = onReticleToggle,
            onSelected = { onSelectIndex(MenuSelectionIndex.Display.Reticle) },
        )
        ToggleItem(
            title = "Grid",
            subtitle = "Faint calibration grid",
            checked = menuUiState.displaySettings.gridEnabled,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Display.Grid,
            iconResId = R.drawable.nevex_glyph_stereo_align,
            onToggle = onGridToggle,
            onSelected = { onSelectIndex(MenuSelectionIndex.Display.Grid) },
        )
        ToggleItem(
            title = "Bounding Boxes",
            subtitle = "Restrained placeholder detection boxes",
            checked = menuUiState.displaySettings.boundingBoxesEnabled,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Display.BoundingBoxes,
            iconResId = R.drawable.nevex_glyph_target_box,
            onToggle = onBoundingBoxesToggle,
            onSelected = { onSelectIndex(MenuSelectionIndex.Display.BoundingBoxes) },
        )
        MenuButton(
            title = "Thermal Mode: ${thermalMode.label}",
            subtitle = thermalSubtitle,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Display.ThermalOverlay,
            iconResId = R.drawable.nevex_glyph_fusion,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Display.ThermalOverlay)
                onCycleThermalMode()
            },
        )
        MenuButton(
            title = "Thermal Presentation",
            subtitle = "Current mode: ${menuUiState.displaySettings.thermalVisualMode.label}",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Display.ThermalPresentation,
            iconResId = R.drawable.nevex_glyph_thermal,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Display.ThermalPresentation)
                onOpenThermalPresentation()
            },
        )
        ToggleItem(
            title = "Thermal Preview Mode",
            subtitle = if (thermalPreviewModeEnabled) {
                "Temporary live thermal overlay forced on both eyes at ${thermalPreviewOpacityPreset.label} opacity"
            } else {
                "Quick stereo + thermal evaluation mode for the emulator or PC display"
            },
            checked = thermalPreviewModeEnabled,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Display.ThermalPreview,
            iconResId = R.drawable.nevex_glyph_playback,
            onToggle = onThermalPreviewModeToggle,
            onSelected = { onSelectIndex(MenuSelectionIndex.Display.ThermalPreview) },
        )
        MenuButton(
            title = "Preview Opacity: ${thermalPreviewOpacityPreset.label}",
            subtitle = if (thermalPreviewModeEnabled) {
                "Cycles 10 / 25 / 40 for the active preview overlay blend."
            } else {
                "Preset for the next preview session. Default is 25%."
            },
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Display.ThermalPreviewOpacity,
            iconResId = R.drawable.nevex_glyph_gain,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Display.ThermalPreviewOpacity)
                onCycleThermalPreviewOpacityPreset()
            },
        )
        MenuButton(
            title = "Thermal Alignment",
            subtitle = "Adjust X, Y, scale, precision mode, and quick alignment presets.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Display.ThermalAlignment,
            iconResId = R.drawable.nevex_glyph_thermal_align,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Display.ThermalAlignment)
                onOpenThermalAlignment()
            },
        )
        MenuButton(
            title = "Return to Settings",
            subtitle = "Back to startup behavior, sound level, and defaults.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Display.ReturnSettings,
            iconResId = R.drawable.nevex_glyph_back,
            onClick = onReturnSettings,
        )
    }
}
