package com.nevex.xr.nativeapp.ui.menu

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.R
import com.nevex.xr.nativeapp.ui.state.CaptureShellUiState
import com.nevex.xr.nativeapp.ui.components.MenuButton
import com.nevex.xr.nativeapp.ui.state.MenuSelectionIndex
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.state.ThermalOverlayMode
import com.nevex.xr.nativeapp.ui.state.ViewingMode
import com.nevex.xr.nativeapp.ui.theme.NevexAccent
import com.nevex.xr.nativeapp.ui.theme.NevexBorder
import com.nevex.xr.nativeapp.ui.theme.NevexPanel
import com.nevex.xr.nativeapp.ui.theme.NevexPanelStrong
import com.nevex.xr.nativeapp.ui.theme.NevexTextPrimary
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary

@Composable
fun MainMenu(
    menuUiState: NevexMenuUiState,
    captureUiState: CaptureShellUiState,
    onSelectIndex: (Int) -> Unit,
    onCycleViewingMode: () -> Unit,
    onSetViewingMode: (ViewingMode) -> Unit,
    onOpenMissionProfiles: () -> Unit,
    onOpenCapture: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenSystemStatus: () -> Unit,
    onCloseMenu: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val viewingMode = currentViewingMode(menuUiState)
    val activeProfile = menuUiState.missionProfile

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 4.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "Direct operator controls for live viewing, capture, and system setup.",
            style = MaterialTheme.typography.bodyMedium,
            color = NevexTextSecondary,
        )
        ViewingModeCard(
            currentMode = viewingMode,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Main.ViewingMode,
            onSelected = {
                onSelectIndex(MenuSelectionIndex.Main.ViewingMode)
            },
            onCycleMode = onCycleViewingMode,
            onSetMode = onSetViewingMode,
        )
        MenuButton(
            title = "Mission Profile: ${activeProfile.label}",
            subtitle = activeProfile.detailText,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Main.MissionProfiles,
            iconResId = R.drawable.nevex_glyph_profiles,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Main.MissionProfiles)
                onOpenMissionProfiles()
            },
        )
        MenuButton(
            title = "Capture",
            subtitle = buildCaptureSubtitle(captureUiState),
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Main.Capture,
            iconResId = R.drawable.nevex_glyph_playback,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Main.Capture)
                onOpenCapture()
            },
        )
        MenuButton(
            title = "Settings",
            subtitle = "Startup behavior, display shell, sound level, and reset controls.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Main.Settings,
            iconResId = R.drawable.nevex_glyph_settings,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Main.Settings)
                onOpenSettings()
            },
        )
        MenuButton(
            title = "System Status",
            subtitle = "Connection health, latency, thermal link state, and live status.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Main.SystemStatus,
            iconResId = R.drawable.nevex_glyph_diagnostics,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Main.SystemStatus)
                onOpenSystemStatus()
            },
        )
        MenuButton(
            title = "Close Menu",
            subtitle = "Return to the unobstructed binocular view.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Main.Close,
            iconResId = R.drawable.nevex_glyph_close,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Main.Close)
                onCloseMenu()
            },
        )
        Text(
            text = "Tap the MENU handle, long press anywhere, or press M to open and close the menu.",
            style = MaterialTheme.typography.bodySmall,
            color = NevexTextSecondary,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

private fun buildCaptureSubtitle(captureUiState: CaptureShellUiState): String {
    return if (captureUiState.recordingActive) {
        "Snapshot and recording controls. REC is active and the live feed remains uninterrupted."
    } else if (captureUiState.lastSnapshotSavedAtMs != null) {
        "Snapshot and recording controls. Last snapshot saved ${captureUiState.lastSnapshotLabel}."
    } else {
        "Snapshot and recording controls without interrupting the live binocular feed."
    }
}

@Composable
private fun ViewingModeCard(
    currentMode: ViewingMode,
    selected: Boolean,
    onSelected: () -> Unit,
    onCycleMode: () -> Unit,
    onSetMode: (ViewingMode) -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable {
                onSelected()
                onCycleMode()
            },
        color = if (selected) {
            NevexPanelStrong.copy(alpha = 0.92f)
        } else {
            NevexPanel.copy(alpha = 0.82f)
        },
        border = BorderStroke(1.dp, if (selected) NevexAccent else NevexBorder),
        shape = MaterialTheme.shapes.medium,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = "Viewing Mode",
                style = MaterialTheme.typography.titleMedium,
                color = NevexTextPrimary,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            )
            Text(
                text = "Choose visible, thermal overlay, or thermal only.",
                style = MaterialTheme.typography.bodySmall,
                color = NevexTextSecondary,
            )
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ViewingModeOption(
                    mode = ViewingMode.Visible,
                    currentMode = currentMode,
                    onSelected = onSelected,
                    onClick = onSetMode,
                )
                ViewingModeOption(
                    mode = ViewingMode.ThermalOverlay,
                    currentMode = currentMode,
                    onSelected = onSelected,
                    onClick = onSetMode,
                )
                ViewingModeOption(
                    mode = ViewingMode.ThermalOnly,
                    currentMode = currentMode,
                    onSelected = onSelected,
                    onClick = onSetMode,
                )
            }
        }
    }
}

@Composable
private fun ViewingModeOption(
    mode: ViewingMode,
    currentMode: ViewingMode,
    onSelected: () -> Unit,
    onClick: (ViewingMode) -> Unit,
) {
    val active = currentMode == mode
    val iconResId = when (mode) {
        ViewingMode.Visible -> R.drawable.nevex_glyph_visible_lowlight
        ViewingMode.ThermalOverlay -> R.drawable.nevex_glyph_fusion
        ViewingMode.ThermalOnly -> R.drawable.nevex_glyph_thermal
    }
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable {
                onSelected()
                onClick(mode)
            },
        color = if (active) {
            NevexPanelStrong.copy(alpha = 0.94f)
        } else {
            NevexPanel.copy(alpha = 0.74f)
        },
        border = BorderStroke(1.dp, if (active) NevexAccent else NevexBorder),
        shape = MaterialTheme.shapes.small,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Image(
                painter = painterResource(id = iconResId),
                contentDescription = null,
                modifier = Modifier.size(24.dp),
            )
            Column(
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    text = mode.label,
                    style = MaterialTheme.typography.labelLarge,
                    color = NevexTextPrimary,
                    fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
                )
                Text(
                    text = mode.detailText,
                    style = MaterialTheme.typography.bodySmall,
                    color = NevexTextSecondary,
                )
            }
        }
    }
}

private fun currentViewingMode(menuUiState: NevexMenuUiState): ViewingMode {
    val displaySettings = menuUiState.displaySettings
    return when {
        displaySettings.thermalPreviewModeEnabled -> ViewingMode.ThermalOverlay
        displaySettings.thermalOnlyModeEnabled &&
            displaySettings.thermalMode != ThermalOverlayMode.Off ->
            ViewingMode.ThermalOnly
        displaySettings.thermalMode == ThermalOverlayMode.Off -> ViewingMode.Visible
        else -> ViewingMode.ThermalOverlay
    }
}
