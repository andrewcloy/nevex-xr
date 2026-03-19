package com.nevex.xr.nativeapp.ui

import android.content.Context
import android.graphics.Bitmap
import android.os.SystemClock
import android.util.Log
import android.view.KeyEvent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nevex.xr.nativeapp.PresenterExperimentMode
import com.nevex.xr.nativeapp.capture.SnapshotStore
import com.nevex.xr.nativeapp.calibration.CalibrationBackendState
import com.nevex.xr.nativeapp.calibration.CalibrationCandidateResult
import com.nevex.xr.nativeapp.calibration.CalibrationRepository
import com.nevex.xr.nativeapp.calibration.CalibrationServiceSnapshot
import com.nevex.xr.nativeapp.perception.DetectionFrameResult
import com.nevex.xr.nativeapp.perception.DetectionSource
import com.nevex.xr.nativeapp.perception.toOverlayBoxes
import com.nevex.xr.nativeapp.settings.OperatorPreferencesSnapshot
import com.nevex.xr.nativeapp.settings.OperatorPreferencesStore
import com.nevex.xr.nativeapp.settings.PersistedViewingMode
import com.nevex.xr.nativeapp.settings.ViewingPreferencesStore
import com.nevex.xr.nativeapp.stream.BitmapReuseStats
import com.nevex.xr.nativeapp.stream.JetsonEndpoint
import com.nevex.xr.nativeapp.stream.JetsonLifecycle
import com.nevex.xr.nativeapp.stream.JetsonStreamRepository
import com.nevex.xr.nativeapp.stream.StereoEyeFramePresentedEvent
import com.nevex.xr.nativeapp.stream.StereoEyePresenterReceiveEvent
import com.nevex.xr.nativeapp.stream.StereoFrameLayoutHint
import com.nevex.xr.nativeapp.thermal.ThermalCalibrationStore
import com.nevex.xr.nativeapp.thermal.ThermalMetadata
import com.nevex.xr.nativeapp.thermal.ThermalRepository
import com.nevex.xr.nativeapp.thermal.ThermalStreamSnapshot
import com.nevex.xr.nativeapp.ui.audio.NoOpSoundManager
import com.nevex.xr.nativeapp.ui.audio.SoundManager
import com.nevex.xr.nativeapp.ui.audio.createSoundManager
import com.nevex.xr.nativeapp.ui.state.BootSequencePhase
import com.nevex.xr.nativeapp.ui.state.BootSequenceUiState
import com.nevex.xr.nativeapp.ui.state.CalibrationMode
import com.nevex.xr.nativeapp.ui.state.CaptureFeedbackTone
import com.nevex.xr.nativeapp.ui.state.CaptureFeedbackUiState
import com.nevex.xr.nativeapp.ui.state.CaptureShellUiState
import com.nevex.xr.nativeapp.ui.state.DisplaySettingsUiState
import com.nevex.xr.nativeapp.ui.state.DetectionBox
import com.nevex.xr.nativeapp.ui.state.MenuSelectionIndex
import com.nevex.xr.nativeapp.ui.state.MissionProfile
import com.nevex.xr.nativeapp.ui.state.NevexMenuScreen
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.state.OverlayUiState
import com.nevex.xr.nativeapp.ui.state.SystemStatusMenuUiState
import com.nevex.xr.nativeapp.ui.state.ThermalAlignmentAdjustmentMode
import com.nevex.xr.nativeapp.ui.state.ThermalCalibrationStatus
import com.nevex.xr.nativeapp.ui.state.ThermalOverlayMode
import com.nevex.xr.nativeapp.ui.state.ThermalOverlayTransform
import com.nevex.xr.nativeapp.ui.state.ThermalOverlayUiState
import com.nevex.xr.nativeapp.ui.state.ThermalPreviewOpacityPreset
import com.nevex.xr.nativeapp.ui.state.ThermalRuntimeState
import com.nevex.xr.nativeapp.ui.state.ThermalVisualMode
import com.nevex.xr.nativeapp.ui.state.ViewingMode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale
import kotlin.math.absoluteValue

private const val DEFAULT_PERFORMANCE_INSTRUMENTATION_ENABLED = true
private const val THERMAL_STALE_THRESHOLD_NANOS = 1_200_000_000L
private const val THERMAL_STATUS_PULSE_INTERVAL_MS = 1_000L
private const val THERMAL_ALIGNMENT_OFFSET_LIMIT = 0.25f
private const val THERMAL_ALIGNMENT_SCALE_MIN = 0.75f
private const val THERMAL_ALIGNMENT_SCALE_MAX = 1.25f
private const val THERMAL_ALIGNMENT_COMPARISON_EPSILON = 0.0005f
private const val AUTO_CALIBRATION_BACKEND_GRACE_MS = 1_500L
private const val AUTO_CALIBRATION_WAITING_DURATION_MS = 1_200L
private const val AUTO_CALIBRATION_CAPTURING_DURATION_MS = 3_000L
private const val AUTO_CALIBRATION_PROCESSING_DURATION_MS = 900L
private const val AUTO_CALIBRATION_PROGRESS_TICK_MS = 50L
private const val AUTO_CALIBRATION_OFFSET_X_DELTA = 0.012f
private const val AUTO_CALIBRATION_OFFSET_Y_DELTA = -0.008f
private const val AUTO_CALIBRATION_SCALE_DELTA = 0.010f
private const val CALIBRATION_MIN_MATCHED_SAMPLES = 8
private const val CALIBRATION_MIN_CONFIDENCE = 0.10f
private const val CALIBRATION_MAX_RMSE_PX = 120f
private const val CALIBRATION_SCALE_MIN_ACCEPT = 0.75f
private const val CALIBRATION_SCALE_MAX_ACCEPT = 1.25f
private const val CALIBRATION_OFFSET_MAX_ACCEPT_FRACTION = 0.25f
private const val CAPTURE_FEEDBACK_DURATION_MS = 1_500L

private enum class AutoCalibrationSessionSource {
    None,
    Backend,
    Fallback,
}

data class NevexXrUiState(
    val endpointHost: String,
    val endpointUrl: String,
    val lifecycle: JetsonLifecycle,
    val lifecycleText: String,
    val statusText: String,
    val senderName: String?,
    val connected: Boolean,
    val hasLiveFrame: Boolean,
    val sourceHealthText: String,
    val lastMessageTypeText: String,
    val lastMessageSizeText: String,
    val diagnosticsVisible: Boolean,
    val errorMessage: String?,
    val canDisconnect: Boolean,
    val isHealthy: Boolean,
    val performanceInstrumentationEnabled: Boolean,
    val presenterExperimentMode: PresenterExperimentMode,
    val presenterExperimentModeText: String,
)

data class NevexFrameUiState(
    val frameId: Long?,
    val receivedAtElapsedNanos: Long?,
    val decodedAtElapsedNanos: Long?,
    val layoutHint: StereoFrameLayoutHint,
    val receiveFpsText: String,
    val lastFrameIdText: String,
    val framePayloadSizeText: String,
    val decodeTimeText: String,
    val bitmapUpdateTimeText: String,
    val bitmapReuseText: String,
    val presentationFpsText: String,
    val presentationLatencyText: String,
    val receiveToPresentationLatencyText: String,
    val droppedFramesText: String,
    val queueDropsText: String,
    val lagFramesText: String,
)

data class NevexPresentationTraceUiState(
    val frameId: Long?,
    val receivedAtElapsedNanos: Long?,
    val decodedAtElapsedNanos: Long?,
)

data class NevexEyeBitmapUiState(
    val frameId: Long?,
    val bitmap: Bitmap?,
    val receivedAtElapsedNanos: Long?,
    val decodedAtElapsedNanos: Long?,
    val frameStatePublishedAtElapsedNanos: Long?,
    val preDecodeQueueWaitNanos: Long?,
    val decodeIdleGapNanos: Long?,
    val bitmapIdentityHash: Int?,
    val peerBitmapIdentityHash: Int?,
    val independentFrameData: Boolean,
)

private data class ThermalOverlayBinding(
    val frameBitmap: Bitmap?,
    val useRealThermal: Boolean,
    val presentation: ThermalOverlayUiState,
)

private data class AutoCalibrationUiDescriptor(
    val mode: CalibrationMode,
    val progress: Float,
    val completionSummary: String,
    val guidanceText: String? = null,
    val readinessText: String? = null,
    val overlapReadinessState: String? = null,
    val overlapPhysicallyViable: Boolean? = null,
    val overlapRecommendedAction: String? = null,
    val overlapBlockingFactors: List<String> = emptyList(),
    val sampleQualitySummary: String? = null,
    val matchedSampleCount: Int? = null,
    val rejectedSampleCount: Int? = null,
    val backendStateLabel: String? = null,
    val usingBackend: Boolean = false,
    val fallbackActive: Boolean = false,
)

private data class CalibrationAcceptanceDecision(
    val accepted: Boolean,
    val reason: String,
    val normalizedOffsetXFraction: Float? = null,
    val normalizedOffsetYFraction: Float? = null,
    val scale: Float? = null,
)

private data class MissionProfileDefaults(
    val preferredViewingMode: ViewingMode,
    val reticleEnabled: Boolean,
    val gridEnabled: Boolean,
    val boundingBoxesEnabled: Boolean,
    val thermalVisualMode: ThermalVisualMode,
    val thermalPreviewOpacityPreset: ThermalPreviewOpacityPreset,
    val soundVolume: Float,
)

class NevexXrViewModel : ViewModel() {
    private val defaultEndpoint = JetsonEndpoint()
    private val repository = JetsonStreamRepository()
    private val calibrationRepository = CalibrationRepository()
    private val thermalRepository = ThermalRepository()
    private var soundManager: SoundManager = NoOpSoundManager
    private var snapshotStore: SnapshotStore? = null
    private var thermalCalibrationStore: ThermalCalibrationStore? = null
    private var viewingPreferencesStore: ViewingPreferencesStore? = null
    private var operatorPreferencesStore: OperatorPreferencesStore? = null
    private var soundManagerInitialized = false
    private val endpointHost = MutableStateFlow(defaultEndpoint.host)
    private val diagnosticsVisible = MutableStateFlow(false)
    private val performanceInstrumentationEnabled = MutableStateFlow(
        DEFAULT_PERFORMANCE_INSTRUMENTATION_ENABLED,
    )
    private val presenterExperimentMode = MutableStateFlow(PresenterExperimentMode.NormalBitmap)
    private val menuState = MutableStateFlow(NevexMenuUiState())
    private val detectionsState = MutableStateFlow<List<DetectionBox>>(emptyList())
    private val thermalFrameState = MutableStateFlow<Bitmap?>(null)
    private val useRealDetections = MutableStateFlow(false)
    private val useRealThermal = MutableStateFlow(false)
    private val thermalPresentationState = MutableStateFlow(ThermalOverlayUiState())
    private val thermalTransformState = MutableStateFlow(ThermalOverlayTransform())
    private val thermalStatusPulseNanos = MutableStateFlow(SystemClock.elapsedRealtimeNanos())
    private val operatorPreferencesLoaded = MutableStateFlow(false)
    private val bootSequenceState = MutableStateFlow(BootSequenceUiState())
    private val recordingActiveState = MutableStateFlow(false)
    private val lastSnapshotSavedAtMs = MutableStateFlow<Long?>(null)
    private val captureFeedbackState = MutableStateFlow<CaptureFeedbackUiState?>(null)
    private var bootSequenceStarted = false
    private var autoCalibrationJob: Job? = null
    private var captureFeedbackJob: Job? = null
    private var autoCalibrationSessionSource = AutoCalibrationSessionSource.None
    private var lastHandledCalibrationFingerprint: String? = null

    init {
        repository.setInstrumentationEnabled(performanceInstrumentationEnabled.value)
        repository.setPresenterExperimentMode(presenterExperimentMode.value)
        syncThermalConfiguration()
        startThermalStatusPulse()
        observeThermalState()
        observeCalibrationConfiguration()
        observeCalibrationBackend()
        observeConnectionAudio()
    }

