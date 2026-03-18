package com.nevex.xr.nativeapp.ui

import android.content.Context
import android.view.KeyEvent
import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nevex.xr.nativeapp.PresenterExperimentMode
import com.nevex.xr.nativeapp.stream.BitmapReuseStats
import com.nevex.xr.nativeapp.stream.JetsonEndpoint
import com.nevex.xr.nativeapp.stream.JetsonLifecycle
import com.nevex.xr.nativeapp.stream.JetsonStreamRepository
import com.nevex.xr.nativeapp.stream.StereoEyeFramePresentedEvent
import com.nevex.xr.nativeapp.stream.StereoEyePresenterReceiveEvent
import com.nevex.xr.nativeapp.stream.StereoFrameLayoutHint
import com.nevex.xr.nativeapp.ui.audio.NoOpSoundManager
import com.nevex.xr.nativeapp.ui.audio.SoundManager
import com.nevex.xr.nativeapp.ui.audio.createSoundManager
import com.nevex.xr.nativeapp.ui.state.BootSequencePhase
import com.nevex.xr.nativeapp.ui.state.BootSequenceUiState
import com.nevex.xr.nativeapp.ui.state.DetectionBox
import com.nevex.xr.nativeapp.ui.state.MenuSelectionIndex
import com.nevex.xr.nativeapp.ui.state.NevexMenuScreen
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.state.OverlayUiState
import com.nevex.xr.nativeapp.ui.state.SystemStatusMenuUiState
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Locale

private const val DEFAULT_PERFORMANCE_INSTRUMENTATION_ENABLED = true

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

class NevexXrViewModel : ViewModel() {
    private val defaultEndpoint = JetsonEndpoint()
    private val repository = JetsonStreamRepository()
    private var soundManager: SoundManager = NoOpSoundManager
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
    private val bootSequenceState = MutableStateFlow(BootSequenceUiState())
    private var bootSequenceStarted = false

    init {
        repository.setInstrumentationEnabled(performanceInstrumentationEnabled.value)
        repository.setPresenterExperimentMode(presenterExperimentMode.value)
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
    ) { currentUiState, currentFrameUiState, currentMenuState ->
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
                sensorStatus = "Sensor status placeholder",
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
            OverlayUiState(
                reticleEnabled = currentMenuState.displaySettings.reticleEnabled,
                gridEnabled = currentMenuState.displaySettings.gridEnabled,
                boundingBoxesEnabled = currentMenuState.displaySettings.boundingBoxesEnabled,
                thermalOverlayEnabled = currentMenuState.displaySettings.thermalOverlayEnabled,
                overlayOpacity = currentMenuState.settings.overlayOpacity,
                brightness = currentMenuState.settings.brightness,
                contrast = currentMenuState.settings.contrast,
                detections = currentDetections,
                thermalFrame = currentThermalFrame,
                useRealDetections = currentUseRealDetections,
                useRealThermal = currentUseRealThermal,
            )
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = OverlayUiState(),
        )

    val bootSequenceUiState: StateFlow<BootSequenceUiState> = bootSequenceState

    fun onEndpointHostChanged(value: String) {
        endpointHost.value = value
    }

