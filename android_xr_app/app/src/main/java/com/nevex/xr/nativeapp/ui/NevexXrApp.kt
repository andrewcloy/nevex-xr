package com.nevex.xr.nativeapp.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color as AndroidColor
import android.graphics.Paint
import android.graphics.RectF
import android.os.SystemClock
import android.util.Log
import android.view.SurfaceHolder
import android.view.SurfaceView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.xr.runtime.Session
import androidx.xr.compose.platform.LocalSession
import androidx.xr.compose.spatial.Subspace
import androidx.xr.compose.subspace.MovePolicy
import androidx.xr.compose.subspace.ResizePolicy
import androidx.xr.compose.subspace.SpatialPanel
import androidx.xr.compose.subspace.SpatialRow
import androidx.xr.compose.subspace.SpatialSpacer
import androidx.xr.compose.subspace.layout.SubspaceModifier
import androidx.xr.compose.subspace.layout.height as subspaceHeight
import androidx.xr.compose.subspace.layout.width as subspaceWidth
import androidx.xr.scenecore.scene
import com.nevex.xr.nativeapp.PresenterExperimentMode
import com.nevex.xr.nativeapp.R
import com.nevex.xr.nativeapp.stream.JetsonLifecycle
import com.nevex.xr.nativeapp.stream.StereoEye
import com.nevex.xr.nativeapp.stream.StereoEyeFramePresentedEvent
import com.nevex.xr.nativeapp.stream.StereoEyePresenterReceiveEvent
import com.nevex.xr.nativeapp.stream.StereoFrameLayoutHint
import com.nevex.xr.nativeapp.stream.StereoPresentationTarget
import com.nevex.xr.nativeapp.ui.boot.BootSequenceOverlay
import com.nevex.xr.nativeapp.ui.menu.MenuOverlayPanel
import com.nevex.xr.nativeapp.ui.overlay.LiveViewOverlayLayer
import com.nevex.xr.nativeapp.ui.state.CaptureFeedbackTone
import com.nevex.xr.nativeapp.ui.state.CaptureFeedbackUiState
import com.nevex.xr.nativeapp.ui.state.CaptureShellUiState
import com.nevex.xr.nativeapp.ui.state.NevexMenuScreen
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.state.OverlayUiState
import com.nevex.xr.nativeapp.ui.state.ThermalOverlayMode
import com.nevex.xr.nativeapp.ui.theme.NevexAccent
import com.nevex.xr.nativeapp.ui.theme.NevexBackground
import com.nevex.xr.nativeapp.ui.theme.NevexBackgroundDeep
import com.nevex.xr.nativeapp.ui.theme.NevexBorder
import com.nevex.xr.nativeapp.ui.theme.NevexDanger
import com.nevex.xr.nativeapp.ui.theme.NevexPanel
import com.nevex.xr.nativeapp.ui.theme.NevexPanelStrong
import com.nevex.xr.nativeapp.ui.theme.NevexSuccess
import com.nevex.xr.nativeapp.ui.theme.NevexTextPrimary
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary
import com.nevex.xr.nativeapp.ui.theme.NevexTheme
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.min
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

private enum class StereoEyePanel(
    val title: String,
    val eyeId: StereoEye,
) {
    Left("Left eye", StereoEye.Left),
    Right("Right eye", StereoEye.Right),
}

private const val UI_LOG_TAG = "NevexXrUi"
private const val EYE_UPDATE_LOG_INTERVAL_FRAMES = 300L
private const val EYE_DISPLAY_ROTATION_DEGREES = 90f
private val StereoBinocularPanelWidth = 1608.dp
private val StereoBinocularPanelHeight = 600.dp
private val StereoBinocularEyeSpacing = 48.dp
private val StereoBinocularFramePadding = 20.dp
private val StereoOverlayMenuWidth = 420.dp
private val StereoMenuPanelWidth = 480.dp
private val StereoMenuPanelHeight = 720.dp
private const val STREAM_HEALTH_STALE_THRESHOLD_NANOS = 850_000_000L
private const val STREAM_HEALTH_CONNECTED_PULSE_MS = 1_200L
private const val STREAM_HEALTH_PULSE_INTERVAL_MS = 250L
private val StreamHealthAmber = Color(0xFFC8A14A)