    val uiState: StateFlow<NevexXrUiState> = combine(
        repository.snapshot,
        endpointHost,
        diagnosticsVisible,
        performanceInstrumentationEnabled,
        presenterExperimentMode,
    ) { snapshot, host, isDiagnosticsVisible, isPerformanceInstrumentationEnabled, currentPresenterExperimentMode ->
        val endpoint = snapshot.endpoint.copy(host = host.trim().ifEmpty { defaultEndpoint.host })
        NevexXrUiState(
            endpointHost = host,
            endpointUrl = endpoint.toWebSocketUrl(),
            lifecycle = snapshot.lifecycle,
            lifecycleText = snapshot.lifecycleText,
            statusText = snapshot.statusText,
            senderName = snapshot.senderName,
            connected = snapshot.connected,
            hasLiveFrame = snapshot.hasLiveFrame,
            sourceHealthText = snapshot.sourceHealthText,
            lastMessageTypeText = snapshot.lastMessageType ?: "--",
            lastMessageSizeText = snapshot.lastMessageSizeBytes?.let(::formatByteCount) ?: "--",
            diagnosticsVisible = isDiagnosticsVisible || snapshot.lastError != null,
            errorMessage = snapshot.lastError,
            canDisconnect = snapshot.connected || snapshot.lifecycle == JetsonLifecycle.Connecting,
            isHealthy = snapshot.isHealthy,
            performanceInstrumentationEnabled = isPerformanceInstrumentationEnabled,
            presenterExperimentMode = currentPresenterExperimentMode,
            presenterExperimentModeText = currentPresenterExperimentMode.diagnosticsLabel,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = NevexXrUiState(
            endpointHost = defaultEndpoint.host,
            endpointUrl = defaultEndpoint.toWebSocketUrl(),
            lifecycle = JetsonLifecycle.Idle,
            lifecycleText = "Ready to connect",
            statusText = "Enter the Jetson host to begin.",
            senderName = null,
            connected = false,
            hasLiveFrame = false,
            sourceHealthText = "Idle",
            lastMessageTypeText = "--",
            lastMessageSizeText = "--",
            diagnosticsVisible = false,
            errorMessage = null,
            canDisconnect = false,
            isHealthy = false,
            performanceInstrumentationEnabled = DEFAULT_PERFORMANCE_INSTRUMENTATION_ENABLED,
            presenterExperimentMode = PresenterExperimentMode.NormalBitmap,
            presenterExperimentModeText = PresenterExperimentMode.NormalBitmap.diagnosticsLabel,
        ),
    )

    val frameUiState: StateFlow<NevexFrameUiState> = repository.frameState
        .combine(performanceInstrumentationEnabled) { frameState, isPerformanceInstrumentationEnabled ->
            NevexFrameUiState(
                frameId = frameState.frameId,
                receivedAtElapsedNanos = frameState.receivedAtElapsedNanos,
                decodedAtElapsedNanos = frameState.decodedAtElapsedNanos,
                layoutHint = frameState.layoutHint,
                receiveFpsText = frameState.receiveFps?.let { fps ->
                    String.format(Locale.US, "%.1f FPS", fps)
                } ?: "--",
                lastFrameIdText = frameState.frameId?.toString() ?: "--",
                framePayloadSizeText = frameState.messageSizeBytes?.let(::formatByteCount) ?: "--",
                decodeTimeText = if (isPerformanceInstrumentationEnabled) {
                    frameState.decodeTimeMs?.let(::formatMilliseconds) ?: "--"
                } else {
                    "Off"
                },
                bitmapUpdateTimeText = if (isPerformanceInstrumentationEnabled) {
                    frameState.bitmapUpdateTimeMs?.let(::formatMilliseconds) ?: "--"
                } else {
                    "Off"
                },
                bitmapReuseText = if (isPerformanceInstrumentationEnabled) {
                    formatBitmapReuse(frameState.bitmapReuseStats)
                } else {
                    "Off"
                },
                presentationFpsText = if (isPerformanceInstrumentationEnabled) {
                    frameState.presentationFps?.let { fps ->
                        String.format(Locale.US, "%.1f FPS", fps)
                    } ?: "--"
                } else {
                    "Off"
                },
                presentationLatencyText = if (isPerformanceInstrumentationEnabled) {
                    frameState.presentationLatencyMs?.let(::formatMilliseconds) ?: "--"
                } else {
                    "Off"
                },
                receiveToPresentationLatencyText = if (isPerformanceInstrumentationEnabled) {
                    frameState.receiveToPresentationLatencyMs?.let(::formatMilliseconds) ?: "--"
                } else {
                    "Off"
                },
                droppedFramesText = frameState.droppedFrameCount.toString(),
                queueDropsText = frameState.queuedFrameDropCount.toString(),
                lagFramesText = if (isPerformanceInstrumentationEnabled) {
                    frameState.presentationLagFrameCount.toString()
                } else {
                    "Off"
                },
            )
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = NevexFrameUiState(
                frameId = null,
                receivedAtElapsedNanos = null,
                decodedAtElapsedNanos = null,
                layoutHint = StereoFrameLayoutHint.DualEyeBitmaps,
                receiveFpsText = "--",
                lastFrameIdText = "--",
                framePayloadSizeText = "--",
                decodeTimeText = if (DEFAULT_PERFORMANCE_INSTRUMENTATION_ENABLED) "--" else "Off",
                bitmapUpdateTimeText = if (DEFAULT_PERFORMANCE_INSTRUMENTATION_ENABLED) "--" else "Off",
                bitmapReuseText = if (DEFAULT_PERFORMANCE_INSTRUMENTATION_ENABLED) {
                    "Warming (0 decodes)"
                } else {
                    "Off"
                },
                presentationFpsText = if (DEFAULT_PERFORMANCE_INSTRUMENTATION_ENABLED) "--" else "Off",
                presentationLatencyText = if (DEFAULT_PERFORMANCE_INSTRUMENTATION_ENABLED) "--" else "Off",
                receiveToPresentationLatencyText = if (DEFAULT_PERFORMANCE_INSTRUMENTATION_ENABLED) {
                    "--"
                } else {
                    "Off"
                },
                droppedFramesText = "0",
                queueDropsText = "0",
                lagFramesText = if (DEFAULT_PERFORMANCE_INSTRUMENTATION_ENABLED) "0" else "Off",
            ),
        )

    val presentationTraceUiState: StateFlow<NevexPresentationTraceUiState> = repository.frameState
        .map { frameState ->
            NevexPresentationTraceUiState(
                frameId = frameState.frameId,
                receivedAtElapsedNanos = frameState.receivedAtElapsedNanos,
                decodedAtElapsedNanos = frameState.decodedAtElapsedNanos,
            )
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = NevexPresentationTraceUiState(
                frameId = null,
                receivedAtElapsedNanos = null,
                decodedAtElapsedNanos = null,
            ),
        )

    val leftEyeUiState: StateFlow<NevexEyeBitmapUiState> = repository.frameState
        .map { frameState ->
            NevexEyeBitmapUiState(
                frameId = frameState.frameId,
                bitmap = frameState.leftBitmap,
                receivedAtElapsedNanos = frameState.receivedAtElapsedNanos,
                decodedAtElapsedNanos = frameState.decodedAtElapsedNanos,
                frameStatePublishedAtElapsedNanos = frameState.frameStatePublishedAtElapsedNanos,
                preDecodeQueueWaitNanos = frameState.preDecodeQueueWaitNanos,
                decodeIdleGapNanos = frameState.decodeIdleGapNanos,
                bitmapIdentityHash = frameState.leftBitmap?.let { bitmap ->
                    System.identityHashCode(bitmap)
                },
                peerBitmapIdentityHash = frameState.rightBitmap?.let { bitmap ->
                    System.identityHashCode(bitmap)
                },
                independentFrameData = frameState.leftBitmap != null &&
                    frameState.rightBitmap != null &&
                    frameState.leftBitmap !== frameState.rightBitmap,
            )
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = NevexEyeBitmapUiState(
                frameId = null,
                bitmap = null,
                receivedAtElapsedNanos = null,
                decodedAtElapsedNanos = null,
                frameStatePublishedAtElapsedNanos = null,
                preDecodeQueueWaitNanos = null,
                decodeIdleGapNanos = null,
                bitmapIdentityHash = null,
                peerBitmapIdentityHash = null,
                independentFrameData = false,
            ),
        )

    val rightEyeUiState: StateFlow<NevexEyeBitmapUiState> = repository.frameState
        .map { frameState ->
            NevexEyeBitmapUiState(
                frameId = frameState.frameId,
                bitmap = frameState.rightBitmap,
                receivedAtElapsedNanos = frameState.receivedAtElapsedNanos,
                decodedAtElapsedNanos = frameState.decodedAtElapsedNanos,
                frameStatePublishedAtElapsedNanos = frameState.frameStatePublishedAtElapsedNanos,
                preDecodeQueueWaitNanos = frameState.preDecodeQueueWaitNanos,
                decodeIdleGapNanos = frameState.decodeIdleGapNanos,
                bitmapIdentityHash = frameState.rightBitmap?.let { bitmap ->
                    System.identityHashCode(bitmap)
                },
                peerBitmapIdentityHash = frameState.leftBitmap?.let { bitmap ->
                    System.identityHashCode(bitmap)
                },
                independentFrameData = frameState.leftBitmap != null &&
                    frameState.rightBitmap != null &&
                    frameState.leftBitmap !== frameState.rightBitmap,
            )
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = NevexEyeBitmapUiState(
                frameId = null,
                bitmap = null,
                receivedAtElapsedNanos = null,
                decodedAtElapsedNanos = null,
                frameStatePublishedAtElapsedNanos = null,
                preDecodeQueueWaitNanos = null,
                decodeIdleGapNanos = null,
                bitmapIdentityHash = null,
                peerBitmapIdentityHash = null,
                independentFrameData = false,
            ),
        )

    val menuUiState: StateFlow<NevexMenuUiState> = combine(
        uiState,
        frameUiState,
        menuState,
        thermalPresentationState,
    ) { currentUiState, currentFrameUiState, currentMenuState, thermalPresentation ->
        currentMenuState.copy(
            isMenuVisible = currentMenuState.isMenuVisible,
            isMenuAvailable = true,
            systemStatus = SystemStatusMenuUiState(
                connectionStatus = if (currentUiState.connected) "Connected" else "Disconnected",
                frameRate = currentFrameUiState.presentationFpsText
                    .takeUnless { it == "--" || it == "Off" }
                    ?: currentFrameUiState.receiveFpsText,
                latency = currentFrameUiState.receiveToPresentationLatencyText
                    .takeUnless { it == "--" || it == "Off" }
                    ?: currentFrameUiState.presentationLatencyText,
                sensorStatus = buildSensorStatus(
                    thermalMode = currentMenuState.displaySettings.effectiveThermalMode(),
                    thermalPresentation = thermalPresentation,
                ),
                thermalStatus = formatThermalStatusLine(thermalPresentation),
                thermalRange = thermalPresentation.rangeText,
                thermalCenter = thermalPresentation.centerText,
                thermalCaptureFps = thermalPresentation.captureFpsText,
            ),
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = NevexMenuUiState(),
    )

    val overlayUiState: StateFlow<OverlayUiState> = combine(
        menuState,
        detectionsState,
        thermalFrameState,
        useRealDetections,
        useRealThermal,
    ) { currentMenuState, currentDetections, currentThermalFrame, currentUseRealDetections, currentUseRealThermal ->
            val calibrationAidActive = currentMenuState.currentMenu == NevexMenuScreen.ThermalAlignment ||
                currentMenuState.currentMenu == NevexMenuScreen.ThermalAutoCalibration
            val calibrationGuideVisible = currentMenuState.currentMenu == NevexMenuScreen.ThermalAutoCalibration &&
                currentMenuState.thermalAlignment.autoCalibration.mode != CalibrationMode.Complete
            val thermalPreviewModeEnabled = currentMenuState.displaySettings.thermalPreviewModeEnabled
            val thermalPreviewOpacityPreset = currentMenuState.displaySettings.thermalPreviewOpacityPreset
            val effectiveThermalMode = currentMenuState.displaySettings.effectiveThermalMode()
            OverlayUiState(
                reticleEnabled = currentMenuState.displaySettings.reticleEnabled || calibrationAidActive,
                gridEnabled = currentMenuState.displaySettings.gridEnabled || calibrationAidActive,
                boundingBoxesEnabled = currentMenuState.displaySettings.boundingBoxesEnabled &&
                    !calibrationAidActive,
                thermalMode = effectiveThermalMode,
                hideVisibleFeed = currentMenuState.displaySettings.primaryViewingMode() == ViewingMode.ThermalOnly,
                thermalPreviewModeEnabled = thermalPreviewModeEnabled,
                thermalPreviewOpacityOverride = if (effectiveThermalMode != ThermalOverlayMode.Off) {
                    thermalPreviewOpacityPreset.overlayOpacity
                } else {
                    null
                },
                thermalPreviewVisiblePercent = thermalPreviewOpacityPreset.visiblePercent,
                overlayOpacity = currentMenuState.settings.overlayOpacity,
                brightness = currentMenuState.settings.brightness,
                contrast = currentMenuState.settings.contrast,
                detections = currentDetections,
                thermalFrame = currentThermalFrame,
                useRealDetections = currentUseRealDetections,
                useRealThermal = currentUseRealThermal,
                thermal = thermalPresentationState.value,
                calibrationAidActive = calibrationAidActive,
                calibrationGuideVisible = calibrationGuideVisible,
            )
        }
        .combine(thermalPresentationState) { currentOverlayUiState, currentThermalPresentation ->
            currentOverlayUiState.copy(thermal = currentThermalPresentation)
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = OverlayUiState(),
        )

    val bootSequenceUiState: StateFlow<BootSequenceUiState> = bootSequenceState

    val operatorPreferencesReady: StateFlow<Boolean> = operatorPreferencesLoaded
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = false,
        )

    val captureShellUiState: StateFlow<CaptureShellUiState> = combine(
        recordingActiveState,
        lastSnapshotSavedAtMs,
        captureFeedbackState,
    ) { recordingActive, savedAtMs, feedback ->
        CaptureShellUiState(
            recordingActive = recordingActive,
            lastSnapshotSavedAtMs = savedAtMs,
            lastSnapshotLabel = savedAtMs?.let(::formatCaptureTimestamp) ?: "No snapshot yet",
            feedback = feedback,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = CaptureShellUiState(),
    )

    fun onEndpointHostChanged(value: String) {
        endpointHost.value = value
        syncThermalConfiguration()
    }

    fun preparePreviewBootMode(host: String?) {
        val normalizedHost = host
            ?.trim()
            ?.takeIf { value -> value.isNotEmpty() }

        if (normalizedHost != null && endpointHost.value != normalizedHost) {
            endpointHost.value = normalizedHost
        }

        menuState.update { currentState ->
            currentState.copy(
                isMenuVisible = false,
                currentMenu = NevexMenuScreen.MainMenu,
                selectedItemIndex = MenuSelectionIndex.Main.ViewingMode,
                displaySettings = currentState.displaySettings.copy(
                    thermalOnlyModeEnabled = false,
                    thermalPreviewModeEnabled = true,
                ),
            )
        }

        Log.i("NevexXrUi", "Preview boot mode active")
        Log.i("NevexXrUi", "Thermal preview enabled")
        syncThermalConfiguration()
    }

    fun connect() {
        val host = endpointHost.value.trim().ifEmpty { defaultEndpoint.host }
        endpointHost.value = host
        diagnosticsVisible.value = false
        hideMenu(resetToMain = true)
        persistOperatorPreferences()
        Log.i("NevexXrUi", "Connecting to Jetson... host=$host")
        repository.connect(defaultEndpoint.copy(host = host))
    }

    fun disconnect() {
        diagnosticsVisible.value = false
        hideMenu(resetToMain = true)
        repository.disconnect()
    }

    fun toggleDiagnostics() {
        diagnosticsVisible.update { !it }
    }

    fun togglePerformanceInstrumentation() {
        performanceInstrumentationEnabled.update { currentValue ->
            val enabled = !currentValue
            repository.setInstrumentationEnabled(enabled)
            enabled
        }
    }

    fun setPresenterExperimentMode(mode: PresenterExperimentMode) {
        if (presenterExperimentMode.value == mode) {
            return
        }
        presenterExperimentMode.value = mode
        repository.setPresenterExperimentMode(mode)
    }

    fun cyclePresenterExperimentMode() {
        setPresenterExperimentMode(presenterExperimentMode.value.next())
    }

    fun toggleMenuVisibility() {
        menuState.update { currentState ->
            val shouldShow = !currentState.isMenuVisible
            if (shouldShow) {
                soundManager.playMenuOpen()
                currentState.copy(
                    isMenuVisible = true,
                    currentMenu = NevexMenuScreen.MainMenu,
                    selectedItemIndex = MenuSelectionIndex.Main.ViewingMode,
                )
            } else {
                soundManager.playMenuClose()
                currentState.copy(isMenuVisible = false)
            }
        }
    }

    fun openMenuForValidation() {
        if (menuState.value.isMenuVisible) {
            return
        }
        soundManager.playMenuOpen()
        menuState.update { currentState ->
            currentState.copy(
                isMenuVisible = true,
                currentMenu = NevexMenuScreen.MainMenu,
                selectedItemIndex = MenuSelectionIndex.Main.ViewingMode,
            )
        }
    }

    fun closeMenuForValidation() {
        if (!menuState.value.isMenuVisible) {
            return
        }
        soundManager.playMenuClose()
        hideMenu(resetToMain = false)
    }

    fun ensureSoundManagerInitialized(context: Context) {
        val currentVolume = menuState.value.settings.soundVolume
        if (soundManagerInitialized) {
            soundManager.setVolume(currentVolume)
            return
        }
        soundManager = createSoundManager(
            context = context.applicationContext,
            initialVolume = currentVolume,
        )
        soundManagerInitialized = true
    }

    fun ensureSnapshotStoreInitialized(context: Context) {
        if (snapshotStore != null) {
            return
        }
        snapshotStore = SnapshotStore(context.applicationContext)
    }

    fun ensureThermalCalibrationStoreInitialized(context: Context) {
        if (thermalCalibrationStore != null) {
            return
        }
        thermalCalibrationStore = ThermalCalibrationStore(context.applicationContext)
        val savedCalibration = thermalCalibrationStore?.load() ?: return
        thermalTransformState.value = savedCalibration.transform
        setThermalCalibrationStatus(
            resolveThermalCalibrationStatus(
                transform = savedCalibration.transform,
                restoredFromStore = savedCalibration.hasPersistedValues,
            ),
        )
        Log.i(
            "NevexXrUi",
            "Thermal calibration restored: persisted=${savedCalibration.hasPersistedValues} " +
                "offsetX=${savedCalibration.transform.offsetXFraction} " +
                "offsetY=${savedCalibration.transform.offsetYFraction} " +
                "scale=${savedCalibration.transform.scale}",
        )
    }

    fun ensureOperatorPreferencesStoreInitialized(context: Context) {
        if (operatorPreferencesStore != null) {
            operatorPreferencesLoaded.value = true
            return
        }
        operatorPreferencesStore = OperatorPreferencesStore(context.applicationContext)
        val savedPreferences = operatorPreferencesStore?.load() ?: OperatorPreferencesSnapshot()
        val normalizedHost = savedPreferences.lastHost.trim().ifEmpty { defaultEndpoint.host }
        if (endpointHost.value != normalizedHost) {
            endpointHost.value = normalizedHost
        }
        menuState.update { currentState ->
            val profileDefaults = missionProfileDefaults(savedPreferences.missionProfile)
            currentState.copy(
                missionProfile = savedPreferences.missionProfile,
                settings = currentState.settings.copy(
                    soundVolume = savedPreferences.soundVolume.coerceIn(0f, 1f),
                    autoConnectOnStartup = savedPreferences.autoConnectOnStartup,
                ),
                displaySettings = currentState.displaySettings.copy(
                    reticleEnabled = profileDefaults.reticleEnabled,
                    gridEnabled = profileDefaults.gridEnabled,
                    boundingBoxesEnabled = profileDefaults.boundingBoxesEnabled,
                    thermalVisualMode = savedPreferences.thermalVisualMode,
                    thermalPreviewOpacityPreset = profileDefaults.thermalPreviewOpacityPreset,
                ),
            )
        }
        if (soundManagerInitialized) {
            soundManager.setVolume(savedPreferences.soundVolume)
        }
        syncThermalConfiguration()
        operatorPreferencesLoaded.value = true
        Log.i(
            "NevexXrUi",
            "Operator preferences loaded: host=$normalizedHost autoConnect=${savedPreferences.autoConnectOnStartup} " +
                "profile=${savedPreferences.missionProfile.name} thermalVisual=${savedPreferences.thermalVisualMode.name}",
        )
    }

    fun ensureViewingPreferencesStoreInitialized(
        context: Context,
        restoreViewingModeOnStartup: Boolean = false,
    ) {
        if (viewingPreferencesStore != null) {
            return
        }
        viewingPreferencesStore = ViewingPreferencesStore(context.applicationContext)
        val savedPreferences = viewingPreferencesStore?.load() ?: return
        if (!savedPreferences.hasPersistedValues) {
            return
        }
        menuState.update { currentState ->
            currentState.copy(
                displaySettings = currentState.displaySettings.copy(
                    thermalMode = if (restoreViewingModeOnStartup) {
                        when (savedPreferences.viewingMode) {
                            PersistedViewingMode.Visible -> ThermalOverlayMode.Off
                            PersistedViewingMode.ThermalOverlay -> ThermalOverlayMode.Live
                            PersistedViewingMode.ThermalOnly -> ThermalOverlayMode.Live
                        }
                    } else {
                        ThermalOverlayMode.Off
                    },
                    thermalOnlyModeEnabled = restoreViewingModeOnStartup &&
                        savedPreferences.viewingMode == PersistedViewingMode.ThermalOnly,
                    thermalPreviewModeEnabled = false,
                    thermalPreviewOpacityPreset = savedPreferences.thermalOpacityPreset,
                ),
            )
        }
        syncThermalConfiguration()
        Log.i(
            "NevexXrUi",
            if (restoreViewingModeOnStartup) {
                "Viewing preferences restored: mode=${savedPreferences.viewingMode.wireValue} " +
                    "opacity=${savedPreferences.thermalOpacityPreset.visiblePercent}%"
            } else {
                "Viewing preferences loaded with default visible startup: " +
                    "storedMode=${savedPreferences.viewingMode.wireValue} " +
                    "opacity=${savedPreferences.thermalOpacityPreset.visiblePercent}%"
            },
        )
    }

    fun ensureBootSequenceStarted() {
        if (bootSequenceStarted) {
            return
        }
        bootSequenceStarted = true
        startBootSequence()
    }

    fun captureSnapshot() {
        hideMenu(resetToMain = false)
        val leftBitmap = leftEyeUiState.value.bitmap
        val rightBitmap = rightEyeUiState.value.bitmap
        val frameId = leftEyeUiState.value.frameId ?: rightEyeUiState.value.frameId
        val activeSnapshotStore = snapshotStore

        if (leftBitmap == null || rightBitmap == null || activeSnapshotStore == null) {
            soundManager.playAlert()
            showCaptureFeedback(
                message = "SNAPSHOT UNAVAILABLE",
                tone = CaptureFeedbackTone.Danger,
            )
            return
        }

        soundManager.playClick()
        viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    activeSnapshotStore.saveStereoSnapshot(
                        leftBitmap = leftBitmap,
                        rightBitmap = rightBitmap,
                        frameId = frameId,
                    )
                }
            }.onSuccess { result ->
                lastSnapshotSavedAtMs.value = result.savedAtEpochMs
                soundManager.playSnapshotSaved()
                showCaptureFeedback(
                    message = "SNAPSHOT SAVED",
                    tone = CaptureFeedbackTone.Success,
                )
                Log.i("NevexXrUi", "Snapshot saved: ${result.file.absolutePath}")
            }.onFailure { error ->
                soundManager.playAlert()
                showCaptureFeedback(
                    message = "SNAPSHOT FAILED",
                    tone = CaptureFeedbackTone.Danger,
                )
                Log.e("NevexXrUi", "Snapshot save failed", error)
            }
        }
    }

    fun startRecording() {
        hideMenu(resetToMain = false)
        if (!uiState.value.hasLiveFrame) {
            soundManager.playAlert()
            showCaptureFeedback(
                message = "LIVE VIEW REQUIRED",
                tone = CaptureFeedbackTone.Danger,
            )
            return
        }
        if (recordingActiveState.value) {
            showCaptureFeedback(
                message = "RECORDING ACTIVE",
                tone = CaptureFeedbackTone.Neutral,
            )
            return
        }
        recordingActiveState.value = true
        soundManager.playRecordingStarted()
        showCaptureFeedback(
            message = "RECORDING STARTED",
            tone = CaptureFeedbackTone.Recording,
        )
        Log.i("NevexXrUi", "Recording shell started")
    }

    fun stopRecording() {
        hideMenu(resetToMain = false)
        if (!recordingActiveState.value) {
            showCaptureFeedback(
                message = "RECORDING IDLE",
                tone = CaptureFeedbackTone.Neutral,
            )
            return
        }
        recordingActiveState.value = false
        soundManager.playRecordingStopped()
        showCaptureFeedback(
            message = "RECORDING STOPPED",
            tone = CaptureFeedbackTone.Neutral,
        )
        Log.i("NevexXrUi", "Recording shell stopped")
    }

    fun onStartResumeView() {
        soundManager.playMenuClose()
        hideMenu(resetToMain = false)
    }

    fun openMissionProfilesMenu() {
        soundManager.playClick()
        setMenuScreen(
            screen = NevexMenuScreen.MissionProfiles,
            selectedIndex = currentMissionProfileSelectionIndex(menuState.value.missionProfile),
        )
    }

    fun openCaptureMenu() {
        soundManager.playClick()
        setMenuScreen(
            screen = NevexMenuScreen.Capture,
            selectedIndex = MenuSelectionIndex.Capture.Snapshot,
        )
    }

    fun openSettingsMenu() {
        soundManager.playClick()
        setMenuScreen(
            screen = NevexMenuScreen.Settings,
            selectedIndex = MenuSelectionIndex.Settings.AutoConnect,
        )
    }

    fun openDisplaySettingsMenu() {
        soundManager.playClick()
        setMenuScreen(
            screen = NevexMenuScreen.DisplaySettings,
            selectedIndex = MenuSelectionIndex.Display.Reticle,
        )
    }

    fun openThermalPresentationMenu() {
        soundManager.playClick()
        setMenuScreen(
            screen = NevexMenuScreen.ThermalPresentation,
            selectedIndex = currentThermalPresentationSelectionIndex(
                menuState.value.displaySettings.thermalVisualMode,
            ),
        )
    }

    fun openThermalAlignmentMenu() {
        soundManager.playClick()
        cancelAutoCalibration(resetState = true)
        setMenuScreen(
            screen = NevexMenuScreen.ThermalAlignment,
            selectedIndex = MenuSelectionIndex.Alignment.OffsetX,
        )
    }

    fun openThermalAutoCalibrationMenu() {
        soundManager.playActivate()
        cancelAutoCalibration(resetState = true)
        setMenuScreen(
            screen = NevexMenuScreen.ThermalAutoCalibration,
            selectedIndex = MenuSelectionIndex.AutoCalibration.PrimaryAction,
        )
        beginAutoCalibrationSession()
    }

    fun openSystemStatusMenu() {
        soundManager.playClick()
        setMenuScreen(
            screen = NevexMenuScreen.SystemStatus,
            selectedIndex = MenuSelectionIndex.Status.ReturnMain,
        )
    }

    fun returnToMainMenu() {
        soundManager.playBack()
        setMenuScreen(
            screen = NevexMenuScreen.MainMenu,
            selectedIndex = MenuSelectionIndex.Main.ViewingMode,
        )
    }

    fun returnToSettingsMenu() {
        soundManager.playBack()
        setMenuScreen(
            screen = NevexMenuScreen.Settings,
            selectedIndex = MenuSelectionIndex.Settings.DisplaySettings,
        )
    }

    fun returnToDisplaySettingsMenu() {
        soundManager.playBack()
        cancelAutoCalibration(resetState = true)
        setMenuScreen(
            screen = NevexMenuScreen.DisplaySettings,
            selectedIndex = MenuSelectionIndex.Display.ThermalAlignment,
        )
    }

    fun returnToThermalPresentationMenu() {
        soundManager.playBack()
        setMenuScreen(
            screen = NevexMenuScreen.ThermalPresentation,
            selectedIndex = currentThermalPresentationSelectionIndex(
                menuState.value.displaySettings.thermalVisualMode,
            ),
        )
    }

    fun returnToThermalAlignmentMenu() {
        soundManager.playBack()
        cancelAutoCalibration(resetState = true)
        setMenuScreen(
            screen = NevexMenuScreen.ThermalAlignment,
            selectedIndex = MenuSelectionIndex.Alignment.AutoCalibrate,
        )
    }

    fun restoreOperatorDefaults() {
        val defaults = missionProfileDefaults(MissionProfile.Inspection)
        endpointHost.value = defaultEndpoint.host
        menuState.update { currentState ->
            currentState.copy(
                missionProfile = MissionProfile.Inspection,
                settings = currentState.settings.copy(
                    overlayOpacity = 0.78f,
                    soundVolume = defaults.soundVolume,
                    autoConnectOnStartup = true,
                ),
                displaySettings = currentState.displaySettings.copy(
                    reticleEnabled = defaults.reticleEnabled,
                    gridEnabled = defaults.gridEnabled,
                    boundingBoxesEnabled = defaults.boundingBoxesEnabled,
                    thermalMode = ThermalOverlayMode.Off,
                    thermalVisualMode = defaults.thermalVisualMode,
                    thermalOnlyModeEnabled = false,
                    thermalPreviewModeEnabled = false,
                    thermalPreviewOpacityPreset = defaults.thermalPreviewOpacityPreset,
                ),
            )
        }
        soundManager.setVolume(defaults.soundVolume)
        persistOperatorPreferences()
        persistViewingPreferences()
        syncThermalConfiguration()
    }

    fun cycleThermalAlignmentAdjustmentMode(forward: Boolean = true) {
        soundManager.playClick()
        menuState.update { currentState ->
            val nextMode = if (forward) {
                currentState.thermalAlignment.adjustmentMode.next()
            } else {
                currentState.thermalAlignment.adjustmentMode.previous()
            }
            currentState.copy(
                thermalAlignment = currentState.thermalAlignment.copy(
                    adjustmentMode = nextMode,
                ),
            )
        }
    }

    fun selectMenuIndex(index: Int) {
        menuState.update { currentState ->
            if (!currentState.isMenuVisible) {
                return@update currentState
            }
            currentState.copy(
                selectedItemIndex = index.coerceIn(
                    minimumValue = 0,
                    maximumValue = currentMenuItemCount(currentState.currentMenu) - 1,
                ),
            )
        }
    }

    fun navigateMenuSelection(delta: Int) {
        if (!menuState.value.isMenuVisible) {
            return
        }
        soundManager.playFocusShift()
        menuState.update { currentState ->
            val itemCount = currentMenuItemCount(currentState.currentMenu)
            val nextIndex = (currentState.selectedItemIndex + delta).floorMod(itemCount)
            currentState.copy(selectedItemIndex = nextIndex)
        }
    }

    fun adjustSelectedMenuItem(delta: Int) {
        val currentState = menuState.value
        if (!currentState.isMenuVisible) {
            return
        }
        when (currentState.currentMenu) {
            NevexMenuScreen.MainMenu -> {
                when (currentState.selectedItemIndex) {
                    MenuSelectionIndex.Main.ViewingMode -> cyclePrimaryViewingMode(forward = delta > 0)
                }
            }

            NevexMenuScreen.MissionProfiles -> Unit

            NevexMenuScreen.Capture -> Unit

            NevexMenuScreen.Settings -> {
                when (currentState.selectedItemIndex) {
                    MenuSelectionIndex.Settings.AutoConnect -> {
                        setStartupAutoConnectEnabled(delta > 0)
                    }

                    MenuSelectionIndex.Settings.OverlayOpacity -> {
                        setOverlayOpacity(currentState.settings.overlayOpacity + (delta * 0.05f))
                    }

                    MenuSelectionIndex.Settings.SoundVolume -> {
                        setSoundVolume(currentState.settings.soundVolume + (delta * 0.05f))
                    }
                }
            }

            NevexMenuScreen.DisplaySettings -> {
                when (currentState.selectedItemIndex) {
                    MenuSelectionIndex.Display.Reticle -> {
                        setReticleEnabled(delta > 0)
                    }

                    MenuSelectionIndex.Display.Grid -> {
                        setGridEnabled(delta > 0)
                    }

                    MenuSelectionIndex.Display.BoundingBoxes -> {
                        setBoundingBoxesEnabled(delta > 0)
                    }

                    MenuSelectionIndex.Display.ThermalOverlay -> {
                        cycleThermalMode(forward = delta > 0)
                    }

                    MenuSelectionIndex.Display.ThermalPresentation -> Unit

                    MenuSelectionIndex.Display.ThermalPreview -> {
                        setThermalPreviewModeEnabled(delta > 0)
                    }

                    MenuSelectionIndex.Display.ThermalPreviewOpacity -> {
                        cycleThermalPreviewOpacityPreset(forward = delta > 0)
                    }
                }
            }

            NevexMenuScreen.ThermalAlignment -> {
                val adjustmentMode = currentState.thermalAlignment.adjustmentMode
                when (currentState.selectedItemIndex) {
                    MenuSelectionIndex.Alignment.AdjustmentMode -> {
                        cycleThermalAlignmentAdjustmentMode(forward = delta > 0)
                    }

                    MenuSelectionIndex.Alignment.OffsetX -> {
                        setThermalOffsetX(
                            thermalTransformState.value.offsetXFraction +
                                (delta * adjustmentMode.offsetStepFraction),
                        )
                    }

                    MenuSelectionIndex.Alignment.OffsetY -> {
                        setThermalOffsetY(
                            thermalTransformState.value.offsetYFraction +
                                (delta * adjustmentMode.offsetStepFraction),
                        )
                    }

                    MenuSelectionIndex.Alignment.Scale -> {
                        setThermalScale(
                            thermalTransformState.value.scale + (delta * adjustmentMode.scaleStep),
                        )
                    }

                    MenuSelectionIndex.Alignment.OverlayOpacity -> {
                        setOverlayOpacity(currentState.settings.overlayOpacity + (delta * 0.04f))
                    }
                }
            }

            NevexMenuScreen.ThermalPresentation -> {
                when (currentState.selectedItemIndex) {
                    MenuSelectionIndex.ThermalPresentation.WhiteHot -> {
                        setThermalVisualMode(ThermalVisualMode.WhiteHot)
                    }

                    MenuSelectionIndex.ThermalPresentation.BlackHot -> {
                        setThermalVisualMode(ThermalVisualMode.BlackHot)
                    }
                }
            }

            NevexMenuScreen.ThermalAutoCalibration -> Unit

            NevexMenuScreen.SystemStatus -> Unit
        }
    }

    fun activateSelectedMenuItem() {
        val currentState = menuState.value
        if (!currentState.isMenuVisible) {
            return
        }
        when (currentState.currentMenu) {
            NevexMenuScreen.MainMenu -> {
                when (currentState.selectedItemIndex) {
                    MenuSelectionIndex.Main.ViewingMode -> cyclePrimaryViewingMode()
                    MenuSelectionIndex.Main.MissionProfiles -> openMissionProfilesMenu()
                    MenuSelectionIndex.Main.Capture -> openCaptureMenu()
                    MenuSelectionIndex.Main.Settings -> openSettingsMenu()
                    MenuSelectionIndex.Main.SystemStatus -> openSystemStatusMenu()
                    MenuSelectionIndex.Main.Close -> onStartResumeView()
                }
            }

            NevexMenuScreen.MissionProfiles -> {
                when (currentState.selectedItemIndex) {
                    MenuSelectionIndex.MissionProfiles.Inspection -> setMissionProfile(MissionProfile.Inspection)
                    MenuSelectionIndex.MissionProfiles.Rescue -> setMissionProfile(MissionProfile.Rescue)
                    MenuSelectionIndex.MissionProfiles.Tactical -> setMissionProfile(MissionProfile.Tactical)
                    MenuSelectionIndex.MissionProfiles.Marine -> setMissionProfile(MissionProfile.Marine)
                    MenuSelectionIndex.MissionProfiles.ReturnMain -> returnToMainMenu()
                }
            }

            NevexMenuScreen.Capture -> {
                when (currentState.selectedItemIndex) {
                    MenuSelectionIndex.Capture.Snapshot -> captureSnapshot()
                    MenuSelectionIndex.Capture.Recording -> {
                        if (recordingActiveState.value) {
                            stopRecording()
                        } else {
                            startRecording()
                        }
                    }

                    MenuSelectionIndex.Capture.ReturnMain -> returnToMainMenu()
                }
            }

            NevexMenuScreen.Settings -> {
                when (currentState.selectedItemIndex) {
                    MenuSelectionIndex.Settings.AutoConnect -> {
                        setStartupAutoConnectEnabled(!currentState.settings.autoConnectOnStartup)
                    }

                    MenuSelectionIndex.Settings.DisplaySettings -> openDisplaySettingsMenu()
                    MenuSelectionIndex.Settings.SystemStatus -> openSystemStatusMenu()
                    MenuSelectionIndex.Settings.RestoreDefaults -> restoreOperatorDefaults()
                    MenuSelectionIndex.Settings.ReturnMain -> returnToMainMenu()
                }
            }

            NevexMenuScreen.DisplaySettings -> {
                when (currentState.selectedItemIndex) {
                    MenuSelectionIndex.Display.Reticle -> {
                        setReticleEnabled(!currentState.displaySettings.reticleEnabled)
                    }

                    MenuSelectionIndex.Display.Grid -> {
                        setGridEnabled(!currentState.displaySettings.gridEnabled)
                    }

                    MenuSelectionIndex.Display.BoundingBoxes -> {
                        setBoundingBoxesEnabled(!currentState.displaySettings.boundingBoxesEnabled)
                    }

                    MenuSelectionIndex.Display.ThermalOverlay -> {
                        cycleThermalMode()
                    }

                    MenuSelectionIndex.Display.ThermalPresentation -> openThermalPresentationMenu()

                    MenuSelectionIndex.Display.ThermalPreview -> {
                        setThermalPreviewModeEnabled(!currentState.displaySettings.thermalPreviewModeEnabled)
                    }

                    MenuSelectionIndex.Display.ThermalPreviewOpacity -> {
                        cycleThermalPreviewOpacityPreset()
                    }

                    MenuSelectionIndex.Display.ThermalAlignment -> openThermalAlignmentMenu()

                    MenuSelectionIndex.Display.ReturnSettings -> returnToSettingsMenu()
                }
            }

            NevexMenuScreen.ThermalPresentation -> {
                when (currentState.selectedItemIndex) {
                    MenuSelectionIndex.ThermalPresentation.WhiteHot -> {
                        setThermalVisualMode(ThermalVisualMode.WhiteHot)
                    }

                    MenuSelectionIndex.ThermalPresentation.BlackHot -> {
                        setThermalVisualMode(ThermalVisualMode.BlackHot)
                    }

                    MenuSelectionIndex.ThermalPresentation.WarmTargetsOnly,
                    MenuSelectionIndex.ThermalPresentation.ThresholdedThermal,
                    MenuSelectionIndex.ThermalPresentation.EdgeAssist,
                    MenuSelectionIndex.ThermalPresentation.FusionAssist,
                    -> {
                        showCaptureFeedback(
                            message = thermalPresentationPreparedMessage(currentState.selectedItemIndex),
                            tone = CaptureFeedbackTone.Neutral,
                        )
                    }

                    MenuSelectionIndex.ThermalPresentation.ReturnDisplay -> returnToDisplaySettingsMenu()
                }
            }

            NevexMenuScreen.ThermalAlignment -> {
                when (currentState.selectedItemIndex) {
                    MenuSelectionIndex.Alignment.AdjustmentMode -> cycleThermalAlignmentAdjustmentMode()
                    MenuSelectionIndex.Alignment.AutoCalibrate -> openThermalAutoCalibrationMenu()
                    MenuSelectionIndex.Alignment.CenterOffsets -> centerThermalOffsets()
                    MenuSelectionIndex.Alignment.Reset -> resetThermalTransform()
                    MenuSelectionIndex.Alignment.ReturnDisplay -> returnToDisplaySettingsMenu()
                }
            }

            NevexMenuScreen.ThermalAutoCalibration -> {
                if (currentState.selectedItemIndex == MenuSelectionIndex.AutoCalibration.PrimaryAction) {
                    returnToThermalAlignmentMenu()
                }
            }

            NevexMenuScreen.SystemStatus -> {
                if (currentState.selectedItemIndex == MenuSelectionIndex.Status.ReturnMain) {
                    returnToMainMenu()
                }
            }
        }
    }

    fun goBackInMenu() {
        val currentState = menuState.value
        if (!currentState.isMenuVisible) {
            return
        }
        when (currentState.currentMenu) {
            NevexMenuScreen.MainMenu -> {
                soundManager.playBack()
                hideMenu(resetToMain = true)
            }

            NevexMenuScreen.MissionProfiles,
            NevexMenuScreen.Capture,
            NevexMenuScreen.Settings,
            NevexMenuScreen.SystemStatus,
            -> returnToMainMenu()

            NevexMenuScreen.DisplaySettings -> returnToSettingsMenu()
            NevexMenuScreen.ThermalPresentation -> returnToDisplaySettingsMenu()
            NevexMenuScreen.ThermalAlignment -> returnToDisplaySettingsMenu()
            NevexMenuScreen.ThermalAutoCalibration -> returnToThermalAlignmentMenu()
        }
    }

    fun handleMenuKeyInput(keyCode: Int): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_M -> {
                toggleMenuVisibility()
                true
            }

            KeyEvent.KEYCODE_MENU -> {
                toggleMenuVisibility()
                true
            }

            KeyEvent.KEYCODE_DPAD_UP -> {
                if (menuState.value.isMenuVisible) {
                    navigateMenuSelection(-1)
                    true
                } else {
                    false
                }
            }

            KeyEvent.KEYCODE_DPAD_DOWN -> {
                if (menuState.value.isMenuVisible) {
                    navigateMenuSelection(1)
                    true
                } else {
                    false
                }
            }

            KeyEvent.KEYCODE_DPAD_LEFT -> {
                if (menuState.value.isMenuVisible) {
                    adjustSelectedMenuItem(delta = -1)
                    true
                } else {
                    false
                }
            }

            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                if (menuState.value.isMenuVisible) {
                    adjustSelectedMenuItem(delta = 1)
                    true
                } else {
                    false
                }
            }

            KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_NUMPAD_ENTER,
            KeyEvent.KEYCODE_DPAD_CENTER,
            -> {
                if (menuState.value.isMenuVisible) {
                    activateSelectedMenuItem()
                    true
                } else {
                    false
                }
            }

            KeyEvent.KEYCODE_DEL,
            KeyEvent.KEYCODE_ESCAPE,
            KeyEvent.KEYCODE_BACK,
            -> {
                if (menuState.value.isMenuVisible) {
                    goBackInMenu()
                    true
                } else {
                    false
                }
            }

            else -> false
        }
    }

    fun setBrightness(value: Float) {
        menuState.update { currentState ->
            currentState.copy(
                settings = currentState.settings.copy(
                    brightness = value.coerceIn(0f, 1f),
                ),
            )
        }
    }

    fun setContrast(value: Float) {
        menuState.update { currentState ->
            currentState.copy(
                settings = currentState.settings.copy(
                    contrast = value.coerceIn(0f, 1f),
                ),
            )
        }
    }

    fun setOverlayOpacity(value: Float) {
        menuState.update { currentState ->
            currentState.copy(
                settings = currentState.settings.copy(
                    overlayOpacity = value.coerceIn(0.25f, 1f),
                ),
            )
        }
    }

    fun setSoundVolume(value: Float) {
        val adjustedVolume = value.coerceIn(0f, 1f)
        soundManager.setVolume(adjustedVolume)
        menuState.update { currentState ->
            currentState.copy(
                settings = currentState.settings.copy(
                    soundVolume = adjustedVolume,
                ),
            )
        }
        persistOperatorPreferences()
    }

    fun setStartupAutoConnectEnabled(enabled: Boolean) {
        if (menuState.value.settings.autoConnectOnStartup == enabled) {
            return
        }
        soundManager.playToggle(enabled)
        menuState.update { currentState ->
            currentState.copy(
                settings = currentState.settings.copy(
                    autoConnectOnStartup = enabled,
                ),
            )
        }
        persistOperatorPreferences()
    }

    fun setReticleEnabled(enabled: Boolean) {
        soundManager.playToggle(enabled)
        menuState.update { currentState ->
            currentState.copy(
                displaySettings = currentState.displaySettings.copy(reticleEnabled = enabled),
            )
        }
    }

    fun setGridEnabled(enabled: Boolean) {
        soundManager.playToggle(enabled)
        menuState.update { currentState ->
            currentState.copy(
                displaySettings = currentState.displaySettings.copy(gridEnabled = enabled),
            )
        }
    }

    fun setBoundingBoxesEnabled(enabled: Boolean) {
        soundManager.playToggle(enabled)
        menuState.update { currentState ->
            currentState.copy(
                displaySettings = currentState.displaySettings.copy(boundingBoxesEnabled = enabled),
            )
        }
    }

    fun setPrimaryViewingMode(mode: ViewingMode) {
        applyPrimaryViewingMode(mode)
    }

    fun cyclePrimaryViewingMode(forward: Boolean = true) {
        val nextMode = if (forward) {
            menuState.value.displaySettings.primaryViewingMode().next()
        } else {
            menuState.value.displaySettings.primaryViewingMode().previous()
        }
        applyPrimaryViewingMode(nextMode)
    }

    fun setThermalMode(mode: ThermalOverlayMode) {
        if (menuState.value.displaySettings.thermalMode == mode) {
            syncThermalConfiguration()
            return
        }
        soundManager.playClick()
        setThermalFrame(null)
        setUseRealThermal(false)
        menuState.update { currentState ->
            currentState.copy(
                displaySettings = currentState.displaySettings.copy(
                    thermalMode = mode,
                    thermalOnlyModeEnabled = false,
                ),
            )
        }
        persistViewingPreferences()
        syncThermalConfiguration()
    }

    fun cycleThermalMode(forward: Boolean = true) {
        val currentMode = menuState.value.displaySettings.thermalMode
        setThermalMode(
            if (forward) {
                currentMode.next()
            } else {
                currentMode.previous()
            },
        )
    }

    fun setThermalPreviewModeEnabled(enabled: Boolean) {
        if (menuState.value.displaySettings.thermalPreviewModeEnabled == enabled) {
            syncThermalConfiguration()
            return
        }
        soundManager.playToggle(enabled)
        menuState.update { currentState ->
            currentState.copy(
                displaySettings = currentState.displaySettings.copy(
                    thermalOnlyModeEnabled = if (enabled) false else currentState.displaySettings.thermalOnlyModeEnabled,
                    thermalPreviewModeEnabled = enabled,
                ),
            )
        }
        Log.i("NevexXrUi", "Thermal preview mode ${if (enabled) "enabled" else "disabled"}")
        syncThermalConfiguration()
    }

    fun setThermalPreviewOpacityPreset(preset: ThermalPreviewOpacityPreset) {
        if (menuState.value.displaySettings.thermalPreviewOpacityPreset == preset) {
            return
        }
        soundManager.playClick()
        menuState.update { currentState ->
            currentState.copy(
                displaySettings = currentState.displaySettings.copy(
                    thermalPreviewOpacityPreset = preset,
                ),
            )
        }
        persistViewingPreferences()
        Log.i("NevexXrUi", "Thermal preview opacity preset set to ${preset.visiblePercent}%")
    }

    fun cycleThermalPreviewOpacityPreset(forward: Boolean = true) {
        val currentPreset = menuState.value.displaySettings.thermalPreviewOpacityPreset
        setThermalPreviewOpacityPreset(
            if (forward) {
                currentPreset.next()
            } else {
                currentPreset.previous()
            },
        )
    }

    fun setThermalVisualMode(mode: ThermalVisualMode) {
        if (menuState.value.displaySettings.thermalVisualMode == mode) {
            return
        }
        soundManager.playClick()
        menuState.update { currentState ->
            currentState.copy(
                displaySettings = currentState.displaySettings.copy(
                    thermalVisualMode = mode,
                ),
            )
        }
        persistOperatorPreferences()
    }

    fun setMissionProfile(profile: MissionProfile) {
        if (menuState.value.missionProfile == profile) {
            return
        }
        val defaults = missionProfileDefaults(profile)
        soundManager.playProfileChange()
        menuState.update { currentState ->
            currentState.copy(
                missionProfile = profile,
                settings = currentState.settings.copy(
                    soundVolume = defaults.soundVolume,
                ),
                displaySettings = currentState.displaySettings.copy(
                    reticleEnabled = defaults.reticleEnabled,
                    gridEnabled = defaults.gridEnabled,
                    boundingBoxesEnabled = defaults.boundingBoxesEnabled,
                    thermalVisualMode = defaults.thermalVisualMode,
                    thermalPreviewOpacityPreset = defaults.thermalPreviewOpacityPreset,
                    thermalMode = when (defaults.preferredViewingMode) {
                        ViewingMode.Visible -> ThermalOverlayMode.Off
                        ViewingMode.ThermalOverlay,
                        ViewingMode.ThermalOnly,
                        -> ThermalOverlayMode.Live
                    },
                    thermalOnlyModeEnabled = defaults.preferredViewingMode == ViewingMode.ThermalOnly,
                    thermalPreviewModeEnabled = false,
                ),
            )
        }
        soundManager.setVolume(defaults.soundVolume)
        persistOperatorPreferences()
        persistViewingPreferences()
        syncThermalConfiguration()
    }

    private fun applyPrimaryViewingMode(mode: ViewingMode) {
        val currentSettings = menuState.value.displaySettings
        val targetThermalMode = when (mode) {
            ViewingMode.Visible -> ThermalOverlayMode.Off
            ViewingMode.ThermalOverlay,
            ViewingMode.ThermalOnly,
            -> ThermalOverlayMode.Live
        }
        val targetThermalOnlyModeEnabled = mode == ViewingMode.ThermalOnly
        val modeAlreadyApplied = currentSettings.thermalMode == targetThermalMode &&
            currentSettings.thermalOnlyModeEnabled == targetThermalOnlyModeEnabled &&
            !currentSettings.thermalPreviewModeEnabled
        if (modeAlreadyApplied) {
            syncThermalConfiguration()
            return
        }
        soundManager.playClick()
        setThermalFrame(null)
        setUseRealThermal(false)
        menuState.update { currentState ->
            currentState.copy(
                displaySettings = currentState.displaySettings.copy(
                    thermalMode = targetThermalMode,
                    thermalOnlyModeEnabled = targetThermalOnlyModeEnabled,
                    thermalPreviewModeEnabled = false,
                ),
            )
        }
        persistViewingPreferences()
        syncThermalConfiguration()
    }

    fun setThermalOffsetX(value: Float) {
        thermalTransformState.update { currentTransform ->
            currentTransform.copy(
                offsetXFraction = value.coerceIn(
                    -THERMAL_ALIGNMENT_OFFSET_LIMIT,
                    THERMAL_ALIGNMENT_OFFSET_LIMIT,
                ),
            )
        }
        persistThermalCalibration()
        updateThermalCalibrationStatusForCurrentTransform()
    }

    fun setThermalOffsetY(value: Float) {
        thermalTransformState.update { currentTransform ->
            currentTransform.copy(
                offsetYFraction = value.coerceIn(
                    -THERMAL_ALIGNMENT_OFFSET_LIMIT,
                    THERMAL_ALIGNMENT_OFFSET_LIMIT,
                ),
            )
        }
        persistThermalCalibration()
        updateThermalCalibrationStatusForCurrentTransform()
    }

    fun setThermalScale(value: Float) {
        thermalTransformState.update { currentTransform ->
            currentTransform.copy(
                scale = value.coerceIn(
                    THERMAL_ALIGNMENT_SCALE_MIN,
                    THERMAL_ALIGNMENT_SCALE_MAX,
                ),
            )
        }
        persistThermalCalibration()
        updateThermalCalibrationStatusForCurrentTransform()
    }

    fun centerThermalOffsets() {
        soundManager.playClick()
        thermalTransformState.update { currentTransform ->
            currentTransform.copy(
                offsetXFraction = 0f,
                offsetYFraction = 0f,
            )
        }
        persistThermalCalibration()
        updateThermalCalibrationStatusForCurrentTransform()
    }

    fun resetThermalTransform() {
        soundManager.playClick()
        thermalTransformState.value = ThermalOverlayTransform()
        thermalCalibrationStore?.clear()
        setThermalCalibrationStatus(ThermalCalibrationStatus.Default)
    }

    fun togglePlaceholderMode() {
        soundManager.playClick()
        menuState.update { currentState ->
            currentState.copy(
                placeholderViewMode = currentState.placeholderViewMode.next(),
            )
        }
    }

    fun setDetections(detections: List<DetectionBox>) {
        detectionsState.value = detections
    }

    fun applyDetectionFrameResult(
        result: DetectionFrameResult?,
    ) {
        if (result == null || result.targets.isEmpty()) {
            detectionsState.value = emptyList()
            useRealDetections.value = false
            return
        }
        detectionsState.value = result.toOverlayBoxes()
        useRealDetections.value = result.source != DetectionSource.Synthetic
    }

    fun setThermalFrame(bitmap: Bitmap?) {
        thermalFrameState.value = bitmap
    }

    fun setUseRealDetections(enabled: Boolean) {
        useRealDetections.value = enabled
    }

    fun setUseRealThermal(enabled: Boolean) {
        useRealThermal.value = enabled
    }

    fun triggerDetectionAlert() {
        soundManager.playAlert()
    }

    fun onEyePresenterFrameReceived(event: StereoEyePresenterReceiveEvent) {
        repository.recordEyePresenterReceived(event)
    }

    fun onFramePresented(event: StereoEyeFramePresentedEvent) {
        repository.recordFramePresented(event)
    }

    override fun onCleared() {
        cancelAutoCalibration(resetState = true)
        captureFeedbackJob?.cancel()
        soundManager.release()
        calibrationRepository.close()
        thermalRepository.close()
        repository.close()
        super.onCleared()
    }

    private fun setMenuScreen(
        screen: NevexMenuScreen,
        selectedIndex: Int,
    ) {
        menuState.update { currentState ->
            currentState.copy(
                isMenuVisible = true,
                currentMenu = screen,
                selectedItemIndex = selectedIndex.coerceIn(
                    minimumValue = 0,
                    maximumValue = currentMenuItemCount(screen) - 1,
                ),
            )
        }
    }

    private fun hideMenu(resetToMain: Boolean) {
        menuState.update { currentState ->
            currentState.copy(
                isMenuVisible = false,
                currentMenu = if (resetToMain) NevexMenuScreen.MainMenu else currentState.currentMenu,
                selectedItemIndex = if (resetToMain) {
                    MenuSelectionIndex.Main.ViewingMode
                } else {
                    currentState.selectedItemIndex
                },
            )
        }
    }

    private fun currentMenuItemCount(screen: NevexMenuScreen): Int {
        return when (screen) {
            NevexMenuScreen.MainMenu -> MenuSelectionIndex.Main.Count
            NevexMenuScreen.MissionProfiles -> MenuSelectionIndex.MissionProfiles.Count
            NevexMenuScreen.Capture -> MenuSelectionIndex.Capture.Count
            NevexMenuScreen.Settings -> MenuSelectionIndex.Settings.Count
            NevexMenuScreen.DisplaySettings -> MenuSelectionIndex.Display.Count
            NevexMenuScreen.ThermalPresentation -> MenuSelectionIndex.ThermalPresentation.Count
            NevexMenuScreen.ThermalAlignment -> MenuSelectionIndex.Alignment.Count
            NevexMenuScreen.ThermalAutoCalibration -> MenuSelectionIndex.AutoCalibration.Count
            NevexMenuScreen.SystemStatus -> MenuSelectionIndex.Status.Count
        }
    }

    private fun showCaptureFeedback(
        message: String,
        tone: CaptureFeedbackTone,
    ) {
        captureFeedbackJob?.cancel()
        captureFeedbackState.value = CaptureFeedbackUiState(
            message = message,
            tone = tone,
        )
        captureFeedbackJob = viewModelScope.launch {
            delay(CAPTURE_FEEDBACK_DURATION_MS)
            captureFeedbackState.value = null
        }
    }

    private fun startBootSequence() {
        viewModelScope.launch {
            bootSequenceState.value = BootSequenceUiState(
                visible = true,
                phase = BootSequencePhase.Initializing,
            )
            delay(120)
            bootSequenceState.value = BootSequenceUiState(
                visible = true,
                phase = BootSequencePhase.Connecting,
            )
            delay(150)
            bootSequenceState.value = BootSequenceUiState(
                visible = true,
                phase = BootSequencePhase.SystemReady,
            )
            soundManager.playReady()
            delay(130)
            bootSequenceState.value = bootSequenceState.value.copy(visible = false)
        }
    }

    private fun startThermalStatusPulse() {
        viewModelScope.launch {
            while (isActive) {
                thermalStatusPulseNanos.value = SystemClock.elapsedRealtimeNanos()
                delay(THERMAL_STATUS_PULSE_INTERVAL_MS)
            }
        }
    }

    private fun observeThermalState() {
        viewModelScope.launch {
            combine(
                menuState.map { currentState -> currentState.displaySettings.effectiveThermalMode() },
                menuState.map { currentState -> currentState.displaySettings.thermalVisualMode },
                thermalRepository.snapshot,
                thermalTransformState,
                thermalStatusPulseNanos,
            ) { thermalMode, thermalVisualMode, thermalSnapshot, thermalTransform, currentElapsedRealtimeNanos ->
                buildThermalOverlayBinding(
                    thermalMode = thermalMode,
                    thermalVisualMode = thermalVisualMode,
                    thermalSnapshot = thermalSnapshot,
                    thermalTransform = thermalTransform,
                    currentElapsedRealtimeNanos = currentElapsedRealtimeNanos,
                )
            }.collect { thermalBinding ->
                setThermalFrame(thermalBinding.frameBitmap)
                setUseRealThermal(thermalBinding.useRealThermal)
                thermalPresentationState.value = thermalBinding.presentation
            }
        }
    }

    private fun observeCalibrationConfiguration() {
        viewModelScope.launch {
            combine(
                endpointHost,
                menuState.map { currentState ->
                    currentState.isMenuVisible &&
                        currentState.currentMenu == NevexMenuScreen.ThermalAutoCalibration
                },
                repository.snapshot.map { snapshot -> snapshot.connected },
            ) { host, autoCalibrationScreenActive, liveConnected ->
                Triple(host.trim().ifEmpty { defaultEndpoint.host }, autoCalibrationScreenActive, liveConnected)
            }
                .collectLatest { (host, autoCalibrationScreenActive, liveConnected) ->
                    calibrationRepository.updateHost(host)
                    calibrationRepository.setPollingEnabled(autoCalibrationScreenActive && liveConnected)
                    if (!autoCalibrationScreenActive) {
                        return@collectLatest
                    }
                    if (!liveConnected) {
                        autoCalibrationSessionSource = AutoCalibrationSessionSource.None
                        lastHandledCalibrationFingerprint = null
                        updateAutoCalibrationUiState(
                            AutoCalibrationUiDescriptor(
                                mode = CalibrationMode.WaitingForVisibleSource,
                                progress = 0.06f,
                                completionSummary = "Visible source not active yet.",
                                guidanceText = "Start live view on 8090 to enable the sender-owned preview source.",
                                readinessText = "Current calibration remains active until the live visible source is available.",
                                backendStateLabel = CalibrationBackendState.WaitingForVisibleSource.wireValue,
                            ),
                        )
                    }
                }
        }
    }

    private fun observeCalibrationBackend() {
        viewModelScope.launch {
            calibrationRepository.snapshot.collectLatest { calibrationSnapshot ->
                if (
                    !menuState.value.isMenuVisible ||
                    menuState.value.currentMenu != NevexMenuScreen.ThermalAutoCalibration
                ) {
                    return@collectLatest
                }
                if (!uiState.value.connected) {
                    return@collectLatest
                }
                if (autoCalibrationSessionSource == AutoCalibrationSessionSource.Fallback) {
                    return@collectLatest
                }
                if (calibrationSnapshot.backendAvailable) {
                    autoCalibrationSessionSource = AutoCalibrationSessionSource.Backend
                    autoCalibrationJob?.cancel()
                    autoCalibrationJob = null
                    applyBackendCalibrationState(calibrationSnapshot)
                    maybeApplyAcceptedCalibration(calibrationSnapshot)
                }
            }
        }
    }

    private fun observeConnectionAudio() {
        viewModelScope.launch {
            var previousConnected = false
            var previousHasLiveFrame = false
            var hadHealthyLiveSession = false
            repository.snapshot.collectLatest { snapshot ->
                if (snapshot.connected && snapshot.hasLiveFrame) {
                    if (hadHealthyLiveSession && (!previousConnected || !previousHasLiveFrame)) {
                        soundManager.playReconnect()
                    }
                    hadHealthyLiveSession = true
                } else if (
                    hadHealthyLiveSession &&
                    previousConnected &&
                    previousHasLiveFrame &&
                    (!snapshot.connected || snapshot.lastError != null)
                ) {
                    soundManager.playConnectionLost()
                }
                previousConnected = snapshot.connected
                previousHasLiveFrame = snapshot.hasLiveFrame
            }
        }
    }

    private fun persistThermalCalibration() {
        val calibrationStore = thermalCalibrationStore ?: return
        val transform = thermalTransformState.value
        if (transform.isDefaultCalibration()) {
            calibrationStore.clear()
        } else {
            calibrationStore.save(transform)
        }
    }

    private fun persistViewingPreferences() {
        val preferencesStore = viewingPreferencesStore ?: return
        val displaySettings = menuState.value.displaySettings
        preferencesStore.save(
            viewingMode = displaySettings.persistedViewingMode(),
            thermalOpacityPreset = displaySettings.thermalPreviewOpacityPreset,
        )
    }

    private fun persistOperatorPreferences() {
        val preferencesStore = operatorPreferencesStore ?: return
        val currentMenuState = menuState.value
        preferencesStore.save(
            OperatorPreferencesSnapshot(
                lastHost = endpointHost.value.trim().ifEmpty { defaultEndpoint.host },
                autoConnectOnStartup = currentMenuState.settings.autoConnectOnStartup,
                missionProfile = currentMenuState.missionProfile,
                thermalVisualMode = currentMenuState.displaySettings.thermalVisualMode,
                soundVolume = currentMenuState.settings.soundVolume,
                hasPersistedValues = true,
            ),
        )
    }

    private fun syncThermalConfiguration() {
        thermalRepository.updateHost(endpointHost.value.trim().ifEmpty { defaultEndpoint.host })
        thermalRepository.setStreamingEnabled(
            menuState.value.displaySettings.effectiveThermalMode() == ThermalOverlayMode.Live,
        )
    }

    private fun buildThermalOverlayBinding(
        thermalMode: ThermalOverlayMode,
        thermalVisualMode: ThermalVisualMode,
        thermalSnapshot: ThermalStreamSnapshot,
        thermalTransform: ThermalOverlayTransform,
        currentElapsedRealtimeNanos: Long,
    ): ThermalOverlayBinding {
        val runtimeState = resolveThermalRuntimeState(
            thermalMode = thermalMode,
            thermalSnapshot = thermalSnapshot,
            currentElapsedRealtimeNanos = currentElapsedRealtimeNanos,
        )
        val shouldUseRealThermal = thermalMode == ThermalOverlayMode.Live &&
            runtimeState == ThermalRuntimeState.Streaming &&
            thermalSnapshot.frameBitmap != null
        return ThermalOverlayBinding(
            frameBitmap = if (thermalMode == ThermalOverlayMode.Live) thermalSnapshot.frameBitmap else null,
            useRealThermal = shouldUseRealThermal,
            presentation = ThermalOverlayUiState(
                runtimeState = runtimeState,
                statusText = runtimeState.label,
                detailText = buildThermalDetailText(
                    thermalMode = thermalMode,
                    runtimeState = runtimeState,
                    thermalSnapshot = thermalSnapshot,
                ),
                centerText = formatThermalCenter(thermalSnapshot.metadata),
                rangeText = formatThermalRange(thermalSnapshot.metadata),
                captureFpsText = formatThermalCaptureFps(thermalSnapshot.metadata),
                visualMode = thermalVisualMode,
                transform = thermalTransform,
            ),
        )
    }

    private fun buildSensorStatus(
        thermalMode: ThermalOverlayMode,
        thermalPresentation: ThermalOverlayUiState,
    ): String {
        return when (thermalMode) {
            ThermalOverlayMode.Off -> "Thermal disabled"
            ThermalOverlayMode.Placeholder -> "Thermal placeholder active"
            ThermalOverlayMode.Live -> "Thermal ${thermalPresentation.statusText.lowercase(Locale.US)}"
        }
    }

    private fun formatThermalStatusLine(
        thermalPresentation: ThermalOverlayUiState,
    ): String {
        return "${thermalPresentation.statusText} - ${thermalPresentation.detailText}"
    }

    private fun resolveThermalRuntimeState(
        thermalMode: ThermalOverlayMode,
        thermalSnapshot: ThermalStreamSnapshot,
        currentElapsedRealtimeNanos: Long,
    ): ThermalRuntimeState {
        return when (thermalMode) {
            ThermalOverlayMode.Off -> ThermalRuntimeState.Off
            ThermalOverlayMode.Placeholder -> ThermalRuntimeState.Placeholder
            ThermalOverlayMode.Live -> {
                if (!thermalSnapshot.streamingEnabled || thermalSnapshot.host.isNullOrBlank()) {
                    ThermalRuntimeState.Error
                } else if (thermalSnapshot.connected && thermalSnapshot.healthy) {
                    val ageNanos = thermalSnapshot.lastFrameAtElapsedNanos?.let { timestamp ->
                        currentElapsedRealtimeNanos - timestamp
                    }
                    if (ageNanos != null && ageNanos > THERMAL_STALE_THRESHOLD_NANOS) {
                        ThermalRuntimeState.Stale
                    } else {
                        ThermalRuntimeState.Streaming
                    }
                } else if (thermalSnapshot.connected) {
                    ThermalRuntimeState.Connecting
                } else if (thermalSnapshot.lastError != null) {
                    ThermalRuntimeState.Error
                } else {
                    ThermalRuntimeState.Connecting
                }
            }
        }
    }

    private fun buildThermalDetailText(
        thermalMode: ThermalOverlayMode,
        runtimeState: ThermalRuntimeState,
        thermalSnapshot: ThermalStreamSnapshot,
    ): String {
        return when (thermalMode) {
            ThermalOverlayMode.Off -> "Thermal overlay disabled"
            ThermalOverlayMode.Placeholder -> "Placeholder thermal shading active"
            ThermalOverlayMode.Live -> {
                when (runtimeState) {
                    ThermalRuntimeState.Streaming -> "Live thermal stream stable"
                    ThermalRuntimeState.Connecting -> "Waiting for Jetson thermal stream"
                    ThermalRuntimeState.Stale -> "Thermal stream stale; awaiting fresh frames"
                    ThermalRuntimeState.Error -> sanitizeThermalError(thermalSnapshot.lastError)
                    ThermalRuntimeState.Off -> "Thermal overlay disabled"
                    ThermalRuntimeState.Placeholder -> "Placeholder thermal shading active"
                }
            }
        }
    }

    private fun sanitizeThermalError(
        error: String?,
    ): String {
        return error?.takeIf { it.isNotBlank() } ?: "Thermal stream unavailable"
    }

    private fun formatThermalRange(
        metadata: ThermalMetadata?,
    ): String {
        val min = metadata?.minCelsius
        val max = metadata?.maxCelsius
        return if (min != null && max != null) {
            String.format(Locale.US, "%.1fC / %.1fC", min, max)
        } else {
            "--"
        }
    }

    private fun formatThermalCenter(
        metadata: ThermalMetadata?,
    ): String {
        val center = metadata?.centerCelsius
        return if (center != null) {
            String.format(Locale.US, "%.1fC", center)
        } else {
            "--"
        }
    }

    private fun formatThermalCaptureFps(
        metadata: ThermalMetadata?,
    ): String {
        val captureFps = metadata?.captureFpsObserved
        return if (captureFps != null) {
            String.format(Locale.US, "%.1f FPS", captureFps)
        } else {
            "--"
        }
    }

    private fun beginAutoCalibrationSession() {
        autoCalibrationSessionSource = AutoCalibrationSessionSource.None
        lastHandledCalibrationFingerprint = null
        if (!uiState.value.connected) {
            updateAutoCalibrationUiState(
                AutoCalibrationUiDescriptor(
                    mode = CalibrationMode.WaitingForVisibleSource,
                    progress = 0.06f,
                    completionSummary = "Visible source not active yet.",
                    guidanceText = "Start live view on 8090 to enable the sender-owned preview source.",
                    readinessText = "Current calibration remains active until the live visible source is available.",
                    backendStateLabel = CalibrationBackendState.WaitingForVisibleSource.wireValue,
                ),
            )
            return
        }
        updateAutoCalibrationUiState(
            AutoCalibrationUiDescriptor(
                mode = CalibrationMode.Idle,
                progress = 0.03f,
                completionSummary = "Checking calibration backend.",
                guidanceText = "Keep the live 8090 session active while readiness is checked.",
                readinessText = "No new calibration will be applied unless a candidate passes validation.",
                usingBackend = true,
            ),
        )
        autoCalibrationJob = viewModelScope.launch {
            delay(AUTO_CALIBRATION_BACKEND_GRACE_MS)
            if (
                menuState.value.currentMenu != NevexMenuScreen.ThermalAutoCalibration ||
                !uiState.value.connected ||
                autoCalibrationSessionSource != AutoCalibrationSessionSource.None
            ) {
                return@launch
            }
            autoCalibrationSessionSource = AutoCalibrationSessionSource.Fallback
            updateAutoCalibrationUiState(
                AutoCalibrationUiDescriptor(
                    mode = CalibrationMode.Idle,
                    progress = 0.05f,
                    completionSummary = "Calibration backend unavailable. Using local guided shell.",
                    guidanceText = "Fallback guidance remains available without changing the normal live-view activation path.",
                    readinessText = "Current calibration remains active unless a later accepted result replaces it.",
                    fallbackActive = true,
                ),
            )
            runFallbackAutoCalibration()
        }
    }

    private suspend fun runFallbackAutoCalibration() {
        animateAutoCalibrationStage(
            mode = CalibrationMode.WaitingForMotion,
            fromProgress = 0f,
            toProgress = 0.20f,
            durationMs = AUTO_CALIBRATION_WAITING_DURATION_MS,
            completionSummary = "Waiting for shared motion.",
            guidanceText = "Warm hand through both fields of view.",
        )
        animateAutoCalibrationStage(
            mode = CalibrationMode.Capturing,
            fromProgress = 0.20f,
            toProgress = 0.86f,
            durationMs = AUTO_CALIBRATION_CAPTURING_DURATION_MS,
            completionSummary = "Collecting calibration samples.",
            guidanceText = "Keep the motion slow, broad, and centered.",
        )
        animateAutoCalibrationStage(
            mode = CalibrationMode.Processing,
            fromProgress = 0.86f,
            toProgress = 1f,
            durationMs = AUTO_CALIBRATION_PROCESSING_DURATION_MS,
            completionSummary = "Solving transform.",
            guidanceText = "Hold the pass steady while the local shell completes.",
        )
        val summary = applyAutoCalibrationStubResult()
        updateAutoCalibrationUiState(
            AutoCalibrationUiDescriptor(
                mode = CalibrationMode.Complete,
                progress = 1f,
                completionSummary = summary,
                guidanceText = "Fallback coarse start applied. Continue into manual alignment for final trim.",
                readinessText = "The fallback shell supplied a coarse start because the backend was unavailable.",
                fallbackActive = true,
            ),
        )
        soundManager.playCalibrationComplete()
        Log.i("NevexXrUi", "Auto calibration fallback applied: $summary")
    }

    private suspend fun animateAutoCalibrationStage(
        mode: CalibrationMode,
        fromProgress: Float,
        toProgress: Float,
        durationMs: Long,
        completionSummary: String,
        guidanceText: String,
    ) {
        if (durationMs <= 0L) {
            updateAutoCalibrationUiState(
                AutoCalibrationUiDescriptor(
                    mode = mode,
                    progress = toProgress,
                    completionSummary = completionSummary,
                    guidanceText = guidanceText,
                    fallbackActive = true,
                ),
            )
            return
        }

        val steps = (durationMs / AUTO_CALIBRATION_PROGRESS_TICK_MS).coerceAtLeast(1L).toInt()
        for (stepIndex in 0..steps) {
            val fraction = stepIndex / steps.toFloat()
            val progress = fromProgress + ((toProgress - fromProgress) * fraction)
            updateAutoCalibrationUiState(
                AutoCalibrationUiDescriptor(
                    mode = mode,
                    progress = progress,
                    completionSummary = completionSummary,
                    guidanceText = guidanceText,
                    fallbackActive = true,
                ),
            )
            if (stepIndex < steps) {
                delay(AUTO_CALIBRATION_PROGRESS_TICK_MS)
            }
        }
    }

    private fun applyBackendCalibrationState(
        calibrationSnapshot: CalibrationServiceSnapshot,
    ) {
        val status = calibrationSnapshot.status
        val matchedSampleCount = status.matchedSampleCount.takeIf { it > 0 }
            ?: calibrationSnapshot.result?.matchedSampleCount
        val rejectedSampleCount = status.rejectedSampleCount.takeIf { it > 0 }
        val overlapReadinessState = status.overlapReadinessState
            ?: calibrationSnapshot.result?.overlapReadinessState
            ?: calibrationSnapshot.healthOverlapReadinessState
        val overlapPhysicallyViable = status.overlapReadiness?.physicallyViable
        val overlapBlockingFactors = status.overlapReadiness?.blockingFactors.orEmpty()
        val overlapRecommendedAction = status.overlapReadiness?.recommendedAction
            ?.takeIf { it.isNotBlank() }
            ?: if (overlapPhysicallyViable == false) {
                "Stabilize mounts and move a warm target slowly through the shared center region."
            } else {
                null
            }
        val readinessText = status.readinessSummary?.takeIf { it.isNotBlank() }
            ?: calibrationSnapshot.result?.overlapReadinessSummary?.takeIf { it.isNotBlank() }
            ?: if (overlapPhysicallyViable == false) {
                "Physical overlap is not ready yet. No new calibration will be attempted or applied."
            } else {
                null
            }
        val sampleQualitySummary = status.sampleQualitySummary
        val descriptor = when (status.calibrationState) {
            CalibrationBackendState.WaitingForVisibleSource -> AutoCalibrationUiDescriptor(
                mode = CalibrationMode.WaitingForVisibleSource,
                progress = 0.08f,
                completionSummary = "Visible source not active yet.",
                guidanceText = "Keep the normal 8090 live session connected.",
                readinessText = readinessText
                    ?: "Current calibration remains active until the visible preview source is available.",
                overlapReadinessState = overlapReadinessState,
                overlapPhysicallyViable = overlapPhysicallyViable,
                overlapRecommendedAction = overlapRecommendedAction,
                overlapBlockingFactors = overlapBlockingFactors,
                sampleQualitySummary = sampleQualitySummary,
                matchedSampleCount = matchedSampleCount,
                rejectedSampleCount = rejectedSampleCount,
                backendStateLabel = status.calibrationState.wireValue,
                usingBackend = true,
            )

            CalibrationBackendState.WaitingForMotion -> AutoCalibrationUiDescriptor(
                mode = CalibrationMode.WaitingForMotion,
                progress = 0.16f,
                completionSummary = "Shared motion not established yet.",
                guidanceText = "Wave a warm hand through both fields of view.",
                readinessText = readinessText
                    ?: "Slow, broad motion in the shared center region improves readiness.",
                overlapReadinessState = overlapReadinessState,
                overlapPhysicallyViable = overlapPhysicallyViable,
                overlapRecommendedAction = overlapRecommendedAction,
                overlapBlockingFactors = overlapBlockingFactors,
                sampleQualitySummary = sampleQualitySummary,
                matchedSampleCount = matchedSampleCount,
                rejectedSampleCount = rejectedSampleCount,
                backendStateLabel = status.calibrationState.wireValue,
                usingBackend = true,
            )

            CalibrationBackendState.CollectingSamples -> AutoCalibrationUiDescriptor(
                mode = CalibrationMode.Capturing,
                progress = 0.22f + (
                    (matchedSampleCount ?: 0).coerceIn(0, 16) / 16f
                    ) * 0.58f,
                completionSummary = "Collecting calibration samples.",
                guidanceText = "Keep motion slow and broad through the shared center region.",
                readinessText = readinessText,
                overlapReadinessState = overlapReadinessState,
                overlapPhysicallyViable = overlapPhysicallyViable,
                overlapRecommendedAction = overlapRecommendedAction,
                overlapBlockingFactors = overlapBlockingFactors,
                sampleQualitySummary = sampleQualitySummary,
                matchedSampleCount = matchedSampleCount,
                rejectedSampleCount = rejectedSampleCount,
                backendStateLabel = status.calibrationState.wireValue,
                usingBackend = true,
            )

            CalibrationBackendState.Solving -> AutoCalibrationUiDescriptor(
                mode = CalibrationMode.Processing,
                progress = 0.90f,
                completionSummary = "Solving transform.",
                guidanceText = "Hold briefly while the backend evaluates the pass.",
                readinessText = readinessText,
                overlapReadinessState = overlapReadinessState,
                overlapPhysicallyViable = overlapPhysicallyViable,
                overlapRecommendedAction = overlapRecommendedAction,
                overlapBlockingFactors = overlapBlockingFactors,
                sampleQualitySummary = sampleQualitySummary,
                matchedSampleCount = matchedSampleCount,
                rejectedSampleCount = rejectedSampleCount,
                backendStateLabel = status.calibrationState.wireValue,
                usingBackend = true,
            )

            CalibrationBackendState.ResultReady -> AutoCalibrationUiDescriptor(
                mode = CalibrationMode.Processing,
                progress = 0.96f,
                completionSummary = "Result ready. Validating before apply.",
                guidanceText = "Candidate received. Running the local safety gate now.",
                readinessText = readinessText,
                overlapReadinessState = overlapReadinessState,
                overlapPhysicallyViable = overlapPhysicallyViable,
                overlapRecommendedAction = overlapRecommendedAction,
                overlapBlockingFactors = overlapBlockingFactors,
                sampleQualitySummary = sampleQualitySummary,
                matchedSampleCount = matchedSampleCount,
                rejectedSampleCount = rejectedSampleCount,
                backendStateLabel = status.calibrationState.wireValue,
                usingBackend = true,
            )

            CalibrationBackendState.LowConfidence -> AutoCalibrationUiDescriptor(
                mode = CalibrationMode.LowConfidence,
                progress = 1f,
                completionSummary = "No usable solve yet. Current calibration remains active.",
                guidanceText = "Current calibration remains active. Continue with manual alignment or retry later.",
                readinessText = readinessText
                    ?: "Weak overlap or limited shared motion is a normal early setup outcome.",
                overlapReadinessState = overlapReadinessState,
                overlapPhysicallyViable = overlapPhysicallyViable,
                overlapRecommendedAction = overlapRecommendedAction,
                overlapBlockingFactors = overlapBlockingFactors,
                sampleQualitySummary = sampleQualitySummary,
                matchedSampleCount = matchedSampleCount,
                rejectedSampleCount = rejectedSampleCount,
                backendStateLabel = status.calibrationState.wireValue,
                usingBackend = true,
            )

            CalibrationBackendState.Failed -> AutoCalibrationUiDescriptor(
                mode = CalibrationMode.Failed,
                progress = 1f,
                completionSummary = "No calibration change was applied.",
                guidanceText = "Current calibration remains active. Continue with manual alignment or retry later.",
                readinessText = readinessText
                    ?: "The pass ended without a usable solve. This is normal while overlap remains provisional.",
                overlapReadinessState = overlapReadinessState,
                overlapPhysicallyViable = overlapPhysicallyViable,
                overlapRecommendedAction = overlapRecommendedAction,
                overlapBlockingFactors = overlapBlockingFactors,
                sampleQualitySummary = sampleQualitySummary,
                matchedSampleCount = matchedSampleCount,
                rejectedSampleCount = rejectedSampleCount,
                backendStateLabel = status.calibrationState.wireValue,
                usingBackend = true,
            )

            CalibrationBackendState.Unknown -> AutoCalibrationUiDescriptor(
                mode = CalibrationMode.Idle,
                progress = 0.04f,
                completionSummary = "Awaiting calibration backend state.",
                guidanceText = "Hold the current calibration while the backend reports status.",
                readinessText = readinessText ?: calibrationSnapshot.lastError,
                overlapReadinessState = overlapReadinessState,
                overlapPhysicallyViable = overlapPhysicallyViable,
                overlapRecommendedAction = overlapRecommendedAction,
                overlapBlockingFactors = overlapBlockingFactors,
                sampleQualitySummary = sampleQualitySummary,
                matchedSampleCount = matchedSampleCount,
                rejectedSampleCount = rejectedSampleCount,
                backendStateLabel = null,
                usingBackend = true,
            )
        }
        updateAutoCalibrationUiState(descriptor)
    }

    private fun maybeApplyAcceptedCalibration(
        calibrationSnapshot: CalibrationServiceSnapshot,
    ) {
        if (calibrationSnapshot.status.calibrationState != CalibrationBackendState.ResultReady) {
            return
        }
        val status = calibrationSnapshot.status
        val candidate = calibrationSnapshot.result ?: status.candidateTransform ?: run {
            updateAutoCalibrationUiState(
                AutoCalibrationUiDescriptor(
                    mode = CalibrationMode.Failed,
                    progress = 1f,
                    completionSummary = "No calibration change was applied because the result payload was missing.",
                    guidanceText = "Current ${currentCalibrationSourceLabel()} calibration remains active. Continue with manual alignment or retry later.",
                    readinessText = status.readinessSummary
                        ?: calibrationSnapshot.result?.overlapReadinessSummary
                        ?: "The backend reported readiness without a usable result payload.",
                    overlapReadinessState = status.overlapReadinessState
                        ?: calibrationSnapshot.result?.overlapReadinessState
                        ?: calibrationSnapshot.healthOverlapReadinessState,
                    overlapPhysicallyViable = status.overlapReadiness?.physicallyViable,
                    overlapRecommendedAction = status.overlapReadiness?.recommendedAction
                        ?.takeIf { it.isNotBlank() }
                        ?: if (status.overlapReadiness?.physicallyViable == false) {
                            "Stabilize mounts and move a warm target slowly through the shared center region."
                        } else {
                            null
                        },
                    overlapBlockingFactors = status.overlapReadiness?.blockingFactors.orEmpty(),
                    sampleQualitySummary = status.sampleQualitySummary,
                    matchedSampleCount = status.matchedSampleCount.takeIf { it > 0 },
                    rejectedSampleCount = status.rejectedSampleCount.takeIf { it > 0 },
                    backendStateLabel = status.calibrationState.wireValue,
                    usingBackend = true,
                ),
            )
            soundManager.playCalibrationFail()
            return
        }
        val fingerprint = buildCalibrationFingerprint(candidate, status)
        if (lastHandledCalibrationFingerprint == fingerprint) {
            return
        }
        val decision = evaluateCalibrationCandidate(candidate, status)
        if (!decision.accepted) {
            lastHandledCalibrationFingerprint = fingerprint
            updateAutoCalibrationUiState(
                AutoCalibrationUiDescriptor(
                    mode = CalibrationMode.LowConfidence,
                    progress = 1f,
                    completionSummary = "No good calibration was applied. ${decision.reason}",
                    guidanceText = "Current ${currentCalibrationSourceLabel()} calibration remains active. Continue with manual alignment or retry later.",
                    readinessText = status.readinessSummary
                        ?: calibrationSnapshot.result?.overlapReadinessSummary
                        ?: "Weak overlap or limited shared motion prevented a usable automatic solve.",
                    overlapReadinessState = status.overlapReadinessState
                        ?: calibrationSnapshot.result?.overlapReadinessState
                        ?: calibrationSnapshot.healthOverlapReadinessState,
                    overlapPhysicallyViable = status.overlapReadiness?.physicallyViable,
                    overlapRecommendedAction = status.overlapReadiness?.recommendedAction
                        ?.takeIf { it.isNotBlank() }
                        ?: if (status.overlapReadiness?.physicallyViable == false) {
                            "Stabilize mounts and move a warm target slowly through the shared center region."
                        } else {
                            null
                        },
                    overlapBlockingFactors = status.overlapReadiness?.blockingFactors.orEmpty(),
                    sampleQualitySummary = status.sampleQualitySummary,
                    matchedSampleCount = candidate.matchedSampleCount ?: status.matchedSampleCount.takeIf { it > 0 },
                    rejectedSampleCount = status.rejectedSampleCount.takeIf { it > 0 },
                    backendStateLabel = status.calibrationState.wireValue,
                    usingBackend = true,
                ),
            )
            soundManager.playCalibrationFail()
            Log.w("NevexXrUi", "Auto calibration rejected: ${decision.reason}")
            return
        }

        setThermalOffsetX(requireNotNull(decision.normalizedOffsetXFraction))
        setThermalOffsetY(requireNotNull(decision.normalizedOffsetYFraction))
        setThermalScale(requireNotNull(decision.scale))
        setThermalCalibrationStatus(ThermalCalibrationStatus.Auto)
        lastHandledCalibrationFingerprint = fingerprint

        val summary = String.format(
            Locale.US,
            "Accepted coarse start: X %+.3f, Y %+.3f, S %.3fx",
            thermalTransformState.value.offsetXFraction,
            thermalTransformState.value.offsetYFraction,
            thermalTransformState.value.scale,
        )
        updateAutoCalibrationUiState(
            AutoCalibrationUiDescriptor(
                mode = CalibrationMode.Complete,
                progress = 1f,
                completionSummary = summary,
                guidanceText = "Backend result accepted. Continue directly into manual alignment for final trim if needed.",
                readinessText = status.readinessSummary
                    ?: calibrationSnapshot.result?.overlapReadinessSummary
                    ?: "A usable coarse start was accepted. Manual refinement remains available.",
                overlapReadinessState = status.overlapReadinessState
                    ?: calibrationSnapshot.result?.overlapReadinessState
                    ?: calibrationSnapshot.healthOverlapReadinessState,
                overlapPhysicallyViable = status.overlapReadiness?.physicallyViable,
                overlapRecommendedAction = status.overlapReadiness?.recommendedAction?.takeIf { it.isNotBlank() },
                overlapBlockingFactors = status.overlapReadiness?.blockingFactors.orEmpty(),
                sampleQualitySummary = status.sampleQualitySummary,
                matchedSampleCount = candidate.matchedSampleCount ?: status.matchedSampleCount.takeIf { it > 0 },
                rejectedSampleCount = status.rejectedSampleCount.takeIf { it > 0 },
                backendStateLabel = status.calibrationState.wireValue,
                usingBackend = true,
            ),
        )
        soundManager.playCalibrationComplete()
        Log.i("NevexXrUi", "Auto calibration applied from backend: $summary")
    }

    private fun evaluateCalibrationCandidate(
        candidate: CalibrationCandidateResult,
        status: com.nevex.xr.nativeapp.calibration.CalibrationStatusSnapshot,
    ): CalibrationAcceptanceDecision {
        if (!(candidate.published || candidate.solveValid || status.published || status.solveValid)) {
            return CalibrationAcceptanceDecision(
                accepted = false,
                reason = "Calibration result was not published as valid.",
            )
        }

        val offsetX = candidate.offsetX ?: return CalibrationAcceptanceDecision(
            accepted = false,
            reason = "Calibration result X offset missing.",
        )
        val offsetY = candidate.offsetY ?: return CalibrationAcceptanceDecision(
            accepted = false,
            reason = "Calibration result Y offset missing.",
        )
        val scale = candidate.scale ?: return CalibrationAcceptanceDecision(
            accepted = false,
            reason = "Calibration result scale missing.",
        )
        if (scale <= 0f) {
            return CalibrationAcceptanceDecision(
                accepted = false,
                reason = "Calibration result scale was non-positive.",
            )
        }
        if (scale < CALIBRATION_SCALE_MIN_ACCEPT || scale > CALIBRATION_SCALE_MAX_ACCEPT) {
            return CalibrationAcceptanceDecision(
                accepted = false,
                reason = String.format(Locale.US, "Calibration scale %.3fx was outside the safe range.", scale),
            )
        }

        val matchedSampleCount = candidate.matchedSampleCount ?: status.matchedSampleCount
        if (matchedSampleCount < CALIBRATION_MIN_MATCHED_SAMPLES) {
            return CalibrationAcceptanceDecision(
                accepted = false,
                reason = "Calibration result used too few matched samples ($matchedSampleCount).",
            )
        }

        val confidence = candidate.confidence ?: return CalibrationAcceptanceDecision(
            accepted = false,
            reason = "Calibration confidence missing.",
        )
        if (confidence < CALIBRATION_MIN_CONFIDENCE) {
            return CalibrationAcceptanceDecision(
                accepted = false,
                reason = String.format(Locale.US, "Calibration confidence %.3f was below the acceptance floor.", confidence),
            )
        }

        val residualRmsePx = candidate.residualRmsePx ?: return CalibrationAcceptanceDecision(
            accepted = false,
            reason = "Calibration residual RMSE missing.",
        )
        if (residualRmsePx > CALIBRATION_MAX_RMSE_PX) {
            return CalibrationAcceptanceDecision(
                accepted = false,
                reason = String.format(Locale.US, "Calibration residual %.1f px exceeded the acceptance ceiling.", residualRmsePx),
            )
        }

        val widthPx = candidate.visibleWidthPx?.toFloat()
            ?: leftEyeUiState.value.bitmap?.width?.toFloat()
            ?: rightEyeUiState.value.bitmap?.width?.toFloat()
            ?: return CalibrationAcceptanceDecision(
                accepted = false,
                reason = "Visible frame width unavailable for calibration normalization.",
            )
        val heightPx = candidate.visibleHeightPx?.toFloat()
            ?: leftEyeUiState.value.bitmap?.height?.toFloat()
            ?: rightEyeUiState.value.bitmap?.height?.toFloat()
            ?: return CalibrationAcceptanceDecision(
                accepted = false,
                reason = "Visible frame height unavailable for calibration normalization.",
            )
        if (widthPx <= 0f || heightPx <= 0f) {
            return CalibrationAcceptanceDecision(
                accepted = false,
                reason = "Visible frame dimensions were invalid.",
            )
        }

        val normalizedOffsetXFraction = offsetX / widthPx
        val normalizedOffsetYFraction = offsetY / heightPx
        if (normalizedOffsetXFraction.absoluteValue > CALIBRATION_OFFSET_MAX_ACCEPT_FRACTION) {
            return CalibrationAcceptanceDecision(
                accepted = false,
                reason = String.format(
                    Locale.US,
                    "Calibration X offset %.3f was outside the safe range after normalization.",
                    normalizedOffsetXFraction,
                ),
            )
        }
        if (normalizedOffsetYFraction.absoluteValue > CALIBRATION_OFFSET_MAX_ACCEPT_FRACTION) {
            return CalibrationAcceptanceDecision(
                accepted = false,
                reason = String.format(
                    Locale.US,
                    "Calibration Y offset %.3f was outside the safe range after normalization.",
                    normalizedOffsetYFraction,
                ),
            )
        }

        return CalibrationAcceptanceDecision(
            accepted = true,
            reason = "Accepted",
            normalizedOffsetXFraction = normalizedOffsetXFraction,
            normalizedOffsetYFraction = normalizedOffsetYFraction,
            scale = scale,
        )
    }

    private fun buildCalibrationFingerprint(
        candidate: CalibrationCandidateResult,
        status: com.nevex.xr.nativeapp.calibration.CalibrationStatusSnapshot,
    ): String {
        return listOf(
            candidate.offsetX,
            candidate.offsetY,
            candidate.scale,
            candidate.visibleWidthPx,
            candidate.visibleHeightPx,
            candidate.confidence,
            candidate.residualRmsePx,
            candidate.matchedSampleCount,
            candidate.solveValid,
            candidate.published,
            status.solveValid,
            status.published,
        ).joinToString(separator = "|") { part ->
            part?.toString() ?: "null"
        }
    }

    private fun updateAutoCalibrationUiState(
        descriptor: AutoCalibrationUiDescriptor,
    ) {
        menuState.update { currentState ->
            currentState.copy(
                thermalAlignment = currentState.thermalAlignment.copy(
                    autoCalibration = currentState.thermalAlignment.autoCalibration.copy(
                        mode = descriptor.mode,
                        progress = descriptor.progress.coerceIn(0f, 1f),
                        completionSummary = descriptor.completionSummary,
                        guidanceText = descriptor.guidanceText,
                        readinessText = descriptor.readinessText,
                        overlapReadinessState = descriptor.overlapReadinessState,
                        overlapPhysicallyViable = descriptor.overlapPhysicallyViable,
                        overlapRecommendedAction = descriptor.overlapRecommendedAction,
                        overlapBlockingFactors = descriptor.overlapBlockingFactors,
                        sampleQualitySummary = descriptor.sampleQualitySummary,
                        matchedSampleCount = descriptor.matchedSampleCount,
                        rejectedSampleCount = descriptor.rejectedSampleCount,
                        backendStateLabel = descriptor.backendStateLabel,
                        usingBackend = descriptor.usingBackend,
                        fallbackActive = descriptor.fallbackActive,
                    ),
                ),
            )
        }
    }

    private fun cancelAutoCalibration(
        resetState: Boolean,
    ) {
        autoCalibrationJob?.cancel()
        autoCalibrationJob = null
        autoCalibrationSessionSource = AutoCalibrationSessionSource.None
        lastHandledCalibrationFingerprint = null
        if (resetState) {
            updateAutoCalibrationUiState(
                AutoCalibrationUiDescriptor(
                    mode = CalibrationMode.Idle,
                    progress = 0f,
                    completionSummary = "No automatic calibration run yet",
                ),
            )
        }
    }

    private fun applyAutoCalibrationStubResult(): String {
        val currentTransform = thermalTransformState.value
        val nextOffsetX = currentTransform.offsetXFraction + AUTO_CALIBRATION_OFFSET_X_DELTA
        val nextOffsetY = currentTransform.offsetYFraction + AUTO_CALIBRATION_OFFSET_Y_DELTA
        val nextScale = currentTransform.scale + AUTO_CALIBRATION_SCALE_DELTA

        setThermalOffsetX(nextOffsetX)
        setThermalOffsetY(nextOffsetY)
        setThermalScale(nextScale)

        return String.format(
            Locale.US,
            "Applied fallback shell transform: X %+.3f, Y %+.3f, S %.3fx",
            thermalTransformState.value.offsetXFraction,
            thermalTransformState.value.offsetYFraction,
            thermalTransformState.value.scale,
        )
    }

    private fun updateThermalCalibrationStatusForCurrentTransform() {
        setThermalCalibrationStatus(
            resolveThermalCalibrationStatus(thermalTransformState.value),
        )
    }

    private fun setThermalCalibrationStatus(
        status: ThermalCalibrationStatus,
    ) {
        menuState.update { currentState ->
            currentState.copy(
                thermalAlignment = currentState.thermalAlignment.copy(
                    calibrationStatus = status,
                ),
            )
        }
    }

    private fun currentCalibrationSourceLabel(): String {
        return menuState.value.thermalAlignment.calibrationStatus.label.lowercase(Locale.US)
    }

    private fun resolveThermalCalibrationStatus(
        transform: ThermalOverlayTransform,
        restoredFromStore: Boolean = false,
    ): ThermalCalibrationStatus {
        return when {
            restoredFromStore && !transform.isDefaultCalibration() -> ThermalCalibrationStatus.Restored
            transform.isDefaultCalibration() -> ThermalCalibrationStatus.Default
            else -> ThermalCalibrationStatus.Manual
        }
    }
}

