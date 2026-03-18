package com.nevex.xr.nativeapp.ui.menu

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.ui.components.MenuButton
import com.nevex.xr.nativeapp.ui.components.ToggleItem
import com.nevex.xr.nativeapp.ui.overlay.LiveViewOverlayLayer
import com.nevex.xr.nativeapp.ui.state.MenuSelectionIndex
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.state.OverlayUiState
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
    onThermalOverlayToggle: (Boolean) -> Unit,
    onReturnSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "Display options now drive lightweight overlay visuals above the live image. Thermal and detection remain placeholder treatments only.",
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
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        ToggleItem(
            title = "Reticle",
            subtitle = "Minimal center reticle",
            checked = menuUiState.displaySettings.reticleEnabled,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Display.Reticle,
            onToggle = onReticleToggle,
            onSelected = { onSelectIndex(MenuSelectionIndex.Display.Reticle) },
        )
        ToggleItem(
            title = "Grid",
            subtitle = "Faint calibration grid",
            checked = menuUiState.displaySettings.gridEnabled,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Display.Grid,
            onToggle = onGridToggle,
            onSelected = { onSelectIndex(MenuSelectionIndex.Display.Grid) },
        )
        ToggleItem(
            title = "Bounding Boxes",
            subtitle = "Restrained placeholder detection boxes",
            checked = menuUiState.displaySettings.boundingBoxesEnabled,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Display.BoundingBoxes,
            onToggle = onBoundingBoxesToggle,
            onSelected = { onSelectIndex(MenuSelectionIndex.Display.BoundingBoxes) },
        )
        ToggleItem(
            title = "Thermal Overlay",
            subtitle = "Subtle warm-tint placeholder treatment",
            checked = menuUiState.displaySettings.thermalOverlayEnabled,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Display.ThermalOverlay,
            onToggle = onThermalOverlayToggle,
            onSelected = { onSelectIndex(MenuSelectionIndex.Display.ThermalOverlay) },
        )
        MenuButton(
            title = "Return to Settings",
            subtitle = "Back to the slider and audio placeholder controls.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Display.ReturnSettings,
            onClick = onReturnSettings,
        )
    }
}
