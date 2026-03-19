package com.nevex.xr.nativeapp.perception

import com.nevex.xr.nativeapp.ui.state.DetectionBox

fun DetectionFrameResult.toOverlayBoxes(): List<DetectionBox> {
    return targets.map { target ->
        DetectionBox(
            label = target.label,
            xFraction = target.bounds.x.coerceIn(0f, 1f),
            yFraction = target.bounds.y.coerceIn(0f, 1f),
            widthFraction = target.bounds.width.coerceIn(0f, 1f),
            heightFraction = target.bounds.height.coerceIn(0f, 1f),
            confidence = target.confidence,
        )
    }
}