private fun formatByteCount(value: Int): String {
    return when {
        value >= 1024 * 1024 -> String.format(Locale.US, "%.1f MB", value / (1024f * 1024f))
        value >= 1024 -> String.format(Locale.US, "%.1f KB", value / 1024f)
        else -> "$value B"
    }
}

private fun formatMilliseconds(value: Float): String {
    return String.format(Locale.US, "%.2f ms", value)
}

private fun formatCaptureTimestamp(value: Long): String {
    return String.format(Locale.US, "%tT", value)
}

private fun formatBitmapReuse(stats: BitmapReuseStats): String {
    val hitRatePercent = stats.reuseHitRatePercent
    return if (hitRatePercent != null) {
        String.format(
            Locale.US,
            "%.1f%% (%d/%d, fallback=%d)",
            hitRatePercent,
            stats.reuseHitCount,
            stats.reuseAttemptCount,
            stats.reuseFallbackCount,
        )
    } else {
        "Warming (${stats.decodeCount} decodes)"
    }
}

private fun Int.floorMod(modulus: Int): Int {
    return ((this % modulus) + modulus) % modulus
}

private fun ThermalOverlayTransform.isDefaultCalibration(): Boolean {
    return offsetXFraction.isNearZero() &&
        offsetYFraction.isNearZero() &&
        (scale - 1f).absoluteValue <= THERMAL_ALIGNMENT_COMPARISON_EPSILON &&
        cropLeftFraction.isNearZero() &&
        cropTopFraction.isNearZero() &&
        cropRightFraction.isNearZero() &&
        cropBottomFraction.isNearZero()
}

