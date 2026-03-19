package com.nevex.xr.nativeapp.ui.menu

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.R
import com.nevex.xr.nativeapp.ui.components.MenuButton
import com.nevex.xr.nativeapp.ui.state.MenuSelectionIndex
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.state.ThermalVisualMode
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary

@Composable
fun ThermalPresentationMenu(
    menuUiState: NevexMenuUiState,
    onSelectIndex: (Int) -> Unit,
    onSetThermalVisualMode: (ThermalVisualMode) -> Unit,
    onSelectPreparedMode: (Int) -> Unit,
    onReturnDisplay: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val activeMode = menuUiState.displaySettings.thermalVisualMode
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "Only the modes marked active are live today. The others are prepared shell entries for the next filtering pass.",
            style = MaterialTheme.typography.bodyMedium,
            color = NevexTextSecondary,
        )
        MenuButton(
            title = "White Hot",
            subtitle = if (activeMode == ThermalVisualMode.WhiteHot) {
                "Active live mode. Heat stays bright against darker background."
            } else {
                "Switch to bright heat signatures against darker background."
            },
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.ThermalPresentation.WhiteHot,
            iconResId = R.drawable.nevex_glyph_ir_on,
            onClick = {
                onSelectIndex(MenuSelectionIndex.ThermalPresentation.WhiteHot)
                onSetThermalVisualMode(ThermalVisualMode.WhiteHot)
            },
        )
        MenuButton(
            title = "Black Hot",
            subtitle = if (activeMode == ThermalVisualMode.BlackHot) {
                "Active live mode. Heat stays dark against lighter background."
            } else {
                "Switch to dark heat signatures against lighter background."
            },
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.ThermalPresentation.BlackHot,
            iconResId = R.drawable.nevex_glyph_ir_off,
            onClick = {
                onSelectIndex(MenuSelectionIndex.ThermalPresentation.BlackHot)
                onSetThermalVisualMode(ThermalVisualMode.BlackHot)
            },
        )
        PreparedModeButton(
            title = "Warm Targets Only",
            subtitle = "Prepared shell only. Current live mode remains white hot or black hot.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.ThermalPresentation.WarmTargetsOnly,
            iconResId = R.drawable.nevex_glyph_hotspot,
            onClick = {
                onSelectIndex(MenuSelectionIndex.ThermalPresentation.WarmTargetsOnly)
                onSelectPreparedMode(MenuSelectionIndex.ThermalPresentation.WarmTargetsOnly)
            },
        )
        PreparedModeButton(
            title = "Thresholded Thermal",
            subtitle = "Prepared shell only. Threshold filtering is not active yet.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.ThermalPresentation.ThresholdedThermal,
            iconResId = R.drawable.nevex_glyph_target_box,
            onClick = {
                onSelectIndex(MenuSelectionIndex.ThermalPresentation.ThresholdedThermal)
                onSelectPreparedMode(MenuSelectionIndex.ThermalPresentation.ThresholdedThermal)
            },
        )
        PreparedModeButton(
            title = "Edge Assist",
            subtitle = "Prepared shell only. Edge extraction remains disabled until the next processing pass.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.ThermalPresentation.EdgeAssist,
            iconResId = R.drawable.nevex_glyph_edge_enhance,
            onClick = {
                onSelectIndex(MenuSelectionIndex.ThermalPresentation.EdgeAssist)
                onSelectPreparedMode(MenuSelectionIndex.ThermalPresentation.EdgeAssist)
            },
        )
        PreparedModeButton(
            title = "Fusion Assist",
            subtitle = "Prepared shell only. Future fusion behavior will land here without changing menu structure.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.ThermalPresentation.FusionAssist,
            iconResId = R.drawable.nevex_glyph_fusion,
            onClick = {
                onSelectIndex(MenuSelectionIndex.ThermalPresentation.FusionAssist)
                onSelectPreparedMode(MenuSelectionIndex.ThermalPresentation.FusionAssist)
            },
        )
        MenuButton(
            title = "Return to Display Settings",
            subtitle = "Back to overlays, thermal source selection, and alignment.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.ThermalPresentation.ReturnDisplay,
            iconResId = R.drawable.nevex_glyph_back,
            onClick = onReturnDisplay,
        )
    }
}

@Composable
private fun PreparedModeButton(
    title: String,
    subtitle: String,
    selected: Boolean,
    iconResId: Int,
    onClick: () -> Unit,
) {
    MenuButton(
        title = title,
        subtitle = subtitle,
        selected = selected,
        iconResId = iconResId,
        onClick = onClick,
    )
}
