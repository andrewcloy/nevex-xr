package com.nevex.xr.nativeapp.thermal

import android.graphics.Bitmap

data class ThermalMetadata(
    val minCelsius: Float? = null,
    val maxCelsius: Float? = null,
    val avgCelsius: Float? = null,
    val centerCelsius: Float? = null,
    val captureFpsObserved: Float? = null,
)

data class ThermalStreamSnapshot(
    val host: String? = null,
    val streamingEnabled: Boolean = false,
    val connected: Boolean = false,
    val healthy: Boolean = false,
    val frameBitmap: Bitmap? = null,
    val metadata: ThermalMetadata? = null,
    val lastError: String? = null,
    val lastFrameAtElapsedNanos: Long? = null,
)