private fun Float.isNearZero(): Boolean {
    return absoluteValue <= THERMAL_ALIGNMENT_COMPARISON_EPSILON
}

private fun DisplaySettingsUiState.primaryViewingMode(): ViewingMode {
    return when {
        thermalPreviewModeEnabled -> ViewingMode.ThermalOverlay
        thermalOnlyModeEnabled && thermalMode != ThermalOverlayMode.Off -> ViewingMode.ThermalOnly
        thermalMode == ThermalOverlayMode.Off -> ViewingMode.Visible
        else -> ViewingMode.ThermalOverlay
    }
}

private fun DisplaySettingsUiState.persistedViewingMode(): PersistedViewingMode {
    return when {
        thermalOnlyModeEnabled && thermalMode != ThermalOverlayMode.Off -> PersistedViewingMode.ThermalOnly
        thermalMode == ThermalOverlayMode.Live -> PersistedViewingMode.ThermalOverlay
        else -> PersistedViewingMode.Visible
    }
}

private fun DisplaySettingsUiState.effectiveThermalMode(): ThermalOverlayMode {
    return if (thermalPreviewModeEnabled) {
        ThermalOverlayMode.Live
    } else {
        thermalMode
    }
}

private fun missionProfileDefaults(
    profile: MissionProfile,
): MissionProfileDefaults {
    return when (profile) {
        MissionProfile.Inspection -> MissionProfileDefaults(
            preferredViewingMode = ViewingMode.Visible,
            reticleEnabled = false,
            gridEnabled = false,
            boundingBoxesEnabled = false,
            thermalVisualMode = ThermalVisualMode.WhiteHot,
            thermalPreviewOpacityPreset = ThermalPreviewOpacityPreset.P25,
            soundVolume = 0.60f,
        )

        MissionProfile.Rescue -> MissionProfileDefaults(
            preferredViewingMode = ViewingMode.ThermalOverlay,
            reticleEnabled = true,
            gridEnabled = false,
            boundingBoxesEnabled = false,
            thermalVisualMode = ThermalVisualMode.WhiteHot,
            thermalPreviewOpacityPreset = ThermalPreviewOpacityPreset.P40,
            soundVolume = 0.62f,
        )

        MissionProfile.Tactical -> MissionProfileDefaults(
            preferredViewingMode = ViewingMode.Visible,
            reticleEnabled = true,
            gridEnabled = false,
            boundingBoxesEnabled = false,
            thermalVisualMode = ThermalVisualMode.BlackHot,
            thermalPreviewOpacityPreset = ThermalPreviewOpacityPreset.P10,
            soundVolume = 0.38f,
        )

        MissionProfile.Marine -> MissionProfileDefaults(
            preferredViewingMode = ViewingMode.ThermalOverlay,
            reticleEnabled = true,
            gridEnabled = true,
            boundingBoxesEnabled = false,
            thermalVisualMode = ThermalVisualMode.BlackHot,
            thermalPreviewOpacityPreset = ThermalPreviewOpacityPreset.P25,
            soundVolume = 0.48f,
        )
    }
}

