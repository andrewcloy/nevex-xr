package com.nevex.xr.nativeapp.ui.overlay

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import com.nevex.xr.nativeapp.ui.theme.NevexOverlayLineMuted

private val VerticalGridFractions = listOf(0.18f, 0.34f, 0.66f, 0.82f)
private val HorizontalGridFractions = listOf(0.22f, 0.40f, 0.60f, 0.78f)

@Composable
fun GridOverlay(
    overlayOpacity: Float,
    modifier: Modifier = Modifier,
) {
    Canvas(
        modifier = modifier.fillMaxSize(),
    ) {
        val strokeWidth = size.minDimension * 0.0016f
        val lineColor = NevexOverlayLineMuted.copy(alpha = 0.52f * overlayOpacity)
        val centerGapTop = size.height * 0.43f
        val centerGapBottom = size.height * 0.57f
        val centerGapLeft = size.width * 0.43f
        val centerGapRight = size.width * 0.57f

        VerticalGridFractions.forEach { fraction ->
            val x = size.width * fraction
            drawLine(
                color = lineColor,
                start = Offset(x, 0f),
                end = Offset(x, centerGapTop),
                strokeWidth = strokeWidth,
            )
            drawLine(
                color = lineColor,
                start = Offset(x, centerGapBottom),
                end = Offset(x, size.height),
                strokeWidth = strokeWidth,
            )
        }

        HorizontalGridFractions.forEach { fraction ->
            val y = size.height * fraction
            drawLine(
                color = lineColor,
                start = Offset(0f, y),
                end = Offset(centerGapLeft, y),
                strokeWidth = strokeWidth,
            )
            drawLine(
                color = lineColor,
                start = Offset(centerGapRight, y),
                end = Offset(size.width, y),
                strokeWidth = strokeWidth,
            )
        }
    }
}
