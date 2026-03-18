package com.nevex.xr.nativeapp.ui.overlay

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.nevex.xr.nativeapp.ui.theme.NevexBackgroundDeep
import com.nevex.xr.nativeapp.ui.theme.NevexThermalHot
import com.nevex.xr.nativeapp.ui.theme.NevexThermalWarm

@Composable
fun ThermalPlaceholderOverlay(
    overlayOpacity: Float,
    modifier: Modifier = Modifier,
) {
    Canvas(
        modifier = modifier.fillMaxSize(),
    ) {
        val tintAlpha = 0.18f * overlayOpacity
        val highlightAlpha = 0.28f * overlayOpacity

        drawRect(
            brush = Brush.verticalGradient(
                colors = listOf(
                    NevexBackgroundDeep.copy(alpha = tintAlpha * 0.72f),
                    Color.Transparent,
                    NevexThermalWarm.copy(alpha = tintAlpha),
                ),
            ),
        )

        drawRect(
            brush = Brush.horizontalGradient(
                colors = listOf(
                    Color.Transparent,
                    NevexThermalWarm.copy(alpha = tintAlpha * 0.64f),
                    NevexThermalHot.copy(alpha = tintAlpha * 0.56f),
                ),
                startX = size.width * 0.50f,
                endX = size.width,
            ),
        )

        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    NevexThermalHot.copy(alpha = highlightAlpha),
                    NevexThermalWarm.copy(alpha = highlightAlpha * 0.48f),
                    Color.Transparent,
                ),
                center = Offset(size.width * 0.76f, size.height * 0.36f),
                radius = size.minDimension * 0.28f,
            ),
            radius = size.minDimension * 0.28f,
            center = Offset(size.width * 0.76f, size.height * 0.36f),
        )

        drawRoundRect(
            color = NevexThermalWarm.copy(alpha = tintAlpha * 0.62f),
            topLeft = Offset(size.width * 0.64f, size.height * 0.54f),
            size = androidx.compose.ui.geometry.Size(
                width = size.width * 0.18f,
                height = size.height * 0.16f,
            ),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(
                x = size.minDimension * 0.018f,
                y = size.minDimension * 0.018f,
            ),
        )
    }
}
