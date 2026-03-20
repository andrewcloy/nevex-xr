package com.nevex.xr.nativeapp

import android.content.pm.ApplicationInfo
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import androidx.activity.viewModels
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.nevex.xr.nativeapp.ui.NevexXrApp
import com.nevex.xr.nativeapp.ui.NevexXrViewModel
import com.nevex.xr.nativeapp.ui.state.MissionProfile
import com.nevex.xr.nativeapp.ui.state.ThermalVisualMode
import com.nevex.xr.nativeapp.ui.state.ViewingMode

const val EXTRA_AUTO_CONNECT = "nevex.auto_connect"
const val EXTRA_JETSON_HOST = "nevex.jetson_host"
const val EXTRA_PRESENTER_MODE = "nevex.presenter_mode"
const val EXTRA_PREVIEW_BOOT_MODE = "nevex.preview_boot_mode"
private const val DEBUG_OPERATOR_ACTION = "com.nevex.xr.nativeapp.DEBUG_OPERATOR_ACTION"
private const val DEBUG_OPERATOR_COMMAND = "command"
private const val DEBUG_OPERATOR_LOG_TAG = "NevexXrDebug"

class MainActivity : ComponentActivity() {
    private val viewModel: NevexXrViewModel by viewModels()
    private var validationReceiverRegistered = false
    private val validationReceiver = object : BroadcastReceiver() {
        override fun onReceive(
            context: Context?,
            intent: Intent?,
        ) {
            val command = intent?.getStringExtra(DEBUG_OPERATOR_COMMAND)?.trim()?.lowercase()
            if (command.isNullOrEmpty()) {
                return
            }
            Log.i(DEBUG_OPERATOR_LOG_TAG, "Validation command received: $command")
            when (command) {
                "open_menu" -> viewModel.openMenuForValidation()
                "close_menu" -> viewModel.closeMenuForValidation()
                "visible" -> viewModel.setPrimaryViewingMode(ViewingMode.Visible)
                "thermal_overlay" -> viewModel.setPrimaryViewingMode(ViewingMode.ThermalOverlay)
                "thermal_only" -> viewModel.setPrimaryViewingMode(ViewingMode.ThermalOnly)
                "profile_inspection" -> viewModel.setMissionProfile(MissionProfile.Inspection)
                "profile_rescue" -> viewModel.setMissionProfile(MissionProfile.Rescue)
                "profile_tactical" -> viewModel.setMissionProfile(MissionProfile.Tactical)
                "profile_marine" -> viewModel.setMissionProfile(MissionProfile.Marine)
                "white_hot" -> viewModel.setThermalVisualMode(ThermalVisualMode.WhiteHot)
                "black_hot" -> viewModel.setThermalVisualMode(ThermalVisualMode.BlackHot)
                "capture_snapshot" -> viewModel.captureSnapshot()
                "start_recording" -> viewModel.startRecording()
                "stop_recording" -> viewModel.stopRecording()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        applyImmersiveSystemUi()
        setContent {
            NevexXrApp(
                autoConnectOnStart = intent.getBooleanExtra(EXTRA_AUTO_CONNECT, false),
                autoConnectHost = intent.getStringExtra(EXTRA_JETSON_HOST),
                previewBootModeOnStart = intent.getBooleanExtra(EXTRA_PREVIEW_BOOT_MODE, false),
                initialPresenterExperimentMode = PresenterExperimentMode.fromWireValue(
                    intent.getStringExtra(EXTRA_PRESENTER_MODE),
                ) ?: PresenterExperimentMode.NormalBitmap,
                viewModel = viewModel,
            )
        }
    }

    override fun onStart() {
        super.onStart()
        registerValidationReceiverIfNeeded()
    }

    override fun onStop() {
        unregisterValidationReceiverIfNeeded()
        super.onStop()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            applyImmersiveSystemUi()
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && viewModel.handleMenuKeyInput(event.keyCode)) {
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    private fun applyImmersiveSystemUi() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private fun registerValidationReceiverIfNeeded() {
        if (validationReceiverRegistered || !isValidationAutomationEnabled()) {
            return
        }
        ContextCompat.registerReceiver(
            this,
            validationReceiver,
            IntentFilter(DEBUG_OPERATOR_ACTION),
            ContextCompat.RECEIVER_EXPORTED,
        )
        validationReceiverRegistered = true
    }

    private fun unregisterValidationReceiverIfNeeded() {
        if (!validationReceiverRegistered) {
            return
        }
        unregisterReceiver(validationReceiver)
        validationReceiverRegistered = false
    }

    private fun isValidationAutomationEnabled(): Boolean {
        val isDebuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        return isDebuggable && (
            Build.FINGERPRINT.contains("generic", ignoreCase = true) ||
                Build.MODEL.contains("sdk", ignoreCase = true) ||
                Build.MODEL.contains("emulator", ignoreCase = true) ||
                Build.PRODUCT.contains("emulator", ignoreCase = true)
            )
    }
}