private fun currentMissionProfileSelectionIndex(profile: MissionProfile): Int {
    return when (profile) {
        MissionProfile.Inspection -> MenuSelectionIndex.MissionProfiles.Inspection
        MissionProfile.Rescue -> MenuSelectionIndex.MissionProfiles.Rescue
        MissionProfile.Tactical -> MenuSelectionIndex.MissionProfiles.Tactical
        MissionProfile.Marine -> MenuSelectionIndex.MissionProfiles.Marine
    }
}

private fun currentThermalPresentationSelectionIndex(
    mode: ThermalVisualMode,
): Int {
    return when (mode) {
        ThermalVisualMode.WhiteHot -> MenuSelectionIndex.ThermalPresentation.WhiteHot
        ThermalVisualMode.BlackHot -> MenuSelectionIndex.ThermalPresentation.BlackHot
    }
}

private fun thermalPresentationPreparedMessage(
    selectionIndex: Int,
): String {
    return when (selectionIndex) {
        MenuSelectionIndex.ThermalPresentation.WarmTargetsOnly -> "WARM TARGETS PREPARED"
        MenuSelectionIndex.ThermalPresentation.ThresholdedThermal -> "THRESHOLD MODE PREPARED"
        MenuSelectionIndex.ThermalPresentation.EdgeAssist -> "EDGE ASSIST PREPARED"
        MenuSelectionIndex.ThermalPresentation.FusionAssist -> "FUSION ASSIST PREPARED"
        else -> "THERMAL MODE PREPARED"
    }
}
