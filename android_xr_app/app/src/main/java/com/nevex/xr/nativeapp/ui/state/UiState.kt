package com.nevex.xr.nativeapp.ui.state

import android.graphics.Bitmap

enum class NevexMenuScreen(
    val title: String,
) {
    MainMenu("Main Menu"),
    Settings("Settings"),
    DisplaySettings("Display Settings"),
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
)

data class DisplaySettingsUiState(
    val reticleEnabled: Boolean = true,
    val gridEnabled: Boolean = false,
    val boundingBoxesEnabled: Boolean = false,
    val thermalOverlayEnabled: Boolean = false,
)

data class DetectionBox(
    val label: String,
    val xFraction: Float,
    val yFraction: Float,
    val widthFraction: Float,
    val heightFraction: Float,
    val confidence: Float? = null,
)

data class OverlayUiState(
    val reticleEnabled: Boolean = true,
    val gridEnabled: Boolean = false,
    val boundingBoxesEnabled: Boolean = false,
    val thermalOverlayEnabled: Boolean = false,
    val overlayOpacity: Float = 0.78f,
    val brightness: Float = 0.55f,
    val contrast: Float = 0.50f,
    val detections: List<DetectionBox> = emptyList(),
    val thermalFrame: Bitmap? = null,
    val useRealDetections: Boolean = false,
    val useRealThermal: Boolean = false,
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
)

data class NevexMenuUiState(
    val isMenuVisible: Boolean = false,
    val isMenuAvailable: Boolean = false,
    val currentMenu: NevexMenuScreen = NevexMenuScreen.MainMenu,
    val selectedItemIndex: Int = 0,
    val placeholderViewMode: PlaceholderViewMode = PlaceholderViewMode.NightVision,
    val settings: MenuSettingsUiState = MenuSettingsUiState(),
    val displaySettings: DisplaySettingsUiState = DisplaySettingsUiState(),
    val systemStatus: SystemStatusMenuUiState = SystemStatusMenuUiState(),
)

object MenuSelectionIndex {
    object Main {
        const val Resume = 0
        const val ToggleMode = 1
        const val Settings = 2
        const val SystemStatus = 3
        const val Count = 4
    }

    object Settings {
        const val Brightness = 0
        const val Contrast = 1
        const val OverlayOpacity = 2
        const val SoundVolume = 3
        const val DisplaySettings = 4
        const val ReturnMain = 5
        const val Count = 6
    }

    object Display {
        const val Reticle = 0
        const val Grid = 1
        const val BoundingBoxes = 2
        const val ThermalOverlay = 3
        const val ReturnSettings = 4
        const val Count = 5
    }

    object Status {
        const val ReturnMain = 0
        const val Count = 1
    }
}
