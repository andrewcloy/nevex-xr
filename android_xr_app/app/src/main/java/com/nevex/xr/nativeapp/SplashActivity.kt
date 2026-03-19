package com.nevex.xr.nativeapp

import android.app.Activity.OVERRIDE_TRANSITION_CLOSE
import android.app.Activity.OVERRIDE_TRANSITION_OPEN
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

private const val SPLASH_HOLD_MS = 120L

class SplashActivity : ComponentActivity() {
    private var handoffScheduled = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applyImmersiveSystemUi()
        window.decorView.post {
            if (!handoffScheduled) {
                handoffScheduled = true
                window.decorView.postDelayed(::launchMainActivity, SPLASH_HOLD_MS)
            }
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            applyImmersiveSystemUi()
        }
    }

    private fun launchMainActivity() {
        if (isFinishing || isDestroyed) {
            return
        }

        val forwardIntent = Intent(this, MainActivity::class.java).apply {
            action = intent.action
            data = intent.data
            intent.extras?.let(::putExtras)
        }

        startActivity(forwardIntent)
        overrideActivityTransition(OVERRIDE_TRANSITION_OPEN, 0, 0)
        finish()
        overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, 0, 0)
    }

    private fun applyImmersiveSystemUi() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }
}
