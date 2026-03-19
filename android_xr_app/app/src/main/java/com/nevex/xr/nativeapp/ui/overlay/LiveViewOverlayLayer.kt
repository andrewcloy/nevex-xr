package com.nevex.xr.nativeapp.ui.overlay

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.ui.state.OverlayUiState
import com.nevex.xr.nativeapp.ui.state.ThermalOverlayMode
import com.nevex.xr.nativeapp.ui.theme.NevexAccent
import com.nevex.xr.nativeapp.ui.theme.NevexPanelStrong
import com.nevex.xr.nativeapp.ui.theme.NevexTextPrimary

@Composable
fun LiveViewOverlayLayer(
    overlayUiState: OverlayUiState,
    showThermalHud: Boolean = true,
    showThermalPreviewBadge: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val masterOpacity = overlayUiState.overlayOpacity.coerceIn(0.25f, 1f)
    val thermalOpacity = overlayUiState.thermalPreviewOpacityOverride
        ?: masterOpacity

    Box(
        modifier = modifier.fillMaxSize(),
    ) {
        if (overlayUiState.thermalMode != ThermalOverlayMode.Off) {
            ThermalOverlay(
                overlayOpacity = thermalOpacity,
                thermalFrame = overlayUiState.thermalFrame,
                useRealThermal = overlayUiState.useRealThermal,
                thermalUiState = overlayUiState.thermal,
                calibrationAidActive = overlayUiState.calibrationAidActive,
                showHud = showThermalHud,
                modifier = Modifier.fillMaxSize(),
            )
        }
        if (showThermalPreviewBadge && overlayUiState.thermalPreviewModeEnabled) {
            Surface(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(start = 14.dp, top = 14.dp),
                color = NevexPanelStrong.copy(alpha = 0.78f),
                border = BorderStroke(1.dp, NevexAccent.copy(alpha = 0.58f)),
                shape = MaterialTheme.shapes.extraSmall,
            ) {
                Text(
                    text = "THERMAL PREVIEW ${overlayUiState.thermalPreviewVisiblePercent}%",
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = NevexTextPrimary,
                )
            }
        }
        if (overlayUiState.calibrationGuideVisible) {
            CalibrationGuideOverlay(
                overlayOpacity = masterOpacity,
                modifier = Modifier.fillMaxSize(),
            )
        }
        if (overlayUiState.gridEnabled) {
            GridOverlay(
                overlayOpacity = if (overlayUiState.calibrationAidActive) {
                    (masterOpacity * 0.94f).coerceAtLeast(0.58f)
                } else {
                    masterOpacity * 0.72f
                },
                modifier = Modifier.fillMaxSize(),
            )
        }
        if (overlayUiState.boundingBoxesEnabled) {
            DetectionOverlay(
                overlayOpacity = masterOpacity * 0.88f,
                detections = overlayUiState.detections,
                useRealDetections = overlayUiState.useRealDetections,
                modifier = Modifier.fillMaxSize(),
            )
        }
        if (overlayUiState.reticleEnabled) {
            ReticleOverlay(
                overlayOpacity = if (overlayUiState.calibrationAidActive) {
                    masterOpacity.coerceAtLeast(0.74f)
                } else {
                    masterOpacity
                },
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}