@Composable
fun NevexXrApp(
    autoConnectOnStart: Boolean = false,
    autoConnectHost: String? = null,
    previewBootModeOnStart: Boolean = false,
    initialPresenterExperimentMode: PresenterExperimentMode = PresenterExperimentMode.NormalBitmap,
    viewModel: NevexXrViewModel = viewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val menuUiState by viewModel.menuUiState.collectAsStateWithLifecycle()
    val overlayUiState by viewModel.overlayUiState.collectAsStateWithLifecycle()
    val bootSequenceUiState by viewModel.bootSequenceUiState.collectAsStateWithLifecycle()
    val captureShellUiState by viewModel.captureShellUiState.collectAsStateWithLifecycle()
    val operatorPreferencesReady by viewModel.operatorPreferencesReady.collectAsStateWithLifecycle()
    val appContext = LocalContext.current.applicationContext
    val session = LocalSession.current
    val presentationTarget = resolvePresentationTarget(session)
    var autoConnectTriggered by remember { mutableStateOf(false) }
    var previewBootConfigured by remember(previewBootModeOnStart) {
        mutableStateOf(!previewBootModeOnStart)
    }

    LaunchedEffect(initialPresenterExperimentMode) {
        viewModel.setPresenterExperimentMode(initialPresenterExperimentMode)
        Log.i(
            UI_LOG_TAG,
            "Presenter experiment mode initialized to ${initialPresenterExperimentMode.wireValue}",
        )
    }

    LaunchedEffect(appContext) {
        viewModel.ensureOperatorPreferencesStoreInitialized(appContext)
        viewModel.ensureSoundManagerInitialized(appContext)
        viewModel.ensureSnapshotStoreInitialized(appContext)
        viewModel.ensureThermalCalibrationStoreInitialized(appContext)
        viewModel.ensureViewingPreferencesStoreInitialized(
            context = appContext,
            restoreViewingModeOnStartup = false,
        )
        viewModel.ensureBootSequenceStarted()
    }

    LaunchedEffect(previewBootModeOnStart, autoConnectHost, previewBootConfigured) {
        if (!previewBootModeOnStart || previewBootConfigured) {
            return@LaunchedEffect
        }

        viewModel.preparePreviewBootMode(autoConnectHost)
        previewBootConfigured = true
    }

    LaunchedEffect(
        autoConnectOnStart,
        autoConnectHost,
        autoConnectTriggered,
        previewBootConfigured,
        operatorPreferencesReady,
        menuUiState.settings.autoConnectOnStartup,
        uiState.connected,
        uiState.hasLiveFrame,
        uiState.lifecycle,
    ) {
        if (
            !previewBootConfigured ||
            !operatorPreferencesReady ||
            !(autoConnectOnStart || menuUiState.settings.autoConnectOnStartup) ||
            autoConnectTriggered ||
            uiState.connected ||
            uiState.hasLiveFrame ||
            uiState.lifecycle == JetsonLifecycle.Connecting ||
            uiState.lifecycle == JetsonLifecycle.WebSocketOpen
        ) {
            return@LaunchedEffect
        }

        autoConnectHost
            ?.trim()
            ?.takeIf { host -> host.isNotEmpty() }
            ?.let(viewModel::onEndpointHostChanged)
        autoConnectTriggered = true
        Log.i(UI_LOG_TAG, "Auto-connect launch hook engaged for operator startup")
        viewModel.connect()
    }

    LaunchedEffect(uiState.hasLiveFrame, presentationTarget, session) {
        if (
            uiState.hasLiveFrame &&
            presentationTarget == StereoPresentationTarget.SpatialPanels &&
            session != null
        ) {
            Log.i(UI_LOG_TAG, "Requesting Full Space after first live frame")
            session.scene.requestFullSpaceMode()
        } else if (uiState.hasLiveFrame) {
            Log.i(UI_LOG_TAG, "XR session unavailable; staying in 2D fallback presentation")
        }
    }

    LaunchedEffect(uiState.presenterExperimentMode) {
        Log.i(
            UI_LOG_TAG,
            "Presenter experiment mode active: ${uiState.presenterExperimentMode.wireValue}",
        )
    }

    NevexTheme {
        val menuOverlayContent: @Composable (Modifier) -> Unit = { modifier ->
            MenuOverlayPanel(
                menuUiState = menuUiState,
                captureUiState = captureShellUiState,
                overlayUiState = overlayUiState,
                onSelectIndex = viewModel::selectMenuIndex,
                onCycleViewingMode = viewModel::cyclePrimaryViewingMode,
                onSetViewingMode = viewModel::setPrimaryViewingMode,
                onOpenMissionProfiles = viewModel::openMissionProfilesMenu,
                onOpenCapture = viewModel::openCaptureMenu,
                onCaptureSnapshot = viewModel::captureSnapshot,
                onToggleRecording = {
                    if (captureShellUiState.recordingActive) {
                        viewModel.stopRecording()
                    } else {
                        viewModel.startRecording()
                    }
                },
                onCloseMenu = viewModel::onStartResumeView,
                onSetMissionProfile = viewModel::setMissionProfile,
                onOpenSettings = viewModel::openSettingsMenu,
                onOpenDisplaySettings = viewModel::openDisplaySettingsMenu,
                onOpenThermalPresentation = viewModel::openThermalPresentationMenu,
                onOpenThermalAlignment = viewModel::openThermalAlignmentMenu,
                onOpenThermalAutoCalibration = viewModel::openThermalAutoCalibrationMenu,
                onOpenSystemStatus = viewModel::openSystemStatusMenu,
                onReturnMain = viewModel::returnToMainMenu,
                onReturnSettings = viewModel::returnToSettingsMenu,
                onReturnDisplay = viewModel::returnToDisplaySettingsMenu,
                onReturnThermalAlignment = viewModel::returnToThermalAlignmentMenu,
                onOverlayOpacityChange = viewModel::setOverlayOpacity,
                onSoundVolumeChange = viewModel::setSoundVolume,
                onAutoConnectToggle = viewModel::setStartupAutoConnectEnabled,
                onRestoreDefaults = viewModel::restoreOperatorDefaults,
                onReticleToggle = viewModel::setReticleEnabled,
                onGridToggle = viewModel::setGridEnabled,
                onBoundingBoxesToggle = viewModel::setBoundingBoxesEnabled,
                onCycleThermalMode = viewModel::cycleThermalMode,
                onThermalPreviewModeToggle = viewModel::setThermalPreviewModeEnabled,
                onCycleThermalPreviewOpacityPreset = viewModel::cycleThermalPreviewOpacityPreset,
                onSetThermalVisualMode = viewModel::setThermalVisualMode,
                onSelectPreparedThermalMode = { viewModel.selectMenuIndex(it); viewModel.activateSelectedMenuItem() },
                onCycleThermalAlignmentAdjustmentMode = viewModel::cycleThermalAlignmentAdjustmentMode,
                onThermalOffsetXChange = viewModel::setThermalOffsetX,
                onThermalOffsetYChange = viewModel::setThermalOffsetY,
                onThermalScaleChange = viewModel::setThermalScale,
                onCenterThermalAlignment = viewModel::centerThermalOffsets,
                onResetThermalAlignment = viewModel::resetThermalTransform,
                modifier = modifier,
            )
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(premiumBackdropBrush()),
        ) {
            if (uiState.hasLiveFrame) {
                if (presentationTarget == StereoPresentationTarget.SpatialPanels) {
                    StereoLiveSpace(
                        uiState = uiState,
                        menuUiState = menuUiState,
                        overlayUiState = overlayUiState,
                        frameUiState = viewModel.frameUiState,
                        leftEyeUiState = viewModel.leftEyeUiState,
                        rightEyeUiState = viewModel.rightEyeUiState,
                        presentationTarget = presentationTarget,
                        menuOverlayContent = menuOverlayContent,
                        onDisconnect = viewModel::disconnect,
                        onToggleMenu = viewModel::toggleMenuVisibility,
                        onToggleDiagnostics = viewModel::toggleDiagnostics,
                        onTogglePerformanceInstrumentation = viewModel::togglePerformanceInstrumentation,
                        onCyclePresenterExperimentMode = viewModel::cyclePresenterExperimentMode,
                        onEyePresenterFrameReceived = viewModel::onEyePresenterFrameReceived,
                        onFramePresented = viewModel::onFramePresented,
                    )
                } else {
                    StereoFallbackScreen(
                        uiState = uiState,
                        menuUiState = menuUiState,
                        overlayUiState = overlayUiState,
                        frameUiState = viewModel.frameUiState,
                        leftEyeUiState = viewModel.leftEyeUiState,
                        rightEyeUiState = viewModel.rightEyeUiState,
                        presentationTarget = presentationTarget,
                        menuOverlayContent = menuOverlayContent,
                        onDisconnect = viewModel::disconnect,
                        onToggleMenu = viewModel::toggleMenuVisibility,
                        onToggleDiagnostics = viewModel::toggleDiagnostics,
                        onTogglePerformanceInstrumentation = viewModel::togglePerformanceInstrumentation,
                        onCyclePresenterExperimentMode = viewModel::cyclePresenterExperimentMode,
                        onEyePresenterFrameReceived = viewModel::onEyePresenterFrameReceived,
                        onFramePresented = viewModel::onFramePresented,
                    )
                }
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .pointerInput(menuUiState.isMenuVisible) {
                            detectTapGestures(
                                onLongPress = { viewModel.toggleMenuVisibility() },
                                onTap = {
                                    if (menuUiState.isMenuVisible) {
                                        viewModel.toggleMenuVisibility()
                                    }
                                },
                            )
                        },
                ) {
                    ConnectScreen(
                        uiState = uiState,
                        autoConnectEnabled = menuUiState.settings.autoConnectOnStartup || autoConnectOnStart,
                        onHostChanged = viewModel::onEndpointHostChanged,
                        onConnect = viewModel::connect,
                    )
                    if (menuUiState.isMenuVisible) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(Color.Black.copy(alpha = 0.18f)),
                        )
                        Box(
                            modifier = Modifier
                                .align(Alignment.CenterEnd)
                                .padding(end = 28.dp, bottom = 18.dp),
                        ) {
                            menuOverlayContent(Modifier.width(380.dp))
                        }
                    }
                }
            }
            SharedTopStatusPill(
                uiState = uiState,
                captureUiState = captureShellUiState,
                overlayUiState = overlayUiState,
                frameUiState = viewModel.frameUiState,
                showModeIndicator = uiState.hasLiveFrame,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 18.dp),
            )
            SharedMenuHandle(
                menuVisible = menuUiState.isMenuVisible,
                visible = !bootSequenceUiState.visible,
                onToggleMenu = viewModel::toggleMenuVisibility,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(top = 18.dp, start = 24.dp),
            )
            RecordingIndicatorBadge(
                captureUiState = captureShellUiState,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 18.dp, end = 24.dp),
            )
            BootSequenceOverlay(
                bootSequenceUiState = bootSequenceUiState,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

private fun resolvePresentationTarget(
    session: Session?,
): StereoPresentationTarget {
    return if (session != null) {
        StereoPresentationTarget.SpatialPanels
    } else {
        StereoPresentationTarget.Fallback2DPreview
    }
}

@Composable
private fun StereoFallbackScreen(
    uiState: NevexXrUiState,
    menuUiState: NevexMenuUiState,
    overlayUiState: OverlayUiState,
    frameUiState: StateFlow<NevexFrameUiState>,
    leftEyeUiState: StateFlow<NevexEyeBitmapUiState>,
    rightEyeUiState: StateFlow<NevexEyeBitmapUiState>,
    presentationTarget: StereoPresentationTarget,
    menuOverlayContent: @Composable (Modifier) -> Unit,
    onDisconnect: () -> Unit,
    onToggleMenu: () -> Unit,
    onToggleDiagnostics: () -> Unit,
    onTogglePerformanceInstrumentation: () -> Unit,
    onCyclePresenterExperimentMode: () -> Unit,
    onEyePresenterFrameReceived: (StereoEyePresenterReceiveEvent) -> Unit,
    onFramePresented: (StereoEyeFramePresentedEvent) -> Unit,
) {
    Box(
        modifier = Modifier.fillMaxSize(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                StatusPill(
                    title = uiState.lifecycleText,
                    subtitle = "2D fallback live view",
                    accentColor = if (uiState.errorMessage == null) NevexSuccess else NevexDanger,
                    modifier = Modifier.width(280.dp),
                )
                OutlinedButton(onClick = onToggleMenu) {
                    Text(if (menuUiState.isMenuVisible) "Close Menu" else "Menu")
                }
                OutlinedButton(onClick = onToggleDiagnostics) {
                    Text(if (uiState.diagnosticsVisible) "Hide HUD" else "HUD")
                }
                OutlinedButton(onClick = onTogglePerformanceInstrumentation) {
                    Text(if (uiState.performanceInstrumentationEnabled) "Perf on" else "Perf")
                }
                OutlinedButton(onClick = onCyclePresenterExperimentMode) {
                    Text("Mode ${uiState.presenterExperimentMode.shortLabel}")
                }
                TextButton(onClick = onDisconnect) {
                    Text(text = "Disconnect", color = NevexTextPrimary)
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(320.dp),
            ) {
                EyeSurface(
                    eye = StereoEyePanel.Left,
                    uiState = uiState,
                    frameUiState = frameUiState,
                    eyeUiState = leftEyeUiState,
                    overlayUiState = overlayUiState,
                    presentationTarget = presentationTarget,
                    showControls = false,
                    menuVisible = menuUiState.isMenuVisible,
                    showThermalHud = !shouldSuppressThermalHud(menuUiState.currentMenu),
                    onDisconnect = onDisconnect,
                    onToggleMenu = onToggleMenu,
                    onToggleDiagnostics = onToggleDiagnostics,
                    onTogglePerformanceInstrumentation = onTogglePerformanceInstrumentation,
                    onCyclePresenterExperimentMode = onCyclePresenterExperimentMode,
                    onEyePresenterFrameReceived = onEyePresenterFrameReceived,
                    onFramePresented = onFramePresented,
                )
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(320.dp),
            ) {
                EyeSurface(
                    eye = StereoEyePanel.Right,
                    uiState = uiState,
                    frameUiState = frameUiState,
                    eyeUiState = rightEyeUiState,
                    overlayUiState = overlayUiState,
                    presentationTarget = presentationTarget,
                    showControls = false,
                    menuVisible = menuUiState.isMenuVisible,
                    showThermalHud = !shouldSuppressThermalHud(menuUiState.currentMenu),
                    onDisconnect = onDisconnect,
                    onToggleMenu = onToggleMenu,
                    onToggleDiagnostics = onToggleDiagnostics,
                    onTogglePerformanceInstrumentation = onTogglePerformanceInstrumentation,
                    onCyclePresenterExperimentMode = onCyclePresenterExperimentMode,
                    onEyePresenterFrameReceived = onEyePresenterFrameReceived,
                    onFramePresented = onFramePresented,
                )
            }
        }

        if (menuUiState.isMenuVisible) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = 28.dp, bottom = 18.dp),
            ) {
                menuOverlayContent(Modifier.width(380.dp))
            }
        }
    }
}

