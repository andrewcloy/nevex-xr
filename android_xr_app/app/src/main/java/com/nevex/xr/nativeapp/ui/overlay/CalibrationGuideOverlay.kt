package com.nevex.xr.nativeapp.ui.overlay

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import com.nevex.xr.nativeapp.ui.theme.NevexAccent
import com.nevex.xr.nativeapp.ui.theme.NevexOverlayLine

@Composable
fun CalibrationGuideOverlay(
    overlayOpacity: Float,
    modifier: Modifier = Modifier,
) {
    Canvas(
        modifier = modifier.fillMaxSize(),
    ) {
        val guideWidth = size.width * 0.34f
        val guideHeight = size.height * 0.34f
        val left = (size.width - guideWidth) * 0.5f
        val top = (size.height - guideHeight) * 0.5f
        val guideRect = Rect(
            offset = Offset(left, top),
            size = Size(guideWidth, guideHeight),
        )
        val strokeWidth = size.minDimension * 0.0045f
        val cornerLength = size.minDimension * 0.055f
        val borderColor = NevexOverlayLine.copy(alpha = 0.70f * overlayOpacity)
        val accentColor = NevexAccent.copy(alpha = 0.28f * overlayOpacity)
        val shadeColor = Color.Black.copy(alpha = 0.12f * overlayOpacity)

        drawRect(
            color = shadeColor,
            topLeft = Offset(0f, 0f),
            size = Size(size.width, guideRect.top),
        )
        drawRect(
            color = shadeColor,
            topLeft = Offset(0f, guideRect.bottom),
            size = Size(size.width, size.height - guideRect.bottom),
        )
        drawRect(
            color = shadeColor,
            topLeft = Offset(0f, guideRect.top),
            size = Size(guideRect.left, guideRect.height),
        )
        drawRect(
            color = shadeColor,
            topLeft = Offset(guideRect.right, guideRect.top),
            size = Size(size.width - guideRect.right, guideRect.height),
        )

        drawRect(
            color = accentColor,
            topLeft = guideRect.topLeft,
            size = guideRect.size,
            style = Stroke(width = strokeWidth),
        )

        drawGuideCorners(
            rect = guideRect,
            color = borderColor,
            strokeWidth = strokeWidth * 1.2f,
            cornerLength = cornerLength,
        )
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawGuideCorners(
    rect: Rect,
    color: Color,
    strokeWidth: Float,
    cornerLength: Float,
) {
    val left = rect.left
    val right = rect.right
    val top = rect.top
    val bottom = rect.bottom

    drawLine(color, Offset(left, top), Offset(left + cornerLength, top), strokeWidth)
    drawLine(color, Offset(left, top), Offset(left, top + cornerLength), strokeWidth)

    drawLine(color, Offset(right - cornerLength, top), Offset(right, top), strokeWidth)
    drawLine(color, Offset(right, top), Offset(right, top + cornerLength), strokeWidth)

    drawLine(color, Offset(left, bottom - cornerLength), Offset(left, bottom), strokeWidth)
    drawLine(color, Offset(left, bottom), Offset(left + cornerLength, bottom), strokeWidth)

    drawLine(color, Offset(right - cornerLength, bottom), Offset(right, bottom), strokeWidth)
    drawLine(color, Offset(right, bottom - cornerLength), Offset(right, bottom), strokeWidth)
}
