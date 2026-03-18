package com.nevex.xr.nativeapp.ui.overlay

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale

@Composable
fun ThermalOverlay(
    overlayOpacity: Float,
    thermalFrame: Bitmap?,
    useRealThermal: Boolean,
    modifier: Modifier = Modifier,
) {
    if (!useRealThermal || thermalFrame == null) {
        ThermalPlaceholderOverlay(
            overlayOpacity = overlayOpacity,
            modifier = modifier,
        )
        return
    }

    val thermalImageBitmap = remember(thermalFrame) {
        thermalFrame.asImageBitmap()
    }

    Box(
        modifier = modifier.fillMaxSize(),
    ) {
        Image(
            bitmap = thermalImageBitmap,
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.FillBounds,
            alpha = (overlayOpacity * 0.44f).coerceIn(0.12f, 0.52f),
        )
    }
}