@Composable
private fun ConnectScreen(
    uiState: NevexXrUiState,
    autoConnectEnabled: Boolean,
    onHostChanged: (String) -> Unit,
    onConnect: () -> Unit,
) {
    val focusManager = LocalFocusManager.current
    var showConnectionSettings by remember { mutableStateOf(false) }
    val showAcquisitionCard = autoConnectEnabled &&
        uiState.errorMessage == null &&
        !showConnectionSettings

    LaunchedEffect(Unit) {
        focusManager.clearFocus(force = true)
    }

    LaunchedEffect(uiState.errorMessage, autoConnectEnabled) {
        if (uiState.errorMessage != null || !autoConnectEnabled) {
            showConnectionSettings = true
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 28.dp, vertical = 24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .width(680.dp),
            colors = CardDefaults.cardColors(
                containerColor = NevexPanelStrong.copy(alpha = 0.92f),
            ),
            border = BorderStroke(1.dp, NevexBorder),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(28.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                if (showAcquisitionCard) {
                    StatusPill(
                        title = if (uiState.connected) "ACQUIRING LIVE VIEW" else "CONNECTING TO SOURCE",
                        subtitle = if (uiState.connected) {
                            "Stereo link open. Awaiting the first live frame."
                        } else {
                            uiState.lifecycleText
                        },
                        accentColor = if (uiState.connected) NevexSuccess else NevexAccent,
                        modifier = Modifier.width(280.dp),
                    )

                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = "NEVEX XR Live View",
                            style = MaterialTheme.typography.headlineMedium,
                            color = NevexTextPrimary,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = "Normal startup is using the last known Jetson host and will enter the immersive binocular view as soon as live imagery is flowing.",
                            style = MaterialTheme.typography.bodyLarge,
                            color = NevexTextSecondary,
                        )
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            text = "SOURCE",
                            style = MaterialTheme.typography.labelLarge,
                            color = NevexTextSecondary,
                        )
                        Text(
                            text = uiState.endpointUrl,
                            style = MaterialTheme.typography.bodyLarge,
                            color = NevexTextPrimary,
                        )
                    }

                    OutlinedButton(
                        onClick = { showConnectionSettings = true },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(text = "Connection Settings")
                    }
                } else {
                    StatusPill(
                        title = if (uiState.errorMessage == null) "Connection Setup" else "Connection issue",
                        subtitle = if (uiState.errorMessage == null) uiState.lifecycleText else uiState.errorMessage,
                        accentColor = if (uiState.errorMessage == null) NevexAccent else NevexDanger,
                        modifier = Modifier.width(260.dp),
                    )

                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = "Connect to NEVEX XR",
                            style = MaterialTheme.typography.headlineMedium,
                            color = NevexTextPrimary,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = "Adjust the Jetson source only when needed. The product default is to drive straight toward the live binocular view.",
                            style = MaterialTheme.typography.bodyLarge,
                            color = NevexTextSecondary,
                        )
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(
                            text = "Jetson host",
                            style = MaterialTheme.typography.labelLarge,
                            color = NevexTextSecondary,
                        )
                        OutlinedTextField(
                            value = uiState.endpointHost,
                            onValueChange = onHostChanged,
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                            textStyle = MaterialTheme.typography.bodyLarge.copy(color = NevexTextPrimary),
                            placeholder = {
                                Text(
                                    text = "192.168.1.56",
                                    color = NevexTextSecondary.copy(alpha = 0.6f),
                                )
                            },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = NevexPanel.copy(alpha = 0.72f),
                                unfocusedContainerColor = NevexPanel.copy(alpha = 0.56f),
                                focusedBorderColor = NevexAccent,
                                unfocusedBorderColor = NevexBorder,
                                focusedTextColor = NevexTextPrimary,
                                unfocusedTextColor = NevexTextPrimary,
                                focusedPlaceholderColor = NevexTextSecondary,
                                unfocusedPlaceholderColor = NevexTextSecondary,
                                cursorColor = NevexAccent,
                            ),
                        )
                        Text(
                            text = uiState.endpointUrl,
                            style = MaterialTheme.typography.bodyMedium,
                            color = NevexTextSecondary,
                        )
                    }

                    Button(
                        onClick = onConnect,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(text = "Enter immersive live view")
                    }

                    if (autoConnectEnabled && uiState.errorMessage == null) {
                        TextButton(
                            onClick = {
                                focusManager.clearFocus(force = true)
                                showConnectionSettings = false
                            },
                            modifier = Modifier.align(Alignment.End),
                        ) {
                            Text(text = "Hide Settings")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StereoLiveSpace(
    uiState: NevexXrUiState,
    menuUiState: NevexMenuUiState,
    overlayUiState: OverlayUiState,
    frameUiState: StateFlow<NevexFrameUiState>,
    leftEyeUiState: StateFlow<NevexEyeBitmapUiState>,
    rightEyeUiState: StateFlow<NevexEyeBitmapUiState>,
    presentationTarget: StereoPresentationTarget,
    menuOverlayContent: @Composable (Modifier) -> Unit,
    onDisconnect: () -> Unit,
    onToggleMenu: () -> Unit,
    onToggleDiagnostics: () -> Unit,
    onTogglePerformanceInstrumentation: () -> Unit,
    onCyclePresenterExperimentMode: () -> Unit,
    onEyePresenterFrameReceived: (StereoEyePresenterReceiveEvent) -> Unit,
    onFramePresented: (StereoEyeFramePresentedEvent) -> Unit,
) {
    val showPersistentLiveChrome = uiState.diagnosticsVisible || !uiState.isHealthy
    val showThermalHud = showPersistentLiveChrome && !shouldSuppressThermalHud(menuUiState.currentMenu)
    Subspace {
        SpatialRow {
            SpatialPanel(
                modifier = SubspaceModifier
                    .subspaceWidth(StereoBinocularPanelWidth)
                    .subspaceHeight(StereoBinocularPanelHeight),
                dragPolicy = MovePolicy(),
                resizePolicy = ResizePolicy(),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(MaterialTheme.shapes.extraLarge)
                        .background(NevexPanelStrong.copy(alpha = 0.56f))
                        .border(1.dp, NevexBorder, MaterialTheme.shapes.extraLarge)
                        .pointerInput(menuUiState.isMenuVisible) {
                        detectTapGestures(
                            onLongPress = { onToggleMenu() },
                        )
                    },
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(StereoBinocularFramePadding),
                        horizontalArrangement = Arrangement.spacedBy(StereoBinocularEyeSpacing),
                    ) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight(),
                        ) {
                            EyeSurface(
                                eye = StereoEyePanel.Left,
                                uiState = uiState,
                                frameUiState = frameUiState,
                                eyeUiState = leftEyeUiState,
                                overlayUiState = overlayUiState,
                                presentationTarget = presentationTarget,
                                showControls = false,
                                menuVisible = menuUiState.isMenuVisible,
                                showThermalHud = showThermalHud,
                                onDisconnect = onDisconnect,
                                onToggleMenu = onToggleMenu,
                                onToggleDiagnostics = onToggleDiagnostics,
                                onTogglePerformanceInstrumentation = onTogglePerformanceInstrumentation,
                                onCyclePresenterExperimentMode = onCyclePresenterExperimentMode,
                                onEyePresenterFrameReceived = onEyePresenterFrameReceived,
                                onFramePresented = onFramePresented,
                            )
                        }
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight(),
                        ) {
                            EyeSurface(
                                eye = StereoEyePanel.Right,
                                uiState = uiState,
                                frameUiState = frameUiState,
                                eyeUiState = rightEyeUiState,
                                overlayUiState = overlayUiState,
                                presentationTarget = presentationTarget,
                                showControls = false,
                                menuVisible = menuUiState.isMenuVisible,
                                showThermalHud = showThermalHud,
                                onDisconnect = onDisconnect,
                                onToggleMenu = onToggleMenu,
                                onToggleDiagnostics = onToggleDiagnostics,
                                onTogglePerformanceInstrumentation = onTogglePerformanceInstrumentation,
                                onCyclePresenterExperimentMode = onCyclePresenterExperimentMode,
                                onEyePresenterFrameReceived = onEyePresenterFrameReceived,
                                onFramePresented = onFramePresented,
                            )
                        }
                    }
                    StereoSharedControls(
                        uiState = uiState,
                        menuVisible = menuUiState.isMenuVisible,
                        visible = showPersistentLiveChrome,
                        onDisconnect = onDisconnect,
                        onToggleMenu = onToggleMenu,
                        onToggleDiagnostics = onToggleDiagnostics,
                        onTogglePerformanceInstrumentation = onTogglePerformanceInstrumentation,
                        onCyclePresenterExperimentMode = onCyclePresenterExperimentMode,
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(18.dp),
                    )
                    if (menuUiState.isMenuVisible) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(Color.Black.copy(alpha = 0.18f))
                                .pointerInput(Unit) {
                                    detectTapGestures(onTap = { onToggleMenu() })
                                },
                        )
                        Box(
                            modifier = Modifier
                                .align(Alignment.CenterEnd)
                                .padding(end = 24.dp)
                                .width(StereoOverlayMenuWidth)
                                .fillMaxHeight(0.92f),
                        ) {
                            menuOverlayContent(Modifier.fillMaxWidth())
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StereoSharedControls(
    uiState: NevexXrUiState,
    menuVisible: Boolean,
    visible: Boolean,
    onDisconnect: () -> Unit,
    onToggleMenu: () -> Unit,
    onToggleDiagnostics: () -> Unit,
    onTogglePerformanceInstrumentation: () -> Unit,
    onCyclePresenterExperimentMode: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!visible) {
        return
    }
    val overlayAlpha by animateFloatAsState(
        targetValue = if (uiState.isHealthy && !uiState.diagnosticsVisible) 0.48f else 1f,
        label = "stereoSharedControlsAlpha",
    )

    Row(
        modifier = modifier.alpha(overlayAlpha),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedButton(onClick = onToggleMenu) {
            Text(if (menuVisible) "Close Menu" else "Menu")
        }
        OutlinedButton(onClick = onToggleDiagnostics) {
            Text(if (uiState.diagnosticsVisible) "Hide HUD" else "HUD")
        }
        OutlinedButton(onClick = onTogglePerformanceInstrumentation) {
            Text(if (uiState.performanceInstrumentationEnabled) "Perf on" else "Perf")
        }
        OutlinedButton(onClick = onCyclePresenterExperimentMode) {
            Text("Mode ${uiState.presenterExperimentMode.shortLabel}")
        }
        TextButton(onClick = onDisconnect) {
            Text(text = "Disconnect", color = NevexTextPrimary)
        }
    }
}

@Composable
private fun EyeSurface(
    eye: StereoEyePanel,
    uiState: NevexXrUiState,
    frameUiState: StateFlow<NevexFrameUiState>,
    eyeUiState: StateFlow<NevexEyeBitmapUiState>,
    overlayUiState: OverlayUiState,
    presentationTarget: StereoPresentationTarget,
    showControls: Boolean,
    menuVisible: Boolean,
    showThermalHud: Boolean,
    onDisconnect: () -> Unit,
    onToggleMenu: () -> Unit,
    onToggleDiagnostics: () -> Unit,
    onTogglePerformanceInstrumentation: () -> Unit,
    onCyclePresenterExperimentMode: () -> Unit,
    onEyePresenterFrameReceived: (StereoEyePresenterReceiveEvent) -> Unit,
    onFramePresented: (StereoEyeFramePresentedEvent) -> Unit,
) {
    val showPersistentLiveChrome = menuVisible || uiState.diagnosticsVisible || !uiState.isHealthy
    val overlayAlpha by animateFloatAsState(
        targetValue = if (showPersistentLiveChrome) 1f else 0f,
        label = "overlayAlpha",
    )

    LaunchedEffect(eye, presentationTarget) {
        Log.i(
            UI_LOG_TAG,
            "${eye.title} ${presentationTarget.toPanelLogLabel()} panel created",
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .clip(MaterialTheme.shapes.large)
            .background(Color.Black)
            .border(1.dp, NevexBorder, MaterialTheme.shapes.large),
    ) {
        StereoEyeBitmap(
            eye = eye,
            eyeUiState = eyeUiState,
            experimentMode = uiState.presenterExperimentMode,
            instrumentationEnabled = uiState.performanceInstrumentationEnabled,
            onEyePresenterFrameReceived = onEyePresenterFrameReceived,
            onFramePresented = onFramePresented,
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Black.copy(alpha = 0.34f),
                            Color.Transparent,
                            Color.Black.copy(alpha = 0.18f),
                        ),
                    ),
                ),
        )

        if (overlayUiState.hideVisibleFeed) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black),
            )
        }

        LiveViewOverlayLayer(
            overlayUiState = overlayUiState,
            showThermalHud = showThermalHud,
            showThermalPreviewBadge = showPersistentLiveChrome,
            modifier = Modifier.fillMaxSize(),
        )

        if (showPersistentLiveChrome) {
            Column(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(18.dp)
                    .alpha(overlayAlpha),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                StatusPill(
                    title = uiState.lifecycleText,
                    subtitle = "${eye.title} • ${uiState.sourceHealthText}",
                    accentColor = if (uiState.errorMessage == null) NevexSuccess else NevexDanger,
                )
                if (!uiState.isHealthy || uiState.diagnosticsVisible) {
                    DiagnosticsHud(
                        uiState = uiState,
                        frameUiState = frameUiState,
                        eye = eye,
                        eyeUiState = eyeUiState,
                        presentationTarget = presentationTarget,
                    )
                }
            }
        }

        if (showControls) {
            Row(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(18.dp)
                    .alpha(overlayAlpha),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(onClick = onToggleMenu) {
                    Text(if (menuVisible) "Close Menu" else "Menu")
                }
                OutlinedButton(onClick = onToggleDiagnostics) {
                    Text(if (uiState.diagnosticsVisible) "Hide HUD" else "HUD")
                }
                OutlinedButton(onClick = onTogglePerformanceInstrumentation) {
                    Text(if (uiState.performanceInstrumentationEnabled) "Perf on" else "Perf")
                }
                OutlinedButton(onClick = onCyclePresenterExperimentMode) {
                    Text("Mode ${uiState.presenterExperimentMode.shortLabel}")
                }
                TextButton(onClick = onDisconnect) {
                    Text(text = "Disconnect", color = NevexTextPrimary)
                }
            }
        }

        if (uiState.diagnosticsVisible) {
            Text(
                text = eye.title.uppercase(),
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(18.dp)
                    .alpha(0.72f),
                style = MaterialTheme.typography.labelLarge,
                color = NevexTextSecondary,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun StereoEyeBitmap(
    eye: StereoEyePanel,
    eyeUiState: StateFlow<NevexEyeBitmapUiState>,
    experimentMode: PresenterExperimentMode,
    instrumentationEnabled: Boolean,
    onEyePresenterFrameReceived: (StereoEyePresenterReceiveEvent) -> Unit,
    onFramePresented: (StereoEyeFramePresentedEvent) -> Unit,
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            StereoEyeSurfaceView(context).apply {
                bind(
                    eye = eye,
                    eyeUiState = eyeUiState,
                    experimentMode = experimentMode,
                    lifecycleOwner = lifecycleOwner,
                    instrumentationEnabled = instrumentationEnabled,
                    onEyePresenterFrameReceived = onEyePresenterFrameReceived,
                    onFramePresented = onFramePresented,
                )
            }
        },
        update = { view ->
            view.bind(
                eye = eye,
                eyeUiState = eyeUiState,
                experimentMode = experimentMode,
                lifecycleOwner = lifecycleOwner,
                instrumentationEnabled = instrumentationEnabled,
                onEyePresenterFrameReceived = onEyePresenterFrameReceived,
                onFramePresented = onFramePresented,
            )
        },
    )
}

