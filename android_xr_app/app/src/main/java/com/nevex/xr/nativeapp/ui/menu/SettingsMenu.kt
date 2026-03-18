package com.nevex.xr.nativeapp.ui.menu

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.ui.components.MenuButton
import com.nevex.xr.nativeapp.ui.components.SliderItem
import com.nevex.xr.nativeapp.ui.state.MenuSelectionIndex
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary

@Composable
fun SettingsMenu(
    menuUiState: NevexMenuUiState,
    onSelectIndex: (Int) -> Unit,
    onBrightnessChange: (Float) -> Unit,
    onContrastChange: (Float) -> Unit,
    onOverlayOpacityChange: (Float) -> Unit,
    onSoundVolumeChange: (Float) -> Unit,
    onOpenDisplaySettings: () -> Unit,
    onReturnMain: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "These controls only affect the XR UI shell for now. The stereo feed path remains unchanged.",
            style = MaterialTheme.typography.bodyMedium,
            color = NevexTextSecondary,
        )
        SliderItem(
            title = "Brightness",
            subtitle = "UI-only placeholder control",
            value = menuUiState.settings.brightness,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Settings.Brightness,
            onValueChange = onBrightnessChange,
            onSelected = { onSelectIndex(MenuSelectionIndex.Settings.Brightness) },
        )
        SliderItem(
            title = "Contrast",
            subtitle = "UI-only placeholder control",
            value = menuUiState.settings.contrast,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Settings.Contrast,
            onValueChange = onContrastChange,
            onSelected = { onSelectIndex(MenuSelectionIndex.Settings.Contrast) },
        )
        SliderItem(
            title = "Overlay Opacity",
            subtitle = "Applies to the menu panel itself",
            value = menuUiState.settings.overlayOpacity,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Settings.OverlayOpacity,
            onValueChange = onOverlayOpacityChange,
            onSelected = { onSelectIndex(MenuSelectionIndex.Settings.OverlayOpacity) },
        )
        SliderItem(
            title = "Sound Volume",
            subtitle = "Future audio hook only",
            value = menuUiState.settings.soundVolume,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Settings.SoundVolume,
            onValueChange = onSoundVolumeChange,
            onSelected = { onSelectIndex(MenuSelectionIndex.Settings.SoundVolume) },
        )
        MenuButton(
            title = "Display Settings",
            subtitle = "Reticle, grid, bounding boxes, and thermal overlay placeholders.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Settings.DisplaySettings,
            onClick = onOpenDisplaySettings,
        )
        MenuButton(
            title = "Return to Main Menu",
            subtitle = "Back to the root overlay menu.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Settings.ReturnMain,
            onClick = onReturnMain,
        )
    }
}
