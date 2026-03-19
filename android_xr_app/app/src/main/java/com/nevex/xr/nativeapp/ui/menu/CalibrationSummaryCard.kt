package com.nevex.xr.nativeapp.ui.menu

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.ui.state.ThermalCalibrationStatus
import com.nevex.xr.nativeapp.ui.state.ThermalOverlayTransform
import com.nevex.xr.nativeapp.ui.theme.NevexAccent
import com.nevex.xr.nativeapp.ui.theme.NevexBorder
import com.nevex.xr.nativeapp.ui.theme.NevexPanelStrong
import com.nevex.xr.nativeapp.ui.theme.NevexSuccess
import com.nevex.xr.nativeapp.ui.theme.NevexTextPrimary
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary
import java.util.Locale

@Composable
fun CalibrationSummaryCard(
    calibrationStatus: ThermalCalibrationStatus,
    transform: ThermalOverlayTransform,
    modifier: Modifier = Modifier,
    title: String = "Active Calibration",
    supportingText: String? = null,
) {
    val accentColor = calibrationStatus.accentColor()
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = NevexPanelStrong.copy(alpha = 0.78f),
        border = BorderStroke(1.dp, accentColor.copy(alpha = 0.42f)),
        shape = MaterialTheme.shapes.small,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.labelSmall,
                    color = NevexTextSecondary,
                )
                Text(
                    text = "SOURCE ${calibrationStatus.label.uppercase(Locale.US)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (calibrationStatus == ThermalCalibrationStatus.Default) {
                        NevexTextSecondary
                    } else {
                        accentColor
                    },
                )
            }
            Text(
                text = calibrationStatus.detailText,
                style = MaterialTheme.typography.bodySmall,
                color = NevexTextSecondary,
            )
            supportingText?.takeIf { it.isNotBlank() }?.let { detailText ->
                Text(
                    text = detailText,
                    style = MaterialTheme.typography.bodySmall,
                    color = NevexTextSecondary,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CalibrationValueChip(
                    label = "X",
                    value = formatOffsetValue(transform.offsetXFraction),
                    detail = formatOffsetPercent(transform.offsetXFraction, axisLabel = "width"),
                    modifier = Modifier.weight(1f),
                )
                CalibrationValueChip(
                    label = "Y",
                    value = formatOffsetValue(transform.offsetYFraction),
                    detail = formatOffsetPercent(transform.offsetYFraction, axisLabel = "height"),
                    modifier = Modifier.weight(1f),
                )
                CalibrationValueChip(
                    label = "SCL",
                    value = formatScaleValue(transform.scale),
                    detail = formatScalePercent(transform.scale),
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun CalibrationValueChip(
    label: String,
    value: String,
    detail: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        color = NevexPanelStrong.copy(alpha = 0.68f),
        border = BorderStroke(1.dp, NevexBorder),
        shape = MaterialTheme.shapes.extraSmall,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = NevexTextSecondary,
            )
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                color = NevexTextPrimary,
            )
            Text(
                text = detail,
                style = MaterialTheme.typography.labelSmall,
                color = NevexTextSecondary,
            )
        }
    }
}

private fun ThermalCalibrationStatus.accentColor(): Color {
    return when (this) {
        ThermalCalibrationStatus.Default -> NevexBorder
        ThermalCalibrationStatus.Restored -> NevexAccent
        ThermalCalibrationStatus.Manual -> NevexAccent
        ThermalCalibrationStatus.Auto -> NevexSuccess
    }
}

internal fun formatOffsetValue(
    value: Float,
): String {
    return String.format(Locale.US, "%+.3f", value)
}

internal fun formatOffsetPercent(
    value: Float,
    axisLabel: String,
): String {
    return String.format(Locale.US, "%+.1f%% %s", value * 100f, axisLabel)
}

internal fun formatScaleValue(
    value: Float,
): String {
    return String.format(Locale.US, "%.3fx", value)
}

internal fun formatScalePercent(
    value: Float,
): String {
    return String.format(Locale.US, "%.1f%% nominal", value * 100f)
}