@Composable
private fun DiagnosticsHud(
    uiState: NevexXrUiState,
    frameUiState: StateFlow<NevexFrameUiState>,
    eye: StereoEyePanel,
    eyeUiState: StateFlow<NevexEyeBitmapUiState>,
    presentationTarget: StereoPresentationTarget,
) {
    val frameState by frameUiState.collectAsStateWithLifecycle()
    val eyeState by eyeUiState.collectAsStateWithLifecycle()

    Surface(
        color = NevexPanelStrong.copy(alpha = 0.78f),
        border = BorderStroke(1.dp, NevexBorder),
        shape = MaterialTheme.shapes.medium,
    ) {
        Column(
            modifier = Modifier
                .width(320.dp)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = uiState.senderName ?: "Jetson live stream",
                style = MaterialTheme.typography.titleMedium,
                color = NevexTextPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            DiagnosticsLine("Eye panel", eye.title)
            DiagnosticsLine("Eye bitmap id", eyeState.bitmapIdentityHash?.toString() ?: "--")
            DiagnosticsLine("Peer bitmap id", eyeState.peerBitmapIdentityHash?.toString() ?: "--")
            DiagnosticsLine(
                "Independent eyes",
                if (eyeState.independentFrameData) "Yes" else "No",
            )
            DiagnosticsLine("Draw mode", uiState.presenterExperimentModeText)
            DiagnosticsLine("Presentation", presentationTarget.toDiagnosticsLabel())
            DiagnosticsLine("Frame layout", frameState.layoutHint.toDiagnosticsLabel())
            DiagnosticsLine("Lifecycle", uiState.lifecycleText)
            DiagnosticsLine("Status", uiState.statusText)
            DiagnosticsLine("Receive cadence", frameState.receiveFpsText)
            DiagnosticsLine("Last frame", frameState.lastFrameIdText)
            DiagnosticsLine("Last message", uiState.lastMessageTypeText)
            DiagnosticsLine("Frame payload", frameState.framePayloadSizeText)
            DiagnosticsLine("Source health", uiState.sourceHealthText)
            DiagnosticsLine("Decode", frameState.decodeTimeText)
            DiagnosticsLine("Bitmap handoff", frameState.bitmapUpdateTimeText)
            DiagnosticsLine("Bitmap reuse", frameState.bitmapReuseText)
            DiagnosticsLine("Presentation cadence", frameState.presentationFpsText)
            DiagnosticsLine("Presentation latency", frameState.presentationLatencyText)
            DiagnosticsLine("Receive to present", frameState.receiveToPresentationLatencyText)
            DiagnosticsLine("Dropped frames", frameState.droppedFramesText)
            DiagnosticsLine("Queue drops", frameState.queueDropsText)
            DiagnosticsLine("Lag frames", frameState.lagFramesText)
            DiagnosticsLine("Endpoint", uiState.endpointUrl)
        }
    }
}

