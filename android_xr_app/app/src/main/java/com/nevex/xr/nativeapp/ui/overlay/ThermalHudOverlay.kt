package com.nevex.xr.nativeapp.ui.overlay

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.ui.state.ThermalOverlayUiState
import com.nevex.xr.nativeapp.ui.state.ThermalRuntimeState
import com.nevex.xr.nativeapp.ui.theme.NevexAccent
import com.nevex.xr.nativeapp.ui.theme.NevexDanger
import com.nevex.xr.nativeapp.ui.theme.NevexPanelStrong
import com.nevex.xr.nativeapp.ui.theme.NevexSuccess
import com.nevex.xr.nativeapp.ui.theme.NevexTextPrimary
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary
import com.nevex.xr.nativeapp.ui.theme.NevexThermalHot

@Composable
fun ThermalHudOverlay(
    thermalUiState: ThermalOverlayUiState,
    overlayOpacity: Float,
    modifier: Modifier = Modifier,
) {
    if (
        thermalUiState.runtimeState == ThermalRuntimeState.Off ||
        thermalUiState.runtimeState == ThermalRuntimeState.Placeholder
    ) {
        return
    }

    val accentColor = when (thermalUiState.runtimeState) {
        ThermalRuntimeState.Streaming -> NevexSuccess
        ThermalRuntimeState.Stale -> NevexThermalHot
        ThermalRuntimeState.Error -> NevexDanger
        ThermalRuntimeState.Connecting -> NevexAccent
        ThermalRuntimeState.Off,
        ThermalRuntimeState.Placeholder,
        -> NevexTextSecondary
    }
    val panelAlpha = (0.40f + (overlayOpacity * 0.34f)).coerceIn(0.54f, 0.82f)

    Surface(
        modifier = modifier.widthIn(max = 232.dp),
        color = NevexPanelStrong.copy(alpha = panelAlpha),
        border = BorderStroke(1.dp, accentColor.copy(alpha = 0.38f)),
        shape = MaterialTheme.shapes.small,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(accentColor)
                        .align(Alignment.CenterVertically),
                )
                Column(
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = "THERMAL",
                        style = MaterialTheme.typography.labelSmall,
                        color = NevexTextSecondary,
                    )
                    Text(
                        text = thermalUiState.statusText.uppercase(),
                        style = MaterialTheme.typography.titleSmall,
                        color = accentColor,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            Text(
                text = thermalUiState.detailText,
                style = MaterialTheme.typography.bodySmall,
                color = NevexTextSecondary,
            )

            ThermalHudLine(
                label = "CTR",
                value = thermalUiState.centerText,
            )
            ThermalHudLine(
                label = "RNG",
                value = thermalUiState.rangeText,
            )
            ThermalHudLine(
                label = "CAP",
                value = thermalUiState.captureFpsText,
            )
        }
    }
}

@Composable
private fun ThermalHudLine(
    label: String,
    value: String,
) {
    if (value == "--") {
        return
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = NevexTextSecondary,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            color = NevexTextPrimary,
            fontWeight = FontWeight.Medium,
        )
    }
}
