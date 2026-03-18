package com.nevex.xr.nativeapp.ui.overlay

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.nevex.xr.nativeapp.ui.state.OverlayUiState

@Composable
fun LiveViewOverlayLayer(
    overlayUiState: OverlayUiState,
    modifier: Modifier = Modifier,
) {
    val masterOpacity = overlayUiState.overlayOpacity.coerceIn(0.25f, 1f)

    Box(
        modifier = modifier.fillMaxSize(),
    ) {
        if (overlayUiState.thermalOverlayEnabled) {
            ThermalOverlay(
                overlayOpacity = masterOpacity,
                thermalFrame = overlayUiState.thermalFrame,
                useRealThermal = overlayUiState.useRealThermal,
                modifier = Modifier.fillMaxSize(),
            )
        }
        if (overlayUiState.gridEnabled) {
            GridOverlay(
                overlayOpacity = masterOpacity * 0.72f,
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
                overlayOpacity = masterOpacity,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}