@Composable
private fun DiagnosticsLine(
    label: String,
    value: String,
) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = NevexTextSecondary.copy(alpha = 0.78f),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = NevexTextPrimary,
        )
    }
}

@Composable
private fun SharedTopStatusPill(
    uiState: NevexXrUiState,
    captureUiState: CaptureShellUiState,
    overlayUiState: OverlayUiState,
    frameUiState: StateFlow<NevexFrameUiState>,
    showModeIndicator: Boolean,
    modifier: Modifier = Modifier,
) {
    val frameState by frameUiState.collectAsStateWithLifecycle()
    var nowElapsedNanos by remember { mutableStateOf(SystemClock.elapsedRealtimeNanos()) }
    var hasSeenLiveFrames by remember { mutableStateOf(false) }
    var hasShownInitialConnectedPulse by remember { mutableStateOf(false) }
    var previousRawState by remember { mutableStateOf(StreamHealthPillState.Hidden) }
    var connectedPulseUntilElapsedMs by remember { mutableStateOf(0L) }

    LaunchedEffect(Unit) {
        while (true) {
            nowElapsedNanos = SystemClock.elapsedRealtimeNanos()
            delay(STREAM_HEALTH_PULSE_INTERVAL_MS)
        }
    }

    LaunchedEffect(frameState.receivedAtElapsedNanos, uiState.hasLiveFrame) {
        if (uiState.hasLiveFrame && frameState.receivedAtElapsedNanos != null) {
            hasSeenLiveFrames = true
            if (!hasShownInitialConnectedPulse) {
                connectedPulseUntilElapsedMs =
                    SystemClock.elapsedRealtime() + STREAM_HEALTH_CONNECTED_PULSE_MS
                hasShownInitialConnectedPulse = true
            }
        }
    }

    val rawHealthState = remember(
        uiState.lifecycle,
        uiState.lifecycleText,
        uiState.connected,
        uiState.hasLiveFrame,
        uiState.errorMessage,
        frameState.receivedAtElapsedNanos,
        hasSeenLiveFrames,
        nowElapsedNanos,
    ) {
        resolveStreamHealthPillState(
            uiState = uiState,
            frameUiState = frameState,
            nowElapsedNanos = nowElapsedNanos,
            hasSeenLiveFrames = hasSeenLiveFrames,
        )
    }

    LaunchedEffect(rawHealthState, hasSeenLiveFrames) {
        if (rawHealthState == StreamHealthPillState.Hidden &&
            previousRawState != StreamHealthPillState.Hidden &&
            hasSeenLiveFrames
        ) {
            connectedPulseUntilElapsedMs =
                SystemClock.elapsedRealtime() + STREAM_HEALTH_CONNECTED_PULSE_MS
        } else if (rawHealthState != StreamHealthPillState.Hidden) {
            connectedPulseUntilElapsedMs = 0L
        }
        previousRawState = rawHealthState
    }

    val activeHealthState = when {
        rawHealthState != StreamHealthPillState.Hidden -> rawHealthState
        connectedPulseUntilElapsedMs > (nowElapsedNanos / 1_000_000L) -> {
            StreamHealthPillState.Connected
        }
        else -> StreamHealthPillState.Hidden
    }

    if (!showModeIndicator &&
        activeHealthState == StreamHealthPillState.Hidden &&
        captureUiState.feedback == null
    ) {
        return
    }

    Box(modifier = modifier) {
        AnimatedVisibility(
            visible = showModeIndicator &&
                activeHealthState == StreamHealthPillState.Hidden &&
                captureUiState.feedback == null,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            LiveModeIndicatorPill(overlayUiState = overlayUiState)
        }

        AnimatedVisibility(
            visible = activeHealthState != StreamHealthPillState.Hidden,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            StreamHealthIndicatorPill(state = activeHealthState)
        }

        AnimatedVisibility(
            visible = activeHealthState == StreamHealthPillState.Hidden &&
                captureUiState.feedback != null,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            captureUiState.feedback?.let { feedback ->
                CaptureFeedbackPill(feedback = feedback)
            }
        }
    }
}

private enum class StreamHealthPillState {
    Hidden,
    Connecting,
    Reconnecting,
    NoFrames,
    ConnectionLost,
    Connected,
}

