package com.nevex.xr.nativeapp.ui.menu

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.ui.components.MenuButton
import com.nevex.xr.nativeapp.ui.state.MenuSelectionIndex
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.theme.NevexTextPrimary
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary

@Composable
fun StatusMenu(
    menuUiState: NevexMenuUiState,
    onReturnMain: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        StatusLine(
            label = "Connection",
            value = menuUiState.systemStatus.connectionStatus,
        )
        StatusLine(
            label = "Frame rate",
            value = menuUiState.systemStatus.frameRate,
        )
        StatusLine(
            label = "Latency",
            value = menuUiState.systemStatus.latency,
        )
        StatusLine(
            label = "Sensor status",
            value = menuUiState.systemStatus.sensorStatus,
        )
        MenuButton(
            title = "Return to Main Menu",
            subtitle = "Back to the live view controls.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Status.ReturnMain,
            onClick = onReturnMain,
        )
    }
}

@Composable
private fun StatusLine(
    label: String,
    value: String,
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = NevexTextSecondary,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyLarge,
            color = NevexTextPrimary,
        )
    }
}
