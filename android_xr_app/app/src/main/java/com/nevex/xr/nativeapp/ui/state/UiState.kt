package com.nevex.xr.nativeapp.ui.state

import android.graphics.Bitmap

enum class NevexMenuScreen(
    val title: String,
) {
    MainMenu("Operator Menu"),
    MissionProfiles("Mission Profiles"),
    Capture("Capture"),
    Settings("Settings"),
    DisplaySettings("Display Settings"),
    ThermalPresentation("Thermal Presentation"),
    ThermalAlignment("Thermal Alignment"),
    ThermalAutoCalibration("Auto Calibration"),
    SystemStatus("System Status"),
}

enum class PlaceholderViewMode(
    val label: String,
) {
    NightVision("NVG Placeholder"),
    FutureModes("Future Modes");

    fun next(): PlaceholderViewMode {
        return when (this) {
            NightVision -> FutureModes
            FutureModes -> NightVision
        }
    }
}

data class MenuSettingsUiState(
    val brightness: Float = 0.55f,
    val contrast: Float = 0.50f,
    val overlayOpacity: Float = 0.78f,
    val soundVolume: Float = 0.60f,
    val autoConnectOnStartup: Boolean = true,
)

data class DisplaySettingsUiState(
    val reticleEnabled: Boolean = true,
    val gridEnabled: Boolean = false,
    val boundingBoxesEnabled: Boolean = false,
    val thermalMode: ThermalOverlayMode = ThermalOverlayMode.Off,
    val thermalVisualMode: ThermalVisualMode = ThermalVisualMode.WhiteHot,
    val thermalOnlyModeEnabled: Boolean = false,
    val thermalPreviewModeEnabled: Boolean = false,
    val thermalPreviewOpacityPreset: ThermalPreviewOpacityPreset = ThermalPreviewOpacityPreset.P25,
)

enum class ViewingMode(
    val label: String,
    val detailText: String,
) {
    Visible(
        label = "Visible",
        detailText = "Visible stereo feed only.",
    ),
    ThermalOverlay(
        label = "Thermal Overlay",
        detailText = "Blend live thermal over the visible feed.",
    ),
    ThermalOnly(
        label = "Thermal Only",
        detailText = "Hide visible imagery and keep thermal only.",
    );

    fun next(): ViewingMode {
        return when (this) {
            Visible -> ThermalOverlay
            ThermalOverlay -> ThermalOnly
            ThermalOnly -> Visible
        }
    }

    fun previous(): ViewingMode {
        return when (this) {
            Visible -> ThermalOnly
            ThermalOverlay -> Visible
            ThermalOnly -> ThermalOverlay
        }
    }
}

enum class MissionProfile(
    val label: String,
    val detailText: String,
    val liveIntentText: String,
) {
    Inspection(
        label = "Inspection",
        detailText = "Cleaner visible-first viewing with quick evidence capture.",
        liveIntentText = "Visible-first, capture ready",
    ),
    Rescue(
        label = "Rescue",
        detailText = "Thermal-forward search profile with faster reacquire cues.",
        liveIntentText = "Thermal overlay, faster reacquire",
    ),
    Tactical(
        label = "Tactical / Police",
        detailText = "Restrained low-clutter viewing with quieter operator cues.",
        liveIntentText = "Low clutter, quick switch",
    ),
    Marine(
        label = "Marine",
        detailText = "Water and horizon-aware shell with black-hot thermal bias.",
        liveIntentText = "Black-hot bias, marine shell",
    ),
}

data class DetectionBox(
    val label: String,
    val xFraction: Float,
    val yFraction: Float,
    val widthFraction: Float,
    val heightFraction: Float,
    val confidence: Float? = null,
)

enum class ThermalOverlayMode(
    val label: String,
) {
    Off("Off"),
    Placeholder("Placeholder"),
    Live("Live Thermal");

    fun next(): ThermalOverlayMode {
        return when (this) {
            Off -> Placeholder
            Placeholder -> Live
            Live -> Off
        }
    }

    fun previous(): ThermalOverlayMode {
        return when (this) {
            Off -> Live
            Placeholder -> Off
            Live -> Placeholder
        }
    }
}

// ThermalOverlay attenuates the live image further, so these internal values land near
// the intended visible preview blend on the emulator and PC-display path.
enum class ThermalPreviewOpacityPreset(
    val label: String,
    val visiblePercent: Int,
    val overlayOpacity: Float,
) {
    P10(
        label = "10%",
        visiblePercent = 10,
        overlayOpacity = 0.20f,
    ),
    P25(
        label = "25%",
        visiblePercent = 25,
        overlayOpacity = 0.50f,
    ),
    P40(
        label = "40%",
        visiblePercent = 40,
        overlayOpacity = 0.80f,
    );

    fun next(): ThermalPreviewOpacityPreset {
        return when (this) {
            P10 -> P25
            P25 -> P40
            P40 -> P10
        }
    }

    fun previous(): ThermalPreviewOpacityPreset {
        return when (this) {
            P10 -> P40
            P25 -> P10
            P40 -> P25
        }
    }
}

