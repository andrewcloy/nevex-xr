package com.nevex.xr.nativeapp.ui.menu

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.R
import com.nevex.xr.nativeapp.ui.components.MenuButton
import com.nevex.xr.nativeapp.ui.state.CaptureShellUiState
import com.nevex.xr.nativeapp.ui.state.MenuSelectionIndex
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary

@Composable
fun CaptureMenu(
    menuUiState: NevexMenuUiState,
    captureUiState: CaptureShellUiState,
    onSelectIndex: (Int) -> Unit,
    onCaptureSnapshot: () -> Unit,
    onToggleRecording: () -> Unit,
    onReturnMain: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "Capture stays layered above the working live view so evidence collection does not interrupt binocular presentation.",
            style = MaterialTheme.typography.bodyMedium,
            color = NevexTextSecondary,
        )
        MenuButton(
            title = "Capture Snapshot",
            subtitle = if (captureUiState.lastSnapshotSavedAtMs != null) {
                "Save the current stereo frame. Last saved ${captureUiState.lastSnapshotLabel}."
            } else {
                "Save the current stereo frame locally without interrupting live view."
            },
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Capture.Snapshot,
            iconResId = R.drawable.nevex_glyph_snapshot,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Capture.Snapshot)
                onCaptureSnapshot()
            },
        )
        MenuButton(
            title = if (captureUiState.recordingActive) "Stop Recording" else "Start Recording",
            subtitle = if (captureUiState.recordingActive) {
                "REC is active. Stop the current capture shell session and return to clean live view."
            } else {
                "Begin lightweight recording state without interrupting the stereo feed."
            },
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Capture.Recording,
            iconResId = R.drawable.nevex_glyph_record,
            onClick = {
                onSelectIndex(MenuSelectionIndex.Capture.Recording)
                onToggleRecording()
            },
        )
        MenuButton(
            title = "Return to Main Menu",
            subtitle = "Back to viewing modes, profiles, and settings.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.Capture.ReturnMain,
            iconResId = R.drawable.nevex_glyph_back,
            onClick = onReturnMain,
        )
    }
}
