package com.nevex.xr.nativeapp.calibration

enum class CalibrationBackendState(
    val wireValue: String,
) {
    WaitingForVisibleSource("waiting_for_visible_source"),
    WaitingForMotion("waiting_for_motion"),
    CollectingSamples("collecting_samples"),
    Solving("solving"),
    ResultReady("result_ready"),
    LowConfidence("low_confidence"),
    Failed("failed"),
    Unknown("unknown");

    companion object {
        fun fromWireValue(
            value: String?,
        ): CalibrationBackendState {
            return entries.firstOrNull { state ->
                state.wireValue == value?.trim()?.lowercase()
            } ?: Unknown
        }
    }
}

data class CalibrationCandidateResult(
    val ok: Boolean? = null,
    val offsetX: Float? = null,
    val offsetY: Float? = null,
    val scale: Float? = null,
    val visibleWidthPx: Int? = null,
    val visibleHeightPx: Int? = null,
    val confidence: Float? = null,
    val residualRmsePx: Float? = null,
    val matchedSampleCount: Int? = null,
    val solveValid: Boolean = false,
    val published: Boolean = false,
    val overlapReadinessState: String? = null,
    val overlapReadinessSummary: String? = null,
)

data class CalibrationOverlapReadiness(
    val state: String? = null,
    val physicallyViable: Boolean? = null,
    val blockingFactors: List<String> = emptyList(),
    val recommendedAction: String? = null,
    val summary: String? = null,
    val checks: Map<String, String> = emptyMap(),
)

data class CalibrationStatusSnapshot(
    val calibrationState: CalibrationBackendState = CalibrationBackendState.Unknown,
    val calibrationStateNote: String? = null,
    val overlapReadinessState: String? = null,
    val overlapReadiness: CalibrationOverlapReadiness? = null,
    val readinessSummary: String? = null,
    val sampleQualitySummary: String? = null,
    val matchedSampleCount: Int = 0,
    val rejectedSampleCount: Int = 0,
    val rejectedSamplesByReason: Map<String, Int> = emptyMap(),
    val solveAttemptCount: Int = 0,
    val solveSuccessCount: Int = 0,
    val solveValid: Boolean = false,
    val published: Boolean = false,
    val candidateTransform: CalibrationCandidateResult? = null,
)

data class CalibrationServiceSnapshot(
    val host: String? = null,
    val pollingEnabled: Boolean = false,
    val backendAvailable: Boolean = false,
    val healthOk: Boolean = false,
    val healthMessage: String? = null,
    val healthOverlapReadinessState: String? = null,
    val lastError: String? = null,
    val status: CalibrationStatusSnapshot = CalibrationStatusSnapshot(),
    val result: CalibrationCandidateResult? = null,
)
