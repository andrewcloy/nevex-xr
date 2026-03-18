package com.nevex.xr.nativeapp.ui.boot

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.ui.state.BootSequencePhase
import com.nevex.xr.nativeapp.ui.state.BootSequenceUiState
import com.nevex.xr.nativeapp.ui.theme.NevexAccent
import com.nevex.xr.nativeapp.ui.theme.NevexBackground
import com.nevex.xr.nativeapp.ui.theme.NevexBorder
import com.nevex.xr.nativeapp.ui.theme.NevexOverlayLineMuted
import com.nevex.xr.nativeapp.ui.theme.NevexPanelStrong
import com.nevex.xr.nativeapp.ui.theme.NevexSuccess
import com.nevex.xr.nativeapp.ui.theme.NevexTextPrimary
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary

@Composable
fun BootSequenceOverlay(
    bootSequenceUiState: BootSequenceUiState,
    modifier: Modifier = Modifier,
) {
    if (!bootSequenceUiState.visible) {
        return
    }

    val progress by animateFloatAsState(
        targetValue = bootSequenceUiState.phase.progress,
        animationSpec = tween(durationMillis = 180),
        label = "bootProgress",
    )
    val accentColor = if (bootSequenceUiState.phase == BootSequencePhase.SystemReady) {
        NevexSuccess
    } else {
        NevexAccent
    }

    Box(
        modifier = modifier.fillMaxSize(),
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            drawRect(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Color.Transparent,
                        NevexBackground.copy(alpha = 0.22f),
                        NevexBackground.copy(alpha = 0.42f),
                    ),
                ),
            )

            val step = size.height / 34f
            var y = 0f
            while (y < size.height) {
                drawLine(
                    color = NevexOverlayLineMuted.copy(alpha = 0.10f),
                    start = androidx.compose.ui.geometry.Offset(0f, y),
                    end = androidx.compose.ui.geometry.Offset(size.width, y),
                    strokeWidth = 1f,
                )
                y += step
            }
        }

        Surface(
            modifier = Modifier
                .align(Alignment.Center)
                .padding(top = 72.dp)
                .width(420.dp),
            color = NevexPanelStrong.copy(alpha = 0.88f),
            border = BorderStroke(1.dp, NevexBorder),
            shape = MaterialTheme.shapes.small,
        ) {
            androidx.compose.foundation.layout.Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "SYSTEM BRING-UP",
                    style = MaterialTheme.typography.labelMedium,
                    color = NevexTextSecondary,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = bootSequenceUiState.phase.title,
                    style = MaterialTheme.typography.headlineSmall,
                    color = NevexTextPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = bootSequenceUiState.phase.detailText,
                    style = MaterialTheme.typography.bodyMedium,
                    color = NevexTextSecondary,
                )
                BootPhaseProgressBar(
                    progress = progress,
                    accentColor = accentColor,
                )
                BootPhaseLabels(
                    activePhase = bootSequenceUiState.phase,
                    accentColor = accentColor,
                )
            }
        }
    }
}

@Composable
private fun BootPhaseProgressBar(
    progress: Float,
    accentColor: Color,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(6.dp)
            .background(
                color = NevexBorder.copy(alpha = 0.32f),
                shape = MaterialTheme.shapes.extraSmall,
            ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(progress.coerceIn(0f, 1f))
                .height(6.dp)
                .background(
                    color = accentColor.copy(alpha = 0.88f),
                    shape = MaterialTheme.shapes.extraSmall,
                ),
        )
    }
}

@Composable
private fun BootPhaseLabels(
    activePhase: BootSequencePhase,
    accentColor: Color,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        BootSequencePhase.entries.forEach { phase ->
            val isReached = phase.ordinal <= activePhase.ordinal
            Text(
                text = phase.title,
                style = MaterialTheme.typography.labelSmall,
                color = if (isReached) {
                    accentColor
                } else {
                    NevexTextSecondary.copy(alpha = 0.68f)
                },
                fontWeight = if (phase == activePhase) FontWeight.SemiBold else FontWeight.Medium,
            )
        }
    }
}
