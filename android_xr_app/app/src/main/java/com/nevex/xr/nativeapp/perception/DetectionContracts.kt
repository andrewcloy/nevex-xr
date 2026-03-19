package com.nevex.xr.nativeapp.perception

data class DetectionInputFrame(
    val frameId: Long? = null,
    val timestampMs: Long? = null,
    val width: Int,
    val height: Int,
    val thermalAvailable: Boolean = false,
)

enum class DetectionRuntimeMode {
    Disabled,
    BackendPreferred,
    BackendOnly,
    OnDevicePreferred,
}

enum class DetectionSource {
    Backend,
    OnDevice,
    Manual,
    Synthetic,
}

enum class TargetCategory {
    Person,
    Vehicle,
    Vessel,
    Animal,
    Hotspot,
    Unknown,
}

enum class DetectionAlertLevel {
    Silent,
    Advisory,
    Attention,
    Critical,
}

data class NormalizedBounds(
    val x: Float,
    val y: Float,
    val width: Float,
    val height: Float,
)

data class TargetDetection(
    val id: String? = null,
    val label: String,
    val category: TargetCategory = TargetCategory.Unknown,
    val confidence: Float? = null,
    val bounds: NormalizedBounds,
    val source: DetectionSource = DetectionSource.Backend,
    val alertLevel: DetectionAlertLevel = DetectionAlertLevel.Silent,
    val thermalConfirmed: Boolean = false,
)

data class DetectionFrameResult(
    val frameId: Long? = null,
    val runtimeMode: DetectionRuntimeMode = DetectionRuntimeMode.Disabled,
    val source: DetectionSource = DetectionSource.Backend,
    val modelName: String? = null,
    val inferenceLatencyMs: Float? = null,
    val targets: List<TargetDetection> = emptyList(),
)

interface DetectionProvider {
    suspend fun analyze(
        frame: DetectionInputFrame,
    ): DetectionFrameResult?
}