    fun connect() {
        val host = endpointHost.value.trim().ifEmpty { defaultEndpoint.host }
        diagnosticsVisible.value = false
        hideMenu(resetToMain = true)
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
                soundManager.playActivate()
                currentState.copy(
                    isMenuVisible = true,
                    currentMenu = NevexMenuScreen.MainMenu,
                    selectedItemIndex = MenuSelectionIndex.Main.Resume,
                )
            } else {
                soundManager.playBack()
                currentState.copy(isMenuVisible = false)
            }
        }
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

    fun ensureBootSequenceStarted() {
        if (bootSequenceStarted) {
            return
        }
        bootSequenceStarted = true
        startBootSequence()
    }

    fun onStartResumeView() {
        soundManager.playClick()
        hideMenu(resetToMain = false)
    }

    fun openSettingsMenu() {
        soundManager.playClick()
        setMenuScreen(
            screen = NevexMenuScreen.Settings,
            selectedIndex = MenuSelectionIndex.Settings.Brightness,
        )
    }

    fun openDisplaySettingsMenu() {
        soundManager.playClick()
        setMenuScreen(
            screen = NevexMenuScreen.DisplaySettings,
            selectedIndex = MenuSelectionIndex.Display.Reticle,
        )
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
            selectedIndex = MenuSelectionIndex.Main.Resume,
        )
    }

    fun returnToSettingsMenu() {
        soundManager.playBack()
        setMenuScreen(
            screen = NevexMenuScreen.Settings,
            selectedIndex = MenuSelectionIndex.Settings.DisplaySettings,
        )
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
        soundManager.playClick()
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
                if (currentState.selectedItemIndex == MenuSelectionIndex.Main.ToggleMode) {
                    togglePlaceholderMode()
                }
            }

            NevexMenuScreen.Settings -> {
                when (currentState.selectedItemIndex) {
                    MenuSelectionIndex.Settings.Brightness -> {
                        setBrightness(currentState.settings.brightness + (delta * 0.05f))
                    }

                    MenuSelectionIndex.Settings.Contrast -> {
                        setContrast(currentState.settings.contrast + (delta * 0.05f))
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
                        setThermalOverlayEnabled(delta > 0)
                    }
                }
            }

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
                    MenuSelectionIndex.Main.Resume -> onStartResumeView()
                    MenuSelectionIndex.Main.ToggleMode -> togglePlaceholderMode()
                    MenuSelectionIndex.Main.Settings -> openSettingsMenu()
                    MenuSelectionIndex.Main.SystemStatus -> openSystemStatusMenu()
                }
            }

            NevexMenuScreen.Settings -> {
                when (currentState.selectedItemIndex) {
                    MenuSelectionIndex.Settings.DisplaySettings -> openDisplaySettingsMenu()
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
                        setThermalOverlayEnabled(!currentState.displaySettings.thermalOverlayEnabled)
                    }

                    MenuSelectionIndex.Display.ReturnSettings -> returnToSettingsMenu()
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

            NevexMenuScreen.Settings,
            NevexMenuScreen.SystemStatus,
            -> returnToMainMenu()

            NevexMenuScreen.DisplaySettings -> returnToSettingsMenu()
        }
    }

    fun handleMenuKeyInput(keyCode: Int): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_M -> {
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
    }

    fun setReticleEnabled(enabled: Boolean) {
        soundManager.playClick()
        menuState.update { currentState ->
            currentState.copy(
                displaySettings = currentState.displaySettings.copy(reticleEnabled = enabled),
            )
        }
    }

    fun setGridEnabled(enabled: Boolean) {
        soundManager.playClick()
        menuState.update { currentState ->
            currentState.copy(
                displaySettings = currentState.displaySettings.copy(gridEnabled = enabled),
            )
        }
    }

    fun setBoundingBoxesEnabled(enabled: Boolean) {
        soundManager.playClick()
        menuState.update { currentState ->
            currentState.copy(
                displaySettings = currentState.displaySettings.copy(boundingBoxesEnabled = enabled),
            )
        }
    }

    fun setThermalOverlayEnabled(enabled: Boolean) {
        soundManager.playClick()
        menuState.update { currentState ->
            currentState.copy(
                displaySettings = currentState.displaySettings.copy(thermalOverlayEnabled = enabled),
            )
        }
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
        soundManager.release()
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
                    MenuSelectionIndex.Main.Resume
                } else {
                    currentState.selectedItemIndex
                },
            )
        }
    }

    private fun currentMenuItemCount(screen: NevexMenuScreen): Int {
        return when (screen) {
            NevexMenuScreen.MainMenu -> MenuSelectionIndex.Main.Count
            NevexMenuScreen.Settings -> MenuSelectionIndex.Settings.Count
            NevexMenuScreen.DisplaySettings -> MenuSelectionIndex.Display.Count
            NevexMenuScreen.SystemStatus -> MenuSelectionIndex.Status.Count
        }
    }

    private fun startBootSequence() {
        viewModelScope.launch {
            bootSequenceState.value = BootSequenceUiState(
                visible = true,
                phase = BootSequencePhase.Initializing,
            )
            delay(240)
            bootSequenceState.value = BootSequenceUiState(
                visible = true,
                phase = BootSequencePhase.Connecting,
            )
            delay(280)
            bootSequenceState.value = BootSequenceUiState(
                visible = true,
                phase = BootSequencePhase.SystemReady,
            )
            soundManager.playActivate()
            delay(280)
            bootSequenceState.value = bootSequenceState.value.copy(visible = false)
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
