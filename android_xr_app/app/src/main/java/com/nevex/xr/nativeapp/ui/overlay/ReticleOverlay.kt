package com.nevex.xr.nativeapp.ui.overlay

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import com.nevex.xr.nativeapp.ui.theme.NevexOverlayLine

@Composable
fun ReticleOverlay(
    overlayOpacity: Float,
    modifier: Modifier = Modifier,
) {
    Canvas(
        modifier = modifier.fillMaxSize(),
    ) {
        val center = Offset(size.width * 0.5f, size.height * 0.5f)
        val strokeWidth = size.minDimension * 0.0024f
        val armLength = size.minDimension * 0.042f
        val innerGap = size.minDimension * 0.018f
        val bracketDepth = size.minDimension * 0.010f
        val lineColor = NevexOverlayLine.copy(alpha = 0.72f * overlayOpacity)

        drawLine(
            color = lineColor,
            start = Offset(center.x - innerGap - armLength, center.y),
            end = Offset(center.x - innerGap, center.y),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Round,
        )
        drawLine(
            color = lineColor,
            start = Offset(center.x + innerGap, center.y),
            end = Offset(center.x + innerGap + armLength, center.y),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Round,
        )
        drawLine(
            color = lineColor,
            start = Offset(center.x, center.y - innerGap - armLength),
            end = Offset(center.x, center.y - innerGap),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Round,
        )
        drawLine(
            color = lineColor,
            start = Offset(center.x, center.y + innerGap),
            end = Offset(center.x, center.y + innerGap + armLength),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Round,
        )

        drawLine(
            color = lineColor,
            start = Offset(center.x - innerGap - armLength, center.y - bracketDepth),
            end = Offset(center.x - innerGap - armLength, center.y + bracketDepth),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Round,
        )
        drawLine(
            color = lineColor,
            start = Offset(center.x + innerGap + armLength, center.y - bracketDepth),
            end = Offset(center.x + innerGap + armLength, center.y + bracketDepth),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Round,
        )
        drawLine(
            color = lineColor,
            start = Offset(center.x - bracketDepth, center.y - innerGap - armLength),
            end = Offset(center.x + bracketDepth, center.y - innerGap - armLength),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Round,
        )
        drawLine(
            color = lineColor,
            start = Offset(center.x - bracketDepth, center.y + innerGap + armLength),
            end = Offset(center.x + bracketDepth, center.y + innerGap + armLength),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Round,
        )

        drawCircle(
            color = lineColor.copy(alpha = lineColor.alpha * 0.72f),
            radius = size.minDimension * 0.0034f,
            center = center,
        )
    }
}
