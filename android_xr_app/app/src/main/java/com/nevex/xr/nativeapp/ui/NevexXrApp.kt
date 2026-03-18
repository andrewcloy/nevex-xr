package com.nevex.xr.nativeapp.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color as AndroidColor
import android.graphics.Paint
import android.graphics.Rect
import android.os.SystemClock
import android.util.Log
import android.view.SurfaceHolder
import android.view.SurfaceView
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.ui.platform.LocalContext
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
import com.nevex.xr.nativeapp.stream.StereoEye
import com.nevex.xr.nativeapp.stream.StereoEyeFramePresentedEvent
import com.nevex.xr.nativeapp.stream.StereoEyePresenterReceiveEvent
import com.nevex.xr.nativeapp.stream.StereoFrameLayoutHint
import com.nevex.xr.nativeapp.stream.StereoPresentationTarget
import com.nevex.xr.nativeapp.ui.boot.BootSequenceOverlay
import com.nevex.xr.nativeapp.ui.menu.MenuOverlayPanel
import com.nevex.xr.nativeapp.ui.overlay.LiveViewOverlayLayer
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.state.OverlayUiState
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
import kotlinx.coroutines.Job
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

@Composable
fun NevexXrApp(
    autoConnectOnStart: Boolean = false,
    autoConnectHost: String? = null,
    initialPresenterExperimentMode: PresenterExperimentMode = PresenterExperimentMode.NormalBitmap,
    viewModel: NevexXrViewModel = viewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val menuUiState by viewModel.menuUiState.collectAsStateWithLifecycle()
    val overlayUiState by viewModel.overlayUiState.collectAsStateWithLifecycle()
    val bootSequenceUiState by viewModel.bootSequenceUiState.collectAsStateWithLifecycle()
    val appContext = LocalContext.current.applicationContext
    val session = LocalSession.current
    val presentationTarget = resolvePresentationTarget(session)
    var autoConnectTriggered by remember { mutableStateOf(false) }

    LaunchedEffect(initialPresenterExperimentMode) {
        viewModel.setPresenterExperimentMode(initialPresenterExperimentMode)
        Log.i(
            UI_LOG_TAG,
            "Presenter experiment mode initialized to ${initialPresenterExperimentMode.wireValue}",
        )
    }

    LaunchedEffect(appContext) {
        viewModel.ensureSoundManagerInitialized(appContext)
        viewModel.ensureBootSequenceStarted()
    }

    LaunchedEffect(
        autoConnectOnStart,
        autoConnectHost,
        autoConnectTriggered,
        uiState.connected,
        uiState.hasLiveFrame,
    ) {
        if (
            !autoConnectOnStart ||
            autoConnectTriggered ||
            uiState.connected ||
            uiState.hasLiveFrame
        ) {
            return@LaunchedEffect
        }

        autoConnectHost
            ?.trim()
            ?.takeIf { host -> host.isNotEmpty() }
            ?.let(viewModel::onEndpointHostChanged)
        autoConnectTriggered = true
        Log.i(UI_LOG_TAG, "Auto-connect launch hook engaged for XR validation")
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
                overlayUiState = overlayUiState,
                onSelectIndex = viewModel::selectMenuIndex,
                onStartResume = viewModel::onStartResumeView,
                onToggleMode = viewModel::togglePlaceholderMode,
                onOpenSettings = viewModel::openSettingsMenu,
                onOpenDisplaySettings = viewModel::openDisplaySettingsMenu,
                onOpenSystemStatus = viewModel::openSystemStatusMenu,
                onReturnMain = viewModel::returnToMainMenu,
                onReturnSettings = viewModel::returnToSettingsMenu,
                onBrightnessChange = viewModel::setBrightness,
                onContrastChange = viewModel::setContrast,
                onOverlayOpacityChange = viewModel::setOverlayOpacity,
                onSoundVolumeChange = viewModel::setSoundVolume,
                onReticleToggle = viewModel::setReticleEnabled,
                onGridToggle = viewModel::setGridEnabled,
                onBoundingBoxesToggle = viewModel::setBoundingBoxesEnabled,
                onThermalOverlayToggle = viewModel::setThermalOverlayEnabled,
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
                Box(modifier = Modifier.fillMaxSize()) {
                    ConnectScreen(
                        uiState = uiState,
                        menuVisible = menuUiState.isMenuVisible,
                        onHostChanged = viewModel::onEndpointHostChanged,
                        onConnect = viewModel::connect,
                        onToggleMenu = viewModel::toggleMenuVisibility,
                    )
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
    menuVisible: Boolean,
    onHostChanged: (String) -> Unit,
    onConnect: () -> Unit,
    onToggleMenu: () -> Unit,
) {
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
                StatusPill(
                    title = if (uiState.errorMessage == null) "Native XR Live View" else "Connection issue",
                    subtitle = if (uiState.errorMessage == null) uiState.lifecycleText else uiState.errorMessage,
                    accentColor = if (uiState.errorMessage == null) NevexAccent else NevexDanger,
                    modifier = Modifier.width(260.dp),
                )
                TextButton(onClick = onToggleMenu) {
                    Text(
                        text = if (menuVisible) "Close Menu" else "Menu",
                        color = NevexTextPrimary,
                    )
                }

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Connect to NEVEX XR",
                        style = MaterialTheme.typography.headlineMedium,
                        color = NevexTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Launch a headset-native live view that keeps the Jetson stereo stream quiet, immersive, and current.",
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

                Text(
                    text = "The first milestone keeps the existing Jetson protocol intact, decodes `JSBF` stereo frames natively, and transitions into Full Space once live imagery is flowing.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = NevexTextSecondary.copy(alpha = 0.88f),
                )
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
    Subspace {
        SpatialRow {
            SpatialPanel(
                modifier = SubspaceModifier
                    .subspaceWidth(960.dp)
                    .subspaceHeight(640.dp),
                dragPolicy = MovePolicy(),
                resizePolicy = ResizePolicy(),
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
                    onDisconnect = onDisconnect,
                    onToggleMenu = onToggleMenu,
                    onToggleDiagnostics = onToggleDiagnostics,
                    onTogglePerformanceInstrumentation = onTogglePerformanceInstrumentation,
                    onCyclePresenterExperimentMode = onCyclePresenterExperimentMode,
                    onEyePresenterFrameReceived = onEyePresenterFrameReceived,
                    onFramePresented = onFramePresented,
                )
            }
            SpatialSpacer(SubspaceModifier.subspaceWidth(32.dp))
            SpatialPanel(
                modifier = SubspaceModifier
                    .subspaceWidth(960.dp)
                    .subspaceHeight(640.dp),
                dragPolicy = MovePolicy(),
                resizePolicy = ResizePolicy(),
            ) {
                EyeSurface(
                    eye = StereoEyePanel.Right,
                    uiState = uiState,
                    frameUiState = frameUiState,
                    eyeUiState = rightEyeUiState,
                    overlayUiState = overlayUiState,
                    presentationTarget = presentationTarget,
                    showControls = true,
                    menuVisible = menuUiState.isMenuVisible,
                    onDisconnect = onDisconnect,
                    onToggleMenu = onToggleMenu,
                    onToggleDiagnostics = onToggleDiagnostics,
                    onTogglePerformanceInstrumentation = onTogglePerformanceInstrumentation,
                    onCyclePresenterExperimentMode = onCyclePresenterExperimentMode,
                    onEyePresenterFrameReceived = onEyePresenterFrameReceived,
                    onFramePresented = onFramePresented,
                )
            }
            if (menuUiState.isMenuVisible) {
                SpatialSpacer(SubspaceModifier.subspaceWidth(24.dp))
                SpatialPanel(
                    modifier = SubspaceModifier
                        .subspaceWidth(480.dp)
                        .subspaceHeight(720.dp),
                    dragPolicy = MovePolicy(),
                    resizePolicy = ResizePolicy(),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(18.dp),
                    ) {
                        menuOverlayContent(Modifier.fillMaxWidth())
                    }
                }
            }
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
    onDisconnect: () -> Unit,
    onToggleMenu: () -> Unit,
    onToggleDiagnostics: () -> Unit,
    onTogglePerformanceInstrumentation: () -> Unit,
    onCyclePresenterExperimentMode: () -> Unit,
    onEyePresenterFrameReceived: (StereoEyePresenterReceiveEvent) -> Unit,
    onFramePresented: (StereoEyeFramePresentedEvent) -> Unit,
) {
    val overlayAlpha by animateFloatAsState(
        targetValue = if (uiState.isHealthy && !uiState.diagnosticsVisible) 0.48f else 1f,
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

        LiveViewOverlayLayer(
            overlayUiState = overlayUiState,
            modifier = Modifier.fillMaxSize(),
        )

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
    private val drawBounds = Rect()
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
                    drawBounds.set(0, 0, canvas.width, canvas.height)
                    canvas.drawBitmap(bitmap, null, drawBounds, bitmapPaint)
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
