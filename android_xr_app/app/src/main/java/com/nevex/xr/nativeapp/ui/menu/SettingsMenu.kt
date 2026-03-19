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
import com.nevex.xr.nativeapp.ui.components.SliderItem
import com.nevex.xr.nativeapp.ui.components.ToggleItem
import com.nevex.xr.nativeapp.ui.state.MenuSelectionIndex
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary

@Composable
fun SettingsMenu(
    menuUiState: NevexMenuUiState,
    onSelectIndex: (Int) -> Unit,
    onOverlayOpacityChange: (Float) -> Unit,
    onSoundVolumeChange: (Float) -> Unit,
    onAutoConnectToggle: (Boolean) -> Unit,
    onOpenDisplaySettings: () -> Unit,
    onOpenSystemStatus: () -> Unit,
    onRestoreDefaults: () -> Unit,
    onReturnMain: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "Startup, shell visibility, and current operator controls that do not disturb the known-good live path.",
            style = MaterialTheme.typography.bodyMedium,
            color = NevexTextSecondary,
        )
        ToggleItem(
            title = "Auto Connect on Startup",
            subtitle = if (menuUiState.settings.autoConnectOnStartup) {
                "Normal launch goes directly toward live view using the last known Jetson host."
            } else {
                "Launch stays manual until the operator chooses to connect."
            },
            checked = menuUiState.settings.autoConnectOnStartup,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Settings.AutoConnect,
            iconResId = R.drawable.nevex_glyph_jetson_link,
            onToggle = onAutoConnectToggle,
            onSelected = { onSelectIndex(MenuSelectionIndex.Settings.AutoConnect) },
        )
        SliderItem(
            title = "Overlay Opacity",
            subtitle = "Applies to the menu panel itself",
            value = menuUiState.settings.overlayOpacity,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Settings.OverlayOpacity,
            iconResId = R.drawable.nevex_glyph_menu,
            onValueChange = onOverlayOpacityChange,
            onSelected = { onSelectIndex(MenuSelectionIndex.Settings.OverlayOpacity) },
        )
        SliderItem(
            title = "Sound Volume",
            subtitle = "Scales subtle UI, capture, and link cues already wired in the shell.",
            value = menuUiState.settings.soundVolume,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Settings.SoundVolume,
            iconResId = R.drawable.nevex_glyph_waypoint,
            onValueChange = onSoundVolumeChange,
            onSelected = { onSelectIndex(MenuSelectionIndex.Settings.SoundVolume) },
        )
        MenuButton(
            title = "Display & Thermal",
            subtitle = "Reticle, grid, thermal presentation, preview mode, and alignment controls.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Settings.DisplaySettings,
            iconResId = R.drawable.nevex_glyph_quick_settings,
            onClick = onOpenDisplaySettings,
        )
        MenuButton(
            title = "System Status",
            subtitle = "Connection, latency, thermal link state, and diagnostics summary.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Settings.SystemStatus,
            iconResId = R.drawable.nevex_glyph_diagnostics,
            onClick = onOpenSystemStatus,
        )
        MenuButton(
            title = "Restore Product Defaults",
            subtitle = "Return startup behavior, sound level, profile, and shell controls to the default operator baseline.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Settings.RestoreDefaults,
            iconResId = R.drawable.nevex_glyph_reset,
            onClick = onRestoreDefaults,
        )
        MenuButton(
            title = "Return to Main Menu",
            subtitle = "Back to viewing mode, mission profiles, and capture.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Settings.ReturnMain,
            iconResId = R.drawable.nevex_glyph_back,
            onClick = onReturnMain,
        )
    }
}
