package com.nevex.xr.nativeapp.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.ui.theme.NevexAccent
import com.nevex.xr.nativeapp.ui.theme.NevexBorder
import com.nevex.xr.nativeapp.ui.theme.NevexPanel
import com.nevex.xr.nativeapp.ui.theme.NevexPanelStrong
import com.nevex.xr.nativeapp.ui.theme.NevexTextPrimary
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary
import kotlin.math.roundToInt

@Composable
fun SliderItem(
    title: String,
    subtitle: String,
    value: Float,
    selected: Boolean,
    onValueChange: (Float) -> Unit,
    onSelected: () -> Unit,
    iconResId: Int? = null,
    valueRange: ClosedFloatingPointRange<Float> = 0f..1f,
    steps: Int = 0,
    valueText: String = "${(value * 100f).roundToInt()}%",
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onSelected),
        color = if (selected) {
            NevexPanelStrong.copy(alpha = 0.92f)
        } else {
            NevexPanel.copy(alpha = 0.82f)
        },
        border = BorderStroke(1.dp, if (selected) NevexAccent else NevexBorder),
        shape = MaterialTheme.shapes.medium,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (iconResId != null) {
                    Image(
                        painter = painterResource(id = iconResId),
                        contentDescription = null,
                        modifier = Modifier.size(24.dp),
                    )
                }
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleSmall,
                        color = NevexTextPrimary,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                    )
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = NevexTextSecondary,
                    )
                }
                Text(
                    text = valueText,
                    style = MaterialTheme.typography.labelLarge,
                    color = NevexTextPrimary,
                )
            }
            Slider(
                value = value,
                valueRange = valueRange,
                steps = steps,
                onValueChange = { nextValue ->
                    onSelected()
                    onValueChange(nextValue)
                },
                colors = SliderDefaults.colors(
                    thumbColor = NevexAccent,
                    activeTrackColor = NevexAccent,
                ),
            )
        }
    }
}
