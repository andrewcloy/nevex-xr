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
import com.nevex.xr.nativeapp.ui.state.NevexMenuScreen
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.state.OverlayUiState
import com.nevex.xr.nativeapp.ui.theme.NevexAccent
import com.nevex.xr.nativeapp.ui.theme.NevexBorder
import com.nevex.xr.nativeapp.ui.theme.NevexPanelStrong
import com.nevex.xr.nativeapp.ui.theme.NevexTextPrimary
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary

@Composable
fun MenuOverlayPanel(
    menuUiState: NevexMenuUiState,
    overlayUiState: OverlayUiState,
    onSelectIndex: (Int) -> Unit,
    onStartResume: () -> Unit,
    onToggleMode: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenDisplaySettings: () -> Unit,
    onOpenSystemStatus: () -> Unit,
    onReturnMain: () -> Unit,
    onReturnSettings: () -> Unit,
    onBrightnessChange: (Float) -> Unit,
    onContrastChange: (Float) -> Unit,
    onOverlayOpacityChange: (Float) -> Unit,
    onSoundVolumeChange: (Float) -> Unit,
    onReticleToggle: (Boolean) -> Unit,
    onGridToggle: (Boolean) -> Unit,
    onBoundingBoxesToggle: (Boolean) -> Unit,
    onThermalOverlayToggle: (Boolean) -> Unit,
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
            Text(
                text = "Keyboard fallback active: M, arrows, Enter, Backspace",
                style = MaterialTheme.typography.bodySmall,
                color = NevexAccent,
            )
            when (menuUiState.currentMenu) {
                NevexMenuScreen.MainMenu -> {
                    MainMenu(
                        menuUiState = menuUiState,
                        onSelectIndex = onSelectIndex,
                        onStartResume = onStartResume,
                        onToggleMode = onToggleMode,
                        onOpenSettings = onOpenSettings,
                        onOpenSystemStatus = onOpenSystemStatus,
                    )
                }

                NevexMenuScreen.Settings -> {
                    SettingsMenu(
                        menuUiState = menuUiState,
                        onSelectIndex = onSelectIndex,
                        onBrightnessChange = onBrightnessChange,
                        onContrastChange = onContrastChange,
                        onOverlayOpacityChange = onOverlayOpacityChange,
                        onSoundVolumeChange = onSoundVolumeChange,
                        onOpenDisplaySettings = onOpenDisplaySettings,
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
                        onThermalOverlayToggle = onThermalOverlayToggle,
                        onReturnSettings = onReturnSettings,
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
        NevexMenuScreen.MainMenu -> "Quick live-view controls that stay out of the central stereo image."
        NevexMenuScreen.Settings -> "Placeholder UI controls stored in ViewModel state."
        NevexMenuScreen.DisplaySettings -> "XR overlay toggles prepared for later rendering features."
        NevexMenuScreen.SystemStatus -> "Current connection and pipeline metrics from the existing app state."
    }
}
