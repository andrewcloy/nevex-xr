package com.nevex.xr.nativeapp.ui.overlay

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.ui.state.ThermalOverlayUiState
import com.nevex.xr.nativeapp.ui.state.ThermalVisualMode
import com.nevex.xr.nativeapp.ui.theme.NevexBackgroundDeep
import com.nevex.xr.nativeapp.ui.theme.NevexThermalHot
import com.nevex.xr.nativeapp.ui.theme.NevexThermalWarm
import kotlin.math.min

private const val THERMAL_DISPLAY_ROTATION_DEGREES = 90f

@Composable
fun ThermalOverlay(
    overlayOpacity: Float,
    thermalFrame: Bitmap?,
    useRealThermal: Boolean,
    thermalUiState: ThermalOverlayUiState,
    modifier: Modifier = Modifier,
    calibrationAidActive: Boolean = false,
    showHud: Boolean = true,
) {
    val density = LocalDensity.current
    val transform = thermalUiState.transform

    BoxWithConstraints(
        modifier = modifier.fillMaxSize(),
    ) {
        val widthPx = with(density) { maxWidth.toPx() }
        val heightPx = with(density) { maxHeight.toPx() }
        val displayRotationScale = computeQuarterTurnFitScale(
            widthPx = widthPx,
            heightPx = heightPx,
        )
        val displayRotatedModifier = Modifier
            .fillMaxSize()
            .graphicsLayer {
                clip = true
                rotationZ = THERMAL_DISPLAY_ROTATION_DEGREES
                scaleX = displayRotationScale
                scaleY = displayRotationScale
            }
        val transformedThermalModifier = Modifier
            .fillMaxSize()
            .graphicsLayer {
                // Crop fractions are reserved for future registration work.
                clip = true
                scaleX = transform.scale
                scaleY = transform.scale
                translationX = transform.offsetXFraction * widthPx
                translationY = transform.offsetYFraction * heightPx
            }

        Box(modifier = displayRotatedModifier) {
            if (!useRealThermal || thermalFrame == null) {
                ThermalPlaceholderOverlay(
                    overlayOpacity = if (calibrationAidActive) {
                        (overlayOpacity * 1.08f).coerceIn(0.32f, 1f)
                    } else {
                        overlayOpacity
                    },
                    modifier = transformedThermalModifier,
                )
            } else {
                LiveThermalImageLayer(
                    overlayOpacity = overlayOpacity,
                    thermalFrame = thermalFrame,
                    thermalUiState = thermalUiState,
                    calibrationAidActive = calibrationAidActive,
                    modifier = transformedThermalModifier,
                )
            }
        }

        if (showHud) {
            ThermalHudOverlay(
                thermalUiState = thermalUiState,
                overlayOpacity = overlayOpacity,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 18.dp, end = 18.dp),
            )
        }
    }
}

@Composable
private fun LiveThermalImageLayer(
    overlayOpacity: Float,
    thermalFrame: Bitmap,
    thermalUiState: ThermalOverlayUiState,
    calibrationAidActive: Boolean,
    modifier: Modifier = Modifier,
) {
    val thermalImageBitmap = remember(thermalFrame) {
        thermalFrame.asImageBitmap()
    }
    val colorFilter = remember(thermalUiState.visualMode, calibrationAidActive) {
        thermalColorFilter(
            visualMode = thermalUiState.visualMode,
            calibrationAidActive = calibrationAidActive,
        )
    }
    val imageAlpha = if (calibrationAidActive) {
        (overlayOpacity * 0.60f).coerceIn(0.22f, 0.66f)
    } else {
        (overlayOpacity * 0.50f).coerceIn(0.16f, 0.58f)
    }

    Box(
        modifier = modifier.fillMaxSize(),
    ) {
        Image(
            bitmap = thermalImageBitmap,
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Fit,
            alpha = imageAlpha,
            colorFilter = colorFilter,
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            NevexBackgroundDeep.copy(alpha = overlayOpacity * 0.10f),
                            Color.Transparent,
                            NevexThermalWarm.copy(alpha = overlayOpacity * 0.07f),
                        ),
                    ),
                ),
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Color.Transparent,
                            Color.Transparent,
                            Color.Black.copy(alpha = overlayOpacity * 0.10f),
                        ),
                    ),
                ),
        )

        if (thermalUiState.visualMode == ThermalVisualMode.BlackHot) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                Color.White.copy(alpha = overlayOpacity * 0.04f),
                                Color.White.copy(alpha = overlayOpacity * 0.06f),
                            ),
                        ),
                    ),
            )
        }
    }
}

private fun computeQuarterTurnFitScale(
    widthPx: Float,
    heightPx: Float,
): Float {
    if (widthPx <= 0f || heightPx <= 0f) {
        return 1f
    }
    return min(widthPx / heightPx, heightPx / widthPx)
}

private fun thermalColorFilter(
    visualMode: ThermalVisualMode,
    calibrationAidActive: Boolean,
): ColorFilter {
    return when (visualMode) {
        ThermalVisualMode.WhiteHot -> {
            val gain = if (calibrationAidActive) 1.24f else 1.16f
            val bias = if (calibrationAidActive) -12f else -10f
            ColorFilter.colorMatrix(
                ColorMatrix(
                    floatArrayOf(
                        gain, 0f, 0f, 0f, bias,
                        0f, gain, 0f, 0f, bias,
                        0f, 0f, gain, 0f, bias,
                        0f, 0f, 0f, 1f, 0f,
                    ),
                ),
            )
        }

        ThermalVisualMode.BlackHot -> {
            val gain = if (calibrationAidActive) -1.18f else -1.12f
            val bias = if (calibrationAidActive) 286f else 278f
            ColorFilter.colorMatrix(
                ColorMatrix(
                    floatArrayOf(
                        gain, 0f, 0f, 0f, bias,
                        0f, gain, 0f, 0f, bias,
                        0f, 0f, gain, 0f, bias,
                        0f, 0f, 0f, 1f, 0f,
                    ),
                ),
            )
        }
    }
}
