package com.nevex.xr.nativeapp.perception

import android.graphics.Bitmap

enum class ThermalFilterMode {
    WhiteHot,
    BlackHot,
    WarmTargetsOnly,
    ThresholdedThermal,
    EdgeAssist,
    FusionAssist,
}

data class ThermalFilterSettings(
    val mode: ThermalFilterMode = ThermalFilterMode.WhiteHot,
    val thresholdFraction: Float = 0.72f,
    val edgeGain: Float = 0f,
    val fusionWeight: Float = 0f,
    val enabled: Boolean = false,
)

data class ThermalFilterInputFrame(
    val frameId: Long? = null,
    val timestampMs: Long? = null,
    val bitmap: Bitmap? = null,
    val width: Int = 0,
    val height: Int = 0,
)

data class ThermalFilterOutputFrame(
    val bitmap: Bitmap? = null,
    val mode: ThermalFilterMode = ThermalFilterMode.WhiteHot,
    val applied: Boolean = false,
)

interface ThermalFilterProcessor {
    suspend fun process(
        frame: ThermalFilterInputFrame,
        settings: ThermalFilterSettings,
    ): ThermalFilterOutputFrame
}