private fun resolveStreamHealthPillState(
    uiState: NevexXrUiState,
    frameUiState: NevexFrameUiState,
    nowElapsedNanos: Long,
    hasSeenLiveFrames: Boolean,
): StreamHealthPillState {
    val frameAgeNanos = frameUiState.receivedAtElapsedNanos?.let { timestamp ->
        (nowElapsedNanos - timestamp).coerceAtLeast(0L)
    }

    val awaitingFrames = uiState.connected && (
        uiState.lifecycle == JetsonLifecycle.WebSocketOpen ||
            uiState.lifecycle == JetsonLifecycle.AwaitingFirstFrame ||
            !uiState.hasLiveFrame
        )
    val streamStalled = uiState.connected &&
        uiState.hasLiveFrame &&
        frameAgeNanos != null &&
        frameAgeNanos > STREAM_HEALTH_STALE_THRESHOLD_NANOS

    return when {
        uiState.errorMessage != null || uiState.lifecycle == JetsonLifecycle.Error -> {
            if (hasSeenLiveFrames) {
                StreamHealthPillState.ConnectionLost
            } else {
                StreamHealthPillState.ConnectionLost
            }
        }
        uiState.lifecycleText.equals("Retry scheduled", ignoreCase = true) -> {
            StreamHealthPillState.Reconnecting
        }
        uiState.lifecycle == JetsonLifecycle.Connecting && hasSeenLiveFrames -> {
            StreamHealthPillState.Reconnecting
        }
        uiState.lifecycle == JetsonLifecycle.Connecting -> StreamHealthPillState.Connecting
        !uiState.connected && hasSeenLiveFrames && uiState.lifecycle == JetsonLifecycle.Disconnected -> {
            StreamHealthPillState.ConnectionLost
        }
        streamStalled -> StreamHealthPillState.NoFrames
        awaitingFrames && hasSeenLiveFrames -> StreamHealthPillState.Reconnecting
        awaitingFrames -> StreamHealthPillState.Connecting
        else -> StreamHealthPillState.Hidden
    }
}

