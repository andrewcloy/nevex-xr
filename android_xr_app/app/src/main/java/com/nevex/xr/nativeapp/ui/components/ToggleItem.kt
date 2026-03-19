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
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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

@Composable
fun ToggleItem(
    title: String,
    subtitle: String,
    checked: Boolean,
    selected: Boolean,
    onToggle: (Boolean) -> Unit,
    onSelected: () -> Unit,
    iconResId: Int? = null,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clickable {
                onSelected()
                onToggle(!checked)
            },
        color = if (selected) {
            NevexPanelStrong.copy(alpha = 0.92f)
        } else {
            NevexPanel.copy(alpha = 0.82f)
        },
        border = BorderStroke(1.dp, if (selected) NevexAccent else NevexBorder),
        shape = MaterialTheme.shapes.medium,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                modifier = Modifier.weight(1f),
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
            }
            Switch(
                checked = checked,
                onCheckedChange = { value ->
                    onSelected()
                    onToggle(value)
                },
                colors = SwitchDefaults.colors(
                    checkedThumbColor = NevexAccent,
                    checkedTrackColor = NevexAccent.copy(alpha = 0.38f),
                ),
            )
        }
    }
}
