package com.nevex.xr.nativeapp.ui.overlay

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.ui.state.DetectionBox
import com.nevex.xr.nativeapp.ui.theme.NevexBorder
import com.nevex.xr.nativeapp.ui.theme.NevexOverlayLine
import com.nevex.xr.nativeapp.ui.theme.NevexPanelStrong
import com.nevex.xr.nativeapp.ui.theme.NevexTextPrimary

// Temporary mock detections until a real AI detection feed is introduced.
private val PlaceholderDetections = listOf(
    DetectionBox(
        label = "DEMO TRACK 01",
        xFraction = 0.09f,
        yFraction = 0.18f,
        widthFraction = 0.18f,
        heightFraction = 0.17f,
    ),
    DetectionBox(
        label = "DEMO TRACK 02",
        xFraction = 0.72f,
        yFraction = 0.60f,
        widthFraction = 0.16f,
        heightFraction = 0.15f,
    ),
)

@Composable
fun DetectionOverlay(
    overlayOpacity: Float,
    detections: List<DetectionBox>,
    useRealDetections: Boolean,
    modifier: Modifier = Modifier,
) {
    val visibleDetections = if (useRealDetections && detections.isNotEmpty()) {
        detections
    } else {
        PlaceholderDetections
    }

    BoxWithConstraints(
        modifier = modifier.fillMaxSize(),
    ) {
        visibleDetections.forEach { detection ->
            val boxWidth = maxWidth * detection.widthFraction
            val boxHeight = maxHeight * detection.heightFraction
            val boxX = maxWidth * detection.xFraction
            val boxY = maxHeight * detection.yFraction

            Box(
                modifier = Modifier
                    .offset(x = boxX, y = boxY)
                    .width(boxWidth)
                    .height(boxHeight),
            ) {
                DetectionFrameCanvas(
                    overlayOpacity = overlayOpacity,
                    modifier = Modifier.fillMaxSize(),
                )
                Surface(
                    modifier = Modifier
                        .padding(start = 10.dp, top = 10.dp),
                    color = NevexPanelStrong.copy(alpha = 0.52f * overlayOpacity),
                    border = BorderStroke(1.dp, NevexBorder.copy(alpha = 0.66f * overlayOpacity)),
                    shape = MaterialTheme.shapes.extraSmall,
                ) {
                    Text(
                        text = detection.toOverlayLabel(),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = NevexTextPrimary.copy(alpha = 0.86f * overlayOpacity),
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
    }
}

@Composable
private fun DetectionFrameCanvas(
    overlayOpacity: Float,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        val strokeWidth = size.minDimension * 0.013f
        val lineLength = size.minDimension * 0.22f
        val color = NevexOverlayLine.copy(alpha = 0.64f * overlayOpacity)

        drawCornerFrame(color = color, strokeWidth = strokeWidth, lineLength = lineLength)
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawCornerFrame(
    color: Color,
    strokeWidth: Float,
    lineLength: Float,
) {
    val maxX = size.width
    val maxY = size.height

    drawLine(color, start = androidx.compose.ui.geometry.Offset(0f, 0f), end = androidx.compose.ui.geometry.Offset(lineLength, 0f), strokeWidth = strokeWidth)
    drawLine(color, start = androidx.compose.ui.geometry.Offset(0f, 0f), end = androidx.compose.ui.geometry.Offset(0f, lineLength), strokeWidth = strokeWidth)

    drawLine(color, start = androidx.compose.ui.geometry.Offset(maxX - lineLength, 0f), end = androidx.compose.ui.geometry.Offset(maxX, 0f), strokeWidth = strokeWidth)
    drawLine(color, start = androidx.compose.ui.geometry.Offset(maxX, 0f), end = androidx.compose.ui.geometry.Offset(maxX, lineLength), strokeWidth = strokeWidth)

    drawLine(color, start = androidx.compose.ui.geometry.Offset(0f, maxY - lineLength), end = androidx.compose.ui.geometry.Offset(0f, maxY), strokeWidth = strokeWidth)
    drawLine(color, start = androidx.compose.ui.geometry.Offset(0f, maxY), end = androidx.compose.ui.geometry.Offset(lineLength, maxY), strokeWidth = strokeWidth)

    drawLine(color, start = androidx.compose.ui.geometry.Offset(maxX - lineLength, maxY), end = androidx.compose.ui.geometry.Offset(maxX, maxY), strokeWidth = strokeWidth)
    drawLine(color, start = androidx.compose.ui.geometry.Offset(maxX, maxY - lineLength), end = androidx.compose.ui.geometry.Offset(maxX, maxY), strokeWidth = strokeWidth)
}

private fun DetectionBox.toOverlayLabel(): String {
    val confidencePercent = confidence?.let { value ->
        (value.coerceIn(0f, 1f) * 100f).toInt()
    }
    return if (confidencePercent != null) {
        "$label ${confidencePercent}%"
    } else {
        label
    }
}