@Composable
private fun SharedMenuHandle(
    menuVisible: Boolean,
    visible: Boolean,
    onToggleMenu: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(),
        exit = fadeOut(),
        modifier = modifier,
    ) {
        Surface(
            modifier = Modifier.clickable(onClick = onToggleMenu),
            color = NevexPanelStrong.copy(alpha = 0.72f),
            border = BorderStroke(1.dp, NevexBorder.copy(alpha = 0.88f)),
            shape = CircleShape,
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Image(
                    painter = painterResource(
                        id = if (menuVisible) {
                            R.drawable.nevex_glyph_close
                        } else {
                            R.drawable.nevex_glyph_menu
                        },
                    ),
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                )
                Text(
                    text = if (menuVisible) "CLOSE" else "MENU",
                    style = MaterialTheme.typography.labelMedium,
                    color = NevexTextPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun StreamHealthIndicatorPill(
    state: StreamHealthPillState,
    modifier: Modifier = Modifier,
) {
    val borderColor = when (state) {
        StreamHealthPillState.ConnectionLost -> NevexDanger.copy(alpha = 0.72f)
        StreamHealthPillState.Connected -> NevexSuccess.copy(alpha = 0.68f)
        StreamHealthPillState.Hidden -> NevexBorder.copy(alpha = 0.82f)
        else -> StreamHealthAmber.copy(alpha = 0.72f)
    }

    val text = when (state) {
        StreamHealthPillState.Connecting -> "CONNECTING..."
        StreamHealthPillState.Reconnecting -> "RECONNECTING..."
        StreamHealthPillState.NoFrames -> "NO FRAMES"
        StreamHealthPillState.ConnectionLost -> "CONNECTION LOST"
        StreamHealthPillState.Connected -> "CONNECTED"
        StreamHealthPillState.Hidden -> ""
    }

    Surface(
        modifier = modifier,
        color = NevexPanelStrong.copy(alpha = 0.72f),
        border = BorderStroke(1.dp, borderColor),
        shape = CircleShape,
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            style = MaterialTheme.typography.labelLarge,
            color = NevexTextPrimary,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun CaptureFeedbackPill(
    feedback: CaptureFeedbackUiState,
    modifier: Modifier = Modifier,
) {
    val borderColor = when (feedback.tone) {
        CaptureFeedbackTone.Neutral -> NevexBorder.copy(alpha = 0.82f)
        CaptureFeedbackTone.Success -> NevexSuccess.copy(alpha = 0.68f)
        CaptureFeedbackTone.Recording -> NevexDanger.copy(alpha = 0.72f)
        CaptureFeedbackTone.Danger -> NevexDanger.copy(alpha = 0.76f)
    }

    Surface(
        modifier = modifier,
        color = NevexPanelStrong.copy(alpha = 0.72f),
        border = BorderStroke(1.dp, borderColor),
        shape = CircleShape,
    ) {
        Text(
            text = feedback.message,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            style = MaterialTheme.typography.labelLarge,
            color = NevexTextPrimary,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun RecordingIndicatorBadge(
    captureUiState: CaptureShellUiState,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = captureUiState.recordingActive,
        enter = fadeIn(),
        exit = fadeOut(),
        modifier = modifier,
    ) {
        Surface(
            color = NevexPanelStrong.copy(alpha = 0.76f),
            border = BorderStroke(1.dp, NevexDanger.copy(alpha = 0.74f)),
            shape = CircleShape,
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(NevexDanger),
                )
                Text(
                    text = "REC",
                    style = MaterialTheme.typography.labelMedium,
                    color = NevexTextPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun LiveModeIndicatorPill(
    overlayUiState: OverlayUiState,
    modifier: Modifier = Modifier,
) {
    val borderColor = if (overlayUiState.thermalMode == ThermalOverlayMode.Off) {
        NevexBorder.copy(alpha = 0.82f)
    } else {
        NevexAccent.copy(alpha = 0.52f)
    }

    Surface(
        modifier = modifier,
        color = NevexPanelStrong.copy(alpha = 0.64f),
        border = BorderStroke(1.dp, borderColor),
        shape = CircleShape,
    ) {
        Text(
            text = overlayUiState.liveModeIndicatorText(),
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            style = MaterialTheme.typography.labelLarge,
            color = NevexTextPrimary,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private fun OverlayUiState.liveModeIndicatorText(): String {
    return when {
        hideVisibleFeed && thermalMode != ThermalOverlayMode.Off -> {
            "THERMAL ONLY ${thermalPreviewVisiblePercent}%"
        }
        thermalMode != ThermalOverlayMode.Off -> {
            "THERMAL ${thermalPreviewVisiblePercent}%"
        }
        else -> "VISIBLE"
    }
}

@Composable
private fun StatusPill(
    title: String,
    subtitle: String?,
    accentColor: Color,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        color = NevexPanelStrong.copy(alpha = 0.72f),
        border = BorderStroke(1.dp, NevexBorder),
        shape = CircleShape,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(accentColor),
            )
            Column {
                Text(
                    text = title,
                    style = MaterialTheme.typography.labelLarge,
                    color = NevexTextPrimary,
                )
                if (!subtitle.isNullOrBlank()) {
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = NevexTextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
private fun premiumBackdropBrush(): Brush {
    return Brush.linearGradient(
        colors = listOf(
            NevexBackground,
            NevexBackgroundDeep,
            Color(0xFF041B2A),
        ),
    )
}

private fun StereoPresentationTarget.toDiagnosticsLabel(): String {
    return when (this) {
        StereoPresentationTarget.Fallback2DPreview -> "2D fallback preview"
        StereoPresentationTarget.SpatialPanels -> "XR spatial panels"
        StereoPresentationTarget.FutureSceneCoreSurface -> "Future SceneCore surface"
    }
}

private fun StereoFrameLayoutHint.toDiagnosticsLabel(): String {
    return when (this) {
        StereoFrameLayoutHint.DualEyeBitmaps -> "Dual-eye bitmaps"
        StereoFrameLayoutHint.FutureSceneCoreSurface -> "Future SceneCore surface"
    }
}

private fun StereoPresentationTarget.toPanelLogLabel(): String {
    return when (this) {
        StereoPresentationTarget.Fallback2DPreview -> "fallback"
        StereoPresentationTarget.SpatialPanels -> "spatial"
        StereoPresentationTarget.FutureSceneCoreSurface -> "future-surface"
    }
}

private fun shouldSuppressThermalHud(
    menuScreen: NevexMenuScreen,
): Boolean {
    return menuScreen == NevexMenuScreen.ThermalAlignment ||
        menuScreen == NevexMenuScreen.ThermalAutoCalibration
}

private data class PendingEyeSurfaceFrame(
    val bitmap: android.graphics.Bitmap?,
    val experimentMode: PresenterExperimentMode,
    val frameId: Long?,
    val receivedAtElapsedNanos: Long?,
    val decodedAtElapsedNanos: Long?,
    val frameStatePublishedAtElapsedNanos: Long?,
    val presenterReceivedAtElapsedNanos: Long?,
    val preDecodeQueueWaitNanos: Long?,
    val decodeIdleGapNanos: Long?,
    val generation: Long,
)

private class StereoEyeSurfaceView(
    context: Context,
) : SurfaceView(context), SurfaceHolder.Callback {
    private val drawBounds = RectF()
    private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val testPatternBackgroundPaint = Paint().apply {
        color = AndroidColor.rgb(8, 16, 26)
    }
    private val testPatternAccentPaint = Paint().apply {
        color = AndroidColor.rgb(0, 198, 255)
    }
    private val testPatternSecondaryPaint = Paint().apply {
        color = AndroidColor.rgb(60, 255, 180)
    }
    private val testPatternOutlinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = AndroidColor.WHITE
        style = Paint.Style.STROKE
        strokeWidth = 4f
    }
    private val renderExecutor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "NevexEyeSurfaceRender").apply {
            isDaemon = true
        }
    }
    private val latestFrame = AtomicReference<PendingEyeSurfaceFrame?>(null)
    private val renderLoopRunning = AtomicBoolean(false)
    private val surfaceReady = AtomicBoolean(false)
    private val released = AtomicBoolean(false)
    private val lastRenderedGeneration = AtomicLong(0L)
    private val nextFrameGeneration = AtomicLong(0L)
    private var collectorJob: Job? = null
    private var boundEye: StereoEyePanel? = null
    private var boundEyeUiState: StateFlow<NevexEyeBitmapUiState>? = null
    private var boundLifecycleOwner: LifecycleOwner? = null
    private var drawExperimentMode = PresenterExperimentMode.NormalBitmap
    private var presentationReportingEnabled = false
    private var presenterReceiveCallback: ((StereoEyePresenterReceiveEvent) -> Unit)? = null
    private var presentationCallback: ((StereoEyeFramePresentedEvent) -> Unit)? = null
    private var lastLoggedFrameId: Long = -1L
    private var lastReportedDrawnFrameId: Long = -1L

    init {
        setBackgroundColor(AndroidColor.BLACK)
        holder.addCallback(this)
        setZOrderOnTop(false)
    }

    fun bind(
        eye: StereoEyePanel,
        eyeUiState: StateFlow<NevexEyeBitmapUiState>,
        experimentMode: PresenterExperimentMode,
        lifecycleOwner: LifecycleOwner,
        instrumentationEnabled: Boolean,
        onEyePresenterFrameReceived: (StereoEyePresenterReceiveEvent) -> Unit,
        onFramePresented: (StereoEyeFramePresentedEvent) -> Unit,
    ) {
        presentationReportingEnabled = instrumentationEnabled
        presenterReceiveCallback = onEyePresenterFrameReceived
        presentationCallback = onFramePresented
        val modeChanged = drawExperimentMode != experimentMode
        drawExperimentMode = experimentMode
        if (modeChanged) {
            latestFrame.get()?.let { currentFrame ->
                latestFrame.set(
                    currentFrame.copy(
                        experimentMode = experimentMode,
                        generation = nextFrameGeneration.incrementAndGet(),
                    ),
                )
            }
        }
        if (
            boundEye == eye &&
            boundEyeUiState === eyeUiState &&
            boundLifecycleOwner === lifecycleOwner &&
            collectorJob != null
        ) {
            if (modeChanged) {
                requestRender()
            }
            return
        }

        collectorJob?.cancel()
        boundEye = eye
        boundEyeUiState = eyeUiState
        boundLifecycleOwner = lifecycleOwner
        lastLoggedFrameId = -1L
        lastReportedDrawnFrameId = -1L
        latestFrame.set(null)
        lastRenderedGeneration.set(0L)
        nextFrameGeneration.set(0L)

        collectorJob = lifecycleOwner.lifecycleScope.launch {
            lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                eyeUiState.collectLatest { eyeState ->
                    val presenterReceivedAtElapsedNanos = SystemClock.elapsedRealtimeNanos()
                    if ((eyeState.frameId ?: -1L) < lastReportedDrawnFrameId) {
                        lastReportedDrawnFrameId = -1L
                    }
                    val nextFrame = PendingEyeSurfaceFrame(
                        bitmap = eyeState.bitmap,
                        experimentMode = drawExperimentMode,
                        frameId = eyeState.frameId,
                        receivedAtElapsedNanos = eyeState.receivedAtElapsedNanos,
                        decodedAtElapsedNanos = eyeState.decodedAtElapsedNanos,
                        frameStatePublishedAtElapsedNanos = eyeState.frameStatePublishedAtElapsedNanos,
                        presenterReceivedAtElapsedNanos = presenterReceivedAtElapsedNanos,
                        preDecodeQueueWaitNanos = eyeState.preDecodeQueueWaitNanos,
                        decodeIdleGapNanos = eyeState.decodeIdleGapNanos,
                        generation = nextFrameGeneration.incrementAndGet(),
                    )
                    val previousPendingFrame = latestFrame.getAndSet(nextFrame)
                    val supersededPendingFrame = previousPendingFrame != null &&
                        previousPendingFrame.generation > lastRenderedGeneration.get() &&
                        previousPendingFrame.frameId != null &&
                        previousPendingFrame.frameId != eyeState.frameId
                    maybeReportEyePresenterReceived(
                        eye = eye,
                        eyeState = eyeState,
                        presenterReceivedAtElapsedNanos = presenterReceivedAtElapsedNanos,
                        supersededPendingFrame = supersededPendingFrame,
                    )
                    maybeLogEyeUpdate(eye, eyeState)
                    requestRender()
                }
            }
        }
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        surfaceReady.set(true)
        lastRenderedGeneration.set(0L)
        clearSurface()
        requestRender()
    }

    override fun surfaceChanged(
        holder: SurfaceHolder,
        format: Int,
        width: Int,
        height: Int,
    ) {
        surfaceReady.set(true)
        lastRenderedGeneration.set(0L)
        requestRender()
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        surfaceReady.set(false)
    }

    override fun onDetachedFromWindow() {
        collectorJob?.cancel()
        collectorJob = null
        boundEye = null
        boundEyeUiState = null
        boundLifecycleOwner = null
        presentationReportingEnabled = false
        presenterReceiveCallback = null
        presentationCallback = null
        lastReportedDrawnFrameId = -1L
        latestFrame.set(null)
        released.set(true)
        surfaceReady.set(false)
        renderExecutor.shutdownNow()
        super.onDetachedFromWindow()
    }

    private fun maybeLogEyeUpdate(
        eye: StereoEyePanel,
        eyeState: NevexEyeBitmapUiState,
    ) {
        val frameId = eyeState.frameId ?: return
        val bitmapIdentityHash = eyeState.bitmapIdentityHash ?: return
        if (lastLoggedFrameId >= 0L && frameId - lastLoggedFrameId < EYE_UPDATE_LOG_INTERVAL_FRAMES) {
            return
        }
        lastLoggedFrameId = frameId
        Log.i(
            UI_LOG_TAG,
            "${eye.title} panel active: frameId=$frameId bitmapId=$bitmapIdentityHash " +
                "peerBitmapId=${eyeState.peerBitmapIdentityHash ?: -1} " +
                "independentFrameData=${eyeState.independentFrameData}",
        )
    }

    private fun maybeReportEyePresenterReceived(
        eye: StereoEyePanel,
        eyeState: NevexEyeBitmapUiState,
        presenterReceivedAtElapsedNanos: Long,
        supersededPendingFrame: Boolean,
    ) {
        if (!presentationReportingEnabled) {
            return
        }
        val frameId = eyeState.frameId ?: return
        val receivedAtElapsedNanos = eyeState.receivedAtElapsedNanos ?: return
        val decodedAtElapsedNanos = eyeState.decodedAtElapsedNanos ?: return
        val frameStatePublishedAtElapsedNanos = eyeState.frameStatePublishedAtElapsedNanos ?: return
        presenterReceiveCallback?.invoke(
            StereoEyePresenterReceiveEvent(
                eye = eye.eyeId,
                experimentMode = drawExperimentMode,
                frameId = frameId,
                receivedAtElapsedNanos = receivedAtElapsedNanos,
                decodedAtElapsedNanos = decodedAtElapsedNanos,
                frameStatePublishedAtElapsedNanos = frameStatePublishedAtElapsedNanos,
                presenterReceivedAtElapsedNanos = presenterReceivedAtElapsedNanos,
                preDecodeQueueWaitNanos = eyeState.preDecodeQueueWaitNanos,
                decodeIdleGapNanos = eyeState.decodeIdleGapNanos,
                supersededPendingFrame = supersededPendingFrame,
            ),
        )
    }

    private fun maybeReportFramePresented(
        frame: PendingEyeSurfaceFrame,
        lockStartedAtElapsedNanos: Long,
        lockCompletedAtElapsedNanos: Long,
        unlockStartedAtElapsedNanos: Long,
        unlockCompletedAtElapsedNanos: Long,
        presentedAtElapsedNanos: Long,
    ) {
        if (!presentationReportingEnabled) {
            return
        }
        val eye = boundEye?.eyeId ?: return
        val frameId = frame.frameId ?: return
        val receivedAtElapsedNanos = frame.receivedAtElapsedNanos ?: return
        val decodedAtElapsedNanos = frame.decodedAtElapsedNanos ?: return
        val frameStatePublishedAtElapsedNanos = frame.frameStatePublishedAtElapsedNanos ?: return
        val presenterReceivedAtElapsedNanos = frame.presenterReceivedAtElapsedNanos ?: return
        if (frameId == lastReportedDrawnFrameId) {
            return
        }
        lastReportedDrawnFrameId = frameId
        presentationCallback?.invoke(
            StereoEyeFramePresentedEvent(
                eye = eye,
                experimentMode = frame.experimentMode,
                frameId = frameId,
                receivedAtElapsedNanos = receivedAtElapsedNanos,
                decodedAtElapsedNanos = decodedAtElapsedNanos,
                frameStatePublishedAtElapsedNanos = frameStatePublishedAtElapsedNanos,
                presenterReceivedAtElapsedNanos = presenterReceivedAtElapsedNanos,
                preDecodeQueueWaitNanos = frame.preDecodeQueueWaitNanos,
                decodeIdleGapNanos = frame.decodeIdleGapNanos,
                lockStartedAtElapsedNanos = lockStartedAtElapsedNanos,
                lockCompletedAtElapsedNanos = lockCompletedAtElapsedNanos,
                unlockStartedAtElapsedNanos = unlockStartedAtElapsedNanos,
                unlockCompletedAtElapsedNanos = unlockCompletedAtElapsedNanos,
                presentedAtElapsedNanos = presentedAtElapsedNanos,
            ),
        )
    }

    private fun requestRender() {
        if (!surfaceReady.get() || released.get() || !hasUndrawnFrame()) {
            return
        }
        if (!renderLoopRunning.compareAndSet(false, true)) {
            return
        }
        try {
            renderExecutor.execute {
                try {
                    while (surfaceReady.get() && !released.get() && hasUndrawnFrame()) {
                        if (!drawLatestFrame()) {
                            break
                        }
                    }
                } finally {
                    renderLoopRunning.set(false)
                    if (surfaceReady.get() && !released.get() && hasUndrawnFrame()) {
                        requestRender()
                    }
                }
            }
        } catch (_: RejectedExecutionException) {
            renderLoopRunning.set(false)
        }
    }

    private fun hasUndrawnFrame(): Boolean {
        val generation = latestFrame.get()?.generation ?: 0L
        return generation > lastRenderedGeneration.get()
    }

    private fun drawLatestFrame(): Boolean {
        val lockStartedAtElapsedNanos = SystemClock.elapsedRealtimeNanos()
        val canvas = lockSurfaceCanvas() ?: return false
        val lockCompletedAtElapsedNanos = SystemClock.elapsedRealtimeNanos()
        val frame = latestFrame.get()
        var unlockStartedAtElapsedNanos = 0L
        var unlockCompletedAtElapsedNanos = 0L
        try {
            drawFrameForExperiment(canvas = canvas, frame = frame)
        } finally {
            unlockStartedAtElapsedNanos = SystemClock.elapsedRealtimeNanos()
            try {
                holder.unlockCanvasAndPost(canvas)
            } catch (_: IllegalArgumentException) {
                return false
            }
            unlockCompletedAtElapsedNanos = SystemClock.elapsedRealtimeNanos()
        }
        if (frame != null) {
            lastRenderedGeneration.set(frame.generation)
            maybeReportFramePresented(
                frame = frame,
                lockStartedAtElapsedNanos = lockStartedAtElapsedNanos,
                lockCompletedAtElapsedNanos = lockCompletedAtElapsedNanos,
                unlockStartedAtElapsedNanos = unlockStartedAtElapsedNanos,
                unlockCompletedAtElapsedNanos = unlockCompletedAtElapsedNanos,
                presentedAtElapsedNanos = SystemClock.elapsedRealtimeNanos(),
            )
        }
        return true
    }

    private fun drawFrameForExperiment(
        canvas: Canvas,
        frame: PendingEyeSurfaceFrame?,
    ) {
        when (frame?.experimentMode ?: drawExperimentMode) {
            PresenterExperimentMode.NormalBitmap -> {
                val bitmap = frame?.bitmap
                if (bitmap == null) {
                    canvas.drawColor(AndroidColor.BLACK)
                } else {
                    drawRotatedBitmap(canvas = canvas, bitmap = bitmap)
                }
            }

            PresenterExperimentMode.ClearOnly -> {
                canvas.drawColor(AndroidColor.BLACK)
            }

            PresenterExperimentMode.TestPattern -> {
                canvas.drawRect(
                    0f,
                    0f,
                    canvas.width.toFloat(),
                    canvas.height.toFloat(),
                    testPatternBackgroundPaint,
                )
                val width = canvas.width.toFloat()
                val height = canvas.height.toFloat()
                canvas.drawRect(0f, 0f, width * 0.36f, height, testPatternAccentPaint)
                canvas.drawRect(width * 0.64f, 0f, width, height, testPatternSecondaryPaint)
                canvas.drawRect(width * 0.20f, height * 0.18f, width * 0.80f, height * 0.82f, testPatternOutlinePaint)
                canvas.drawLine(0f, 0f, width, height, testPatternOutlinePaint)
                canvas.drawLine(0f, height, width, 0f, testPatternOutlinePaint)
            }

            PresenterExperimentMode.PostOnly -> {
                // Intentionally skip canvas work to isolate lock/post/compositor behavior.
            }
        }
    }

    private fun drawRotatedBitmap(
        canvas: Canvas,
        bitmap: android.graphics.Bitmap,
    ) {
        val fitScale = computeQuarterTurnBitmapFitScale(
            bitmapWidth = bitmap.width,
            bitmapHeight = bitmap.height,
            canvasWidth = canvas.width,
            canvasHeight = canvas.height,
        )
        val drawWidth = bitmap.width * fitScale
        val drawHeight = bitmap.height * fitScale
        val halfDrawWidth = drawWidth * 0.5f
        val halfDrawHeight = drawHeight * 0.5f

        canvas.drawColor(AndroidColor.BLACK)
        canvas.save()
        canvas.translate(canvas.width * 0.5f, canvas.height * 0.5f)
        canvas.rotate(EYE_DISPLAY_ROTATION_DEGREES)
        drawBounds.set(
            -halfDrawWidth,
            -halfDrawHeight,
            halfDrawWidth,
            halfDrawHeight,
        )
        canvas.drawBitmap(bitmap, null, drawBounds, bitmapPaint)
        canvas.restore()
    }

    private fun clearSurface() {
        val canvas = lockSurfaceCanvas() ?: return
        try {
            canvas.drawColor(AndroidColor.BLACK)
        } finally {
            try {
                holder.unlockCanvasAndPost(canvas)
            } catch (_: IllegalArgumentException) {
                return
            }
        }
    }

    private fun lockSurfaceCanvas(): Canvas? {
        if (!surfaceReady.get()) {
            return null
        }
        return try {
            holder.lockCanvas()
        } catch (_: IllegalArgumentException) {
            null
        } catch (_: IllegalStateException) {
            null
        }
    }
}

private fun computeQuarterTurnBitmapFitScale(
    bitmapWidth: Int,
    bitmapHeight: Int,
    canvasWidth: Int,
    canvasHeight: Int,
): Float {
    if (bitmapWidth <= 0 || bitmapHeight <= 0 || canvasWidth <= 0 || canvasHeight <= 0) {
        return 1f
    }
    val rotatedWidth = bitmapHeight.toFloat()
    val rotatedHeight = bitmapWidth.toFloat()
    return min(
        canvasWidth / rotatedWidth,
        canvasHeight / rotatedHeight,
    )
}
