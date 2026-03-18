package com.nevex.xr.nativeapp.ui.menu

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.ui.components.MenuButton
import com.nevex.xr.nativeapp.ui.state.MenuSelectionIndex
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.theme.NevexTextPrimary
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary

@Composable
fun MainMenu(
    menuUiState: NevexMenuUiState,
    onSelectIndex: (Int) -> Unit,
    onStartResume: () -> Unit,
    onToggleMode: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenSystemStatus: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 4.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "Live view controls",
            style = MaterialTheme.typography.bodyMedium,
            color = NevexTextSecondary,
        )
        MenuButton(
            title = "Start / Resume View",
            subtitle = "Hide the menu and keep the stereo feed unobstructed.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Main.Resume,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Main.Resume)
                onStartResume()
            },
        )
        MenuButton(
            title = "Toggle Mode",
            subtitle = "Current placeholder: ${menuUiState.placeholderViewMode.label}",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Main.ToggleMode,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Main.ToggleMode)
                onToggleMode()
            },
        )
        MenuButton(
            title = "Settings",
            subtitle = "UI controls, overlay opacity, and future audio volume hook.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Main.Settings,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Main.Settings)
                onOpenSettings()
            },
        )
        MenuButton(
            title = "System Status",
            subtitle = "Connection, frame rate, latency, and sensor placeholders.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Main.SystemStatus,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Main.SystemStatus)
                onOpenSystemStatus()
            },
        )
        Text(
            text = "Use M to open or close, arrows to move, Enter to select, and Backspace to go back.",
            style = MaterialTheme.typography.bodySmall,
            color = NevexTextSecondary,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(top = 4.dp),
        )
        Text(
            text = "Menus stay side-biased so the center of view remains mostly clear.",
            style = MaterialTheme.typography.bodySmall,
            color = NevexTextPrimary.copy(alpha = 0.82f),
        )
    }
}