enum class ThermalRuntimeState(
    val label: String,
) {
    Off("Off"),
    Placeholder("Placeholder"),
    Connecting("Connecting"),
    Streaming("Streaming"),
    Stale("Stale"),
    Error("Error"),
}

enum class ThermalVisualMode(
    val label: String,
) {
    WhiteHot("White Hot"),
    BlackHot("Black Hot"),
}

enum class CalibrationMode {
    Idle,
    WaitingForVisibleSource,
    WaitingForMotion,
    Capturing,
    Processing,
    Complete,
    LowConfidence,
    Failed,
}

enum class ThermalAlignmentAdjustmentMode(
    val label: String,
    val offsetStepFraction: Float,
    val scaleStep: Float,
    val offsetSliderSteps: Int,
    val scaleSliderSteps: Int,
    val offsetStepLabel: String,
    val scaleStepLabel: String,
    val summaryText: String,
) {
    Coarse(
        label = "Coarse",
        offsetStepFraction = 0.01f,
        scaleStep = 0.01f,
        offsetSliderSteps = 49,
        scaleSliderSteps = 49,
        offsetStepLabel = "1.0% frame",
        scaleStepLabel = "1.0% scale",
        summaryText = "1.0% frame / 1.0% scale",
    ),
    Fine(
        label = "Fine",
        offsetStepFraction = 0.0025f,
        scaleStep = 0.0025f,
        offsetSliderSteps = 199,
        scaleSliderSteps = 199,
        offsetStepLabel = "0.25% frame",
        scaleStepLabel = "0.25% scale",
        summaryText = "0.25% frame / 0.25% scale",
    );

    fun next(): ThermalAlignmentAdjustmentMode {
        return when (this) {
            Coarse -> Fine
            Fine -> Coarse
        }
    }

    fun previous(): ThermalAlignmentAdjustmentMode {
        return when (this) {
            Coarse -> Fine
            Fine -> Coarse
        }
    }
}

enum class ThermalCalibrationStatus(
    val label: String,
    val detailText: String,
) {
    Default(
        label = "Default",
        detailText = "Factory-centered fit active",
    ),
    Restored(
        label = "Restored",
        detailText = "Loaded from saved calibration",
    ),
    Manual(
        label = "Manual",
        detailText = "Manual trim active and auto-saved",
    ),
    Auto(
        label = "Auto",
        detailText = "Automatic coarse start active; refine manually if needed",
    ),
}

data class ThermalOverlayTransform(
    val offsetXFraction: Float = 0f,
    val offsetYFraction: Float = 0f,
    val scale: Float = 1f,
    val cropLeftFraction: Float = 0f,
    val cropTopFraction: Float = 0f,
    val cropRightFraction: Float = 0f,
    val cropBottomFraction: Float = 0f,
)

// Future crop and rotation controls can extend this grouped alignment state cleanly.
data class ThermalAlignmentUiState(
    val adjustmentMode: ThermalAlignmentAdjustmentMode = ThermalAlignmentAdjustmentMode.Fine,
    val calibrationStatus: ThermalCalibrationStatus = ThermalCalibrationStatus.Default,
    val autoCalibration: ThermalAutoCalibrationUiState = ThermalAutoCalibrationUiState(),
)

