package com.nevex.xr.nativeapp.ui.menu

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.ui.components.MenuButton
import com.nevex.xr.nativeapp.ui.components.SliderItem
import com.nevex.xr.nativeapp.ui.overlay.LiveViewOverlayLayer
import com.nevex.xr.nativeapp.ui.state.MenuSelectionIndex
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.state.OverlayUiState
import com.nevex.xr.nativeapp.ui.theme.NevexBorder
import com.nevex.xr.nativeapp.ui.theme.NevexPanel
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary
import java.util.Locale

private const val THERMAL_ALIGNMENT_OFFSET_RANGE = 0.25f
private const val THERMAL_ALIGNMENT_SCALE_MIN = 0.75f
private const val THERMAL_ALIGNMENT_SCALE_MAX = 1.25f

@Composable
fun ThermalAlignmentMenu(
    menuUiState: NevexMenuUiState,
    overlayUiState: OverlayUiState,
    onSelectIndex: (Int) -> Unit,
    onOpenAutoCalibration: () -> Unit,
    onToggleAdjustmentMode: () -> Unit,
    onOffsetXChange: (Float) -> Unit,
    onOffsetYChange: (Float) -> Unit,
    onScaleChange: (Float) -> Unit,
    onOverlayOpacityChange: (Float) -> Unit,
    onCenterAlignment: () -> Unit,
    onResetAlignment: () -> Unit,
    onReturnDisplay: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val transform = overlayUiState.thermal.transform
    val alignmentUiState = menuUiState.thermalAlignment
    val adjustmentMode = alignmentUiState.adjustmentMode
    val previewOverlayUiState = overlayUiState.copy(
        reticleEnabled = true,
        gridEnabled = true,
        boundingBoxesEnabled = false,
        calibrationAidActive = true,
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "Trim the thermal overlay against the live scene while the main view stays visible behind this panel. Grid and reticle are emphasized in the preview for reference only.",
            style = MaterialTheme.typography.bodyMedium,
            color = NevexTextSecondary,
        )
        Text(
            text = "Thermal status: ${overlayUiState.thermal.statusText.lowercase(Locale.US)}. ${overlayUiState.thermal.detailText}",
            style = MaterialTheme.typography.bodySmall,
            color = NevexTextSecondary,
        )
        CalibrationSummaryCard(
            calibrationStatus = alignmentUiState.calibrationStatus,
            transform = transform,
            supportingText = "Use automatic calibration as a coarse start when available, then trim X, Y, and scale here for final alignment.",
        )
        MenuButton(
            title = "Adjustment Mode: ${adjustmentMode.label}",
            subtitle = "Switch between fast acquisition and fine trim. Current step: ${adjustmentMode.summaryText}.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Alignment.AdjustmentMode,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Alignment.AdjustmentMode)
                onToggleAdjustmentMode()
            },
        )
        MenuButton(
            title = "Auto Calibrate",
            subtitle = "Guided overlap check and coarse-start attempt. No usable solve is normal until physical overlap is ready.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Alignment.AutoCalibrate,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Alignment.AutoCalibrate)
                onOpenAutoCalibration()
            },
        )
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .height(184.dp),
            color = NevexPanel.copy(alpha = 0.84f),
            border = BorderStroke(1.dp, NevexBorder),
            shape = MaterialTheme.shapes.small,
        ) {
            Box {
                LiveViewOverlayLayer(
                    overlayUiState = previewOverlayUiState,
                    showThermalHud = false,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        SliderItem(
            title = "X Offset",
            subtitle = "Shift thermal left or right. ${adjustmentMode.offsetStepLabel}.",
            value = transform.offsetXFraction,
            valueRange = -THERMAL_ALIGNMENT_OFFSET_RANGE..THERMAL_ALIGNMENT_OFFSET_RANGE,
            steps = adjustmentMode.offsetSliderSteps,
            valueText = formatOffsetValue(transform.offsetXFraction),
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Alignment.OffsetX,
            onValueChange = onOffsetXChange,
            onSelected = { onSelectIndex(MenuSelectionIndex.Alignment.OffsetX) },
        )
        SliderItem(
            title = "Y Offset",
            subtitle = "Shift thermal up or down. ${adjustmentMode.offsetStepLabel}.",
            value = transform.offsetYFraction,
            valueRange = -THERMAL_ALIGNMENT_OFFSET_RANGE..THERMAL_ALIGNMENT_OFFSET_RANGE,
            steps = adjustmentMode.offsetSliderSteps,
            valueText = formatOffsetValue(transform.offsetYFraction),
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Alignment.OffsetY,
            onValueChange = onOffsetYChange,
            onSelected = { onSelectIndex(MenuSelectionIndex.Alignment.OffsetY) },
        )
        SliderItem(
            title = "Scale",
            subtitle = "Expand or contract the thermal layer. ${adjustmentMode.scaleStepLabel}.",
            value = transform.scale,
            valueRange = THERMAL_ALIGNMENT_SCALE_MIN..THERMAL_ALIGNMENT_SCALE_MAX,
            steps = adjustmentMode.scaleSliderSteps,
            valueText = formatScaleValue(transform.scale),
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Alignment.Scale,
            onValueChange = onScaleChange,
            onSelected = { onSelectIndex(MenuSelectionIndex.Alignment.Scale) },
        )
        SliderItem(
            title = "Overlay Opacity",
            subtitle = "Quick thermal visibility trim while calibrating",
            value = menuUiState.settings.overlayOpacity,
            valueText = String.format(Locale.US, "%.0f%%", menuUiState.settings.overlayOpacity * 100f),
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Alignment.OverlayOpacity,
            onValueChange = onOverlayOpacityChange,
            onSelected = { onSelectIndex(MenuSelectionIndex.Alignment.OverlayOpacity) },
        )
        MenuButton(
            title = "Center Offsets",
            subtitle = "Quickly zero X and Y while keeping the current scale.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Alignment.CenterOffsets,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Alignment.CenterOffsets)
                onCenterAlignment()
            },
        )
        MenuButton(
            title = "Reset to Default",
            subtitle = "Zero X and Y, restore 1.000x, and clear the saved calibration profile.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Alignment.Reset,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Alignment.Reset)
                onResetAlignment()
            },
        )
        MenuButton(
            title = "Return to Display Settings",
            subtitle = "Back to thermal mode and overlay toggles.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Alignment.ReturnDisplay,
            onClick = onReturnDisplay,
        )
    }
}
