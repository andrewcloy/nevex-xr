package com.nevex.xr.nativeapp

import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.nevex.xr.nativeapp.ui.NevexXrApp
import com.nevex.xr.nativeapp.ui.NevexXrViewModel

const val EXTRA_AUTO_CONNECT = "nevex.auto_connect"
const val EXTRA_JETSON_HOST = "nevex.jetson_host"
const val EXTRA_PRESENTER_MODE = "nevex.presenter_mode"

class MainActivity : ComponentActivity() {
    private val viewModel: NevexXrViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            NevexXrApp(
                autoConnectOnStart = intent.getBooleanExtra(EXTRA_AUTO_CONNECT, false),
                autoConnectHost = intent.getStringExtra(EXTRA_JETSON_HOST),
                initialPresenterExperimentMode = PresenterExperimentMode.fromWireValue(
                    intent.getStringExtra(EXTRA_PRESENTER_MODE),
                ) ?: PresenterExperimentMode.NormalBitmap,
                viewModel = viewModel,
            )
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && viewModel.handleMenuKeyInput(event.keyCode)) {
            return true
        }
        return super.dispatchKeyEvent(event)
    }
}