data class ThermalAutoCalibrationUiState(
    val mode: CalibrationMode = CalibrationMode.Idle,
    val progress: Float = 0f,
    val completionSummary: String = "No automatic calibration run yet",
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

data class ThermalOverlayUiState(
    val runtimeState: ThermalRuntimeState = ThermalRuntimeState.Off,
    val statusText: String = "Off",
    val detailText: String = "Thermal overlay disabled",
    val centerText: String = "--",
    val rangeText: String = "--",
    val captureFpsText: String = "--",
    val visualMode: ThermalVisualMode = ThermalVisualMode.WhiteHot,
    val transform: ThermalOverlayTransform = ThermalOverlayTransform(),
)

data class OverlayUiState(
    val reticleEnabled: Boolean = true,
    val gridEnabled: Boolean = false,
    val boundingBoxesEnabled: Boolean = false,
    val thermalMode: ThermalOverlayMode = ThermalOverlayMode.Off,
    val hideVisibleFeed: Boolean = false,
    val thermalPreviewModeEnabled: Boolean = false,
    val thermalPreviewOpacityOverride: Float? = null,
    val thermalPreviewVisiblePercent: Int = 25,
    val overlayOpacity: Float = 0.78f,
    val brightness: Float = 0.55f,
    val contrast: Float = 0.50f,
    val detections: List<DetectionBox> = emptyList(),
    val thermalFrame: Bitmap? = null,
    val useRealDetections: Boolean = false,
    val useRealThermal: Boolean = false,
    val thermal: ThermalOverlayUiState = ThermalOverlayUiState(),
    val calibrationAidActive: Boolean = false,
    val calibrationGuideVisible: Boolean = false,
)

enum class BootSequencePhase(
    val title: String,
    val detailText: String,
    val progress: Float,
) {
    Initializing(
        title = "INITIALIZING",
        detailText = "Core subsystems online",
        progress = 0.34f,
    ),
    Connecting(
        title = "CONNECTING",
        detailText = "Optics and control bus check",
        progress = 0.68f,
    ),
    SystemReady(
        title = "SYSTEM READY",
        detailText = "Standby state nominal",
        progress = 1.0f,
    ),
}

data class BootSequenceUiState(
    val visible: Boolean = true,
    val phase: BootSequencePhase = BootSequencePhase.Initializing,
)

data class SystemStatusMenuUiState(
    val connectionStatus: String = "Disconnected",
    val frameRate: String = "--",
    val latency: String = "--",
    val sensorStatus: String = "Sensor status pending",
    val thermalStatus: String = "Thermal idle",
    val thermalRange: String = "--",
    val thermalCenter: String = "--",
    val thermalCaptureFps: String = "--",
)

enum class CaptureFeedbackTone {
    Neutral,
    Success,
    Recording,
    Danger,
}

data class CaptureFeedbackUiState(
    val message: String,
    val tone: CaptureFeedbackTone = CaptureFeedbackTone.Success,
)

data class CaptureShellUiState(
    val recordingActive: Boolean = false,
    val lastSnapshotSavedAtMs: Long? = null,
    val lastSnapshotLabel: String = "No snapshot yet",
    val feedback: CaptureFeedbackUiState? = null,
)

data class NevexMenuUiState(
    val isMenuVisible: Boolean = false,
    val isMenuAvailable: Boolean = false,
    val currentMenu: NevexMenuScreen = NevexMenuScreen.MainMenu,
    val selectedItemIndex: Int = 0,
    val placeholderViewMode: PlaceholderViewMode = PlaceholderViewMode.NightVision,
    val missionProfile: MissionProfile = MissionProfile.Inspection,
    val settings: MenuSettingsUiState = MenuSettingsUiState(),
    val displaySettings: DisplaySettingsUiState = DisplaySettingsUiState(),
    val thermalAlignment: ThermalAlignmentUiState = ThermalAlignmentUiState(),
    val systemStatus: SystemStatusMenuUiState = SystemStatusMenuUiState(),
)

object MenuSelectionIndex {
    object Main {
        const val ViewingMode = 0
        const val MissionProfiles = 1
        const val Capture = 2
        const val Settings = 3
        const val SystemStatus = 4
        const val Close = 5
        const val Count = 6
    }

    object MissionProfiles {
        const val Inspection = 0
        const val Rescue = 1
        const val Tactical = 2
        const val Marine = 3
        const val ReturnMain = 4
        const val Count = 5
    }

    object Capture {
        const val Snapshot = 0
        const val Recording = 1
        const val ReturnMain = 2
        const val Count = 3
    }

    object Settings {
        const val AutoConnect = 0
        const val SoundVolume = 1
        const val OverlayOpacity = 2
        const val DisplaySettings = 3
        const val SystemStatus = 4
        const val RestoreDefaults = 5
        const val ReturnMain = 6
        const val Count = 7
    }

    object Display {
        const val Reticle = 0
        const val Grid = 1
        const val BoundingBoxes = 2
        const val ThermalOverlay = 3
        const val ThermalPresentation = 4
        const val ThermalPreview = 5
        const val ThermalPreviewOpacity = 6
        const val ThermalAlignment = 7
        const val ReturnSettings = 8
        const val Count = 9
    }

    object ThermalPresentation {
        const val WhiteHot = 0
        const val BlackHot = 1
        const val WarmTargetsOnly = 2
        const val ThresholdedThermal = 3
        const val EdgeAssist = 4
        const val FusionAssist = 5
        const val ReturnDisplay = 6
        const val Count = 7
    }

    object Alignment {
        const val AdjustmentMode = 0
        const val AutoCalibrate = 1
        const val OffsetX = 2
        const val OffsetY = 3
        const val Scale = 4
        const val OverlayOpacity = 5
        const val CenterOffsets = 6
        const val Reset = 7
        const val ReturnDisplay = 8
        const val Count = 9
    }

    object AutoCalibration {
        const val PrimaryAction = 0
        const val Count = 1
    }

    object Status {
        const val ReturnMain = 0
        const val Count = 1
    }
}
