package com.nevex.xr.nativeapp.ui.menu

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.ui.state.CaptureShellUiState
import com.nevex.xr.nativeapp.ui.state.MissionProfile
import com.nevex.xr.nativeapp.ui.state.NevexMenuScreen
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.state.OverlayUiState
import com.nevex.xr.nativeapp.ui.state.ThermalVisualMode
import com.nevex.xr.nativeapp.ui.state.ViewingMode
import com.nevex.xr.nativeapp.ui.theme.NevexBorder
import com.nevex.xr.nativeapp.ui.theme.NevexPanelStrong
import com.nevex.xr.nativeapp.ui.theme.NevexTextPrimary
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary

@Composable
fun MenuOverlayPanel(
    menuUiState: NevexMenuUiState,
    captureUiState: CaptureShellUiState,
    overlayUiState: OverlayUiState,
    onSelectIndex: (Int) -> Unit,
    onCycleViewingMode: () -> Unit,
    onSetViewingMode: (ViewingMode) -> Unit,
    onOpenMissionProfiles: () -> Unit,
    onOpenCapture: () -> Unit,
    onCaptureSnapshot: () -> Unit,
    onToggleRecording: () -> Unit,
    onCloseMenu: () -> Unit,
    onSetMissionProfile: (MissionProfile) -> Unit,
    onOpenSettings: () -> Unit,
    onOpenDisplaySettings: () -> Unit,
    onOpenThermalPresentation: () -> Unit,
    onOpenThermalAlignment: () -> Unit,
    onOpenThermalAutoCalibration: () -> Unit,
    onOpenSystemStatus: () -> Unit,
    onReturnMain: () -> Unit,
    onReturnSettings: () -> Unit,
    onReturnDisplay: () -> Unit,
    onReturnThermalAlignment: () -> Unit,
    onOverlayOpacityChange: (Float) -> Unit,
    onSoundVolumeChange: (Float) -> Unit,
    onAutoConnectToggle: (Boolean) -> Unit,
    onRestoreDefaults: () -> Unit,
    onReticleToggle: (Boolean) -> Unit,
    onGridToggle: (Boolean) -> Unit,
    onBoundingBoxesToggle: (Boolean) -> Unit,
    onCycleThermalMode: () -> Unit,
    onThermalPreviewModeToggle: (Boolean) -> Unit,
    onCycleThermalPreviewOpacityPreset: () -> Unit,
    onSetThermalVisualMode: (ThermalVisualMode) -> Unit,
    onSelectPreparedThermalMode: (Int) -> Unit,
    onCycleThermalAlignmentAdjustmentMode: () -> Unit,
    onThermalOffsetXChange: (Float) -> Unit,
    onThermalOffsetYChange: (Float) -> Unit,
    onThermalScaleChange: (Float) -> Unit,
    onCenterThermalAlignment: () -> Unit,
    onResetThermalAlignment: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val panelAlpha = (0.30f + (menuUiState.settings.overlayOpacity * 0.62f)).coerceIn(0.38f, 0.92f)

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = NevexPanelStrong.copy(alpha = panelAlpha),
        ),
        border = BorderStroke(1.dp, NevexBorder),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = menuUiState.currentMenu.title,
                style = MaterialTheme.typography.headlineSmall,
                color = NevexTextPrimary,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = menuSubtitle(menuUiState.currentMenu),
                style = MaterialTheme.typography.bodyMedium,
                color = NevexTextSecondary,
            )
            when (menuUiState.currentMenu) {
                NevexMenuScreen.MainMenu -> {
                    MainMenu(
                        menuUiState = menuUiState,
                        captureUiState = captureUiState,
                        onSelectIndex = onSelectIndex,
                        onCycleViewingMode = onCycleViewingMode,
                        onSetViewingMode = onSetViewingMode,
                        onOpenMissionProfiles = onOpenMissionProfiles,
                        onOpenCapture = onOpenCapture,
                        onOpenSettings = onOpenSettings,
                        onOpenSystemStatus = onOpenSystemStatus,
                        onCloseMenu = onCloseMenu,
                    )
                }

                NevexMenuScreen.MissionProfiles -> {
                    MissionProfilesMenu(
                        menuUiState = menuUiState,
                        onSelectIndex = onSelectIndex,
                        onSetMissionProfile = onSetMissionProfile,
                        onReturnMain = onReturnMain,
                    )
                }

                NevexMenuScreen.Capture -> {
                    CaptureMenu(
                        menuUiState = menuUiState,
                        captureUiState = captureUiState,
                        onSelectIndex = onSelectIndex,
                        onCaptureSnapshot = onCaptureSnapshot,
                        onToggleRecording = onToggleRecording,
                        onReturnMain = onReturnMain,
                    )
                }

                NevexMenuScreen.Settings -> {
                    SettingsMenu(
                        menuUiState = menuUiState,
                        onSelectIndex = onSelectIndex,
                        onOverlayOpacityChange = onOverlayOpacityChange,
                        onSoundVolumeChange = onSoundVolumeChange,
                        onAutoConnectToggle = onAutoConnectToggle,
                        onOpenDisplaySettings = onOpenDisplaySettings,
                        onOpenSystemStatus = onOpenSystemStatus,
                        onRestoreDefaults = onRestoreDefaults,
                        onReturnMain = onReturnMain,
                    )
                }

                NevexMenuScreen.DisplaySettings -> {
                    DisplayMenu(
                        menuUiState = menuUiState,
                        overlayUiState = overlayUiState,
                        onSelectIndex = onSelectIndex,
                        onReticleToggle = onReticleToggle,
                        onGridToggle = onGridToggle,
                        onBoundingBoxesToggle = onBoundingBoxesToggle,
                        onCycleThermalMode = onCycleThermalMode,
                        onOpenThermalPresentation = onOpenThermalPresentation,
                        onThermalPreviewModeToggle = onThermalPreviewModeToggle,
                        onCycleThermalPreviewOpacityPreset = onCycleThermalPreviewOpacityPreset,
                        onOpenThermalAlignment = onOpenThermalAlignment,
                        onReturnSettings = onReturnSettings,
                    )
                }

                NevexMenuScreen.ThermalPresentation -> {
                    ThermalPresentationMenu(
                        menuUiState = menuUiState,
                        onSelectIndex = onSelectIndex,
                        onSetThermalVisualMode = onSetThermalVisualMode,
                        onSelectPreparedMode = onSelectPreparedThermalMode,
                        onReturnDisplay = onReturnDisplay,
                    )
                }

                NevexMenuScreen.ThermalAlignment -> {
                    ThermalAlignmentMenu(
                        menuUiState = menuUiState,
                        overlayUiState = overlayUiState,
                        onSelectIndex = onSelectIndex,
                        onOpenAutoCalibration = onOpenThermalAutoCalibration,
                        onToggleAdjustmentMode = onCycleThermalAlignmentAdjustmentMode,
                        onOffsetXChange = onThermalOffsetXChange,
                        onOffsetYChange = onThermalOffsetYChange,
                        onScaleChange = onThermalScaleChange,
                        onOverlayOpacityChange = onOverlayOpacityChange,
                        onCenterAlignment = onCenterThermalAlignment,
                        onResetAlignment = onResetThermalAlignment,
                        onReturnDisplay = onReturnDisplay,
                    )
                }

                NevexMenuScreen.ThermalAutoCalibration -> {
                    ThermalAutoCalibrationMenu(
                        menuUiState = menuUiState,
                        overlayUiState = overlayUiState,
                        onReturnAlignment = onReturnThermalAlignment,
                    )
                }

                NevexMenuScreen.SystemStatus -> {
                    StatusMenu(
                        menuUiState = menuUiState,
                        onReturnMain = onReturnMain,
                    )
                }
            }
        }
    }
}

private fun menuSubtitle(screen: NevexMenuScreen): String {
    return when (screen) {
        NevexMenuScreen.MainMenu -> "Primary live-view controls with a shorter operator path."
        NevexMenuScreen.MissionProfiles -> "Selectable operating profiles that shape current shell behavior."
        NevexMenuScreen.Capture -> "Snapshot and recording controls that preserve the live feed."
        NevexMenuScreen.Settings -> "Startup behavior, shell visibility, sound level, and reset controls."
        NevexMenuScreen.DisplaySettings -> "XR overlays, thermal presentation, preview mode, and alignment."
        NevexMenuScreen.ThermalPresentation -> "Only live-ready thermal styles are active; future filters stay clearly marked."
        NevexMenuScreen.ThermalAlignment -> "Fine thermal placement trim for alignment and optics setup."
        NevexMenuScreen.ThermalAutoCalibration -> "Guided thermal registration with readiness guidance, calm no-solve handling, and manual-refinement handoff."
        NevexMenuScreen.SystemStatus -> "Current connection, performance, and thermal status from the existing app state."
    }
}
