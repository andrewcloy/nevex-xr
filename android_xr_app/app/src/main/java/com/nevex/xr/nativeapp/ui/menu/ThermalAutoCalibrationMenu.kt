package com.nevex.xr.nativeapp.ui.menu

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nevex.xr.nativeapp.ui.components.MenuButton
import com.nevex.xr.nativeapp.ui.state.CalibrationMode
import com.nevex.xr.nativeapp.ui.state.MenuSelectionIndex
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.state.OverlayUiState
import com.nevex.xr.nativeapp.ui.theme.NevexAccent
import com.nevex.xr.nativeapp.ui.theme.NevexBorder
import com.nevex.xr.nativeapp.ui.theme.NevexPanel
import com.nevex.xr.nativeapp.ui.theme.NevexPanelStrong
import com.nevex.xr.nativeapp.ui.theme.NevexSuccess
import com.nevex.xr.nativeapp.ui.theme.NevexTextPrimary
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary
import java.util.Locale

@Composable
fun ThermalAutoCalibrationMenu(
    menuUiState: NevexMenuUiState,
    overlayUiState: OverlayUiState,
    onReturnAlignment: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val autoCalibrationState = menuUiState.thermalAlignment.autoCalibration
    val currentStep = autoCalibrationState.mode.toStepTitle()
    val instruction = autoCalibrationState.mode.toInstructionText()
    val workflowSummary = autoCalibrationState.workflowSummary()
    val setupTips = autoCalibrationState.mode.setupTips()
    val actionTitle = when (autoCalibrationState.mode) {
        CalibrationMode.Complete -> "Continue To Manual Refinement"
        CalibrationMode.LowConfidence,
        CalibrationMode.Failed,
        CalibrationMode.WaitingForVisibleSource,
        -> "Continue With Manual Alignment"

        else -> "Cancel Calibration"
    }
    val actionSubtitle = when (autoCalibrationState.mode) {
        CalibrationMode.Complete -> "Use the accepted coarse start, then trim X, Y, and scale manually."
        CalibrationMode.LowConfidence,
        CalibrationMode.Failed,
        -> "No new calibration was applied. Keep the current alignment and refine manually if needed."

        CalibrationMode.WaitingForVisibleSource -> "Visible preview is not active yet. Keep the current alignment and return to manual trim if needed."
        else -> "Stop the guided run and return to manual thermal alignment."
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = workflowSummary,
            style = MaterialTheme.typography.bodyMedium,
            color = NevexTextSecondary,
        )
        CalibrationSummaryCard(
            calibrationStatus = menuUiState.thermalAlignment.calibrationStatus,
            transform = overlayUiState.thermal.transform,
            title = "Current Calibration",
            supportingText = when (autoCalibrationState.mode) {
                CalibrationMode.Complete -> "The accepted automatic result is intended as a coarse start before manual refinement."
                CalibrationMode.LowConfidence,
                CalibrationMode.Failed,
                -> "No usable solve was applied. The current calibration source shown here remains active."

                else -> "This is the alignment that will remain active unless an accepted automatic result replaces it."
            },
        )
        AutoCalibrationStatusCard(
            stepTitle = currentStep,
            instruction = instruction,
            autoCalibrationState = autoCalibrationState,
        )
        if (setupTips.isNotEmpty()) {
            CalibrationSetupCard(
                tips = setupTips,
            )
        }
        MenuButton(
            title = actionTitle,
            subtitle = actionSubtitle,
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.AutoCalibration.PrimaryAction,
            onClick = onReturnAlignment,
        )
    }
}

@Composable
private fun AutoCalibrationStatusCard(
    stepTitle: String,
    instruction: String,
    autoCalibrationState: com.nevex.xr.nativeapp.ui.state.ThermalAutoCalibrationUiState,
) {
    val progress = autoCalibrationState.progress
    val mode = autoCalibrationState.mode
    val accentColor = when (mode) {
        CalibrationMode.Complete -> NevexSuccess
        CalibrationMode.LowConfidence,
        CalibrationMode.Failed,
        -> NevexBorder

        else -> NevexAccent
    }
    Surface(
        color = NevexPanelStrong.copy(alpha = 0.82f),
        border = BorderStroke(1.dp, accentColor.copy(alpha = 0.42f)),
        shape = MaterialTheme.shapes.small,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = stepTitle,
                style = MaterialTheme.typography.titleMedium,
                color = accentColor,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = instruction,
                style = MaterialTheme.typography.bodyMedium,
                color = NevexTextPrimary,
            )
            autoCalibrationState.guidanceText?.takeIf { it.isNotBlank() }?.let { guidanceText ->
                Text(
                    text = guidanceText,
                    style = MaterialTheme.typography.bodySmall,
                    color = NevexTextSecondary,
                )
            }
            Surface(
                color = NevexPanel.copy(alpha = 0.82f),
                border = BorderStroke(1.dp, NevexBorder),
                shape = MaterialTheme.shapes.extraSmall,
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = String.format(Locale.US, "Progress %.0f%%", progress * 100f),
                        style = MaterialTheme.typography.labelLarge,
                        color = NevexTextPrimary,
                    )
                    LinearProgressIndicator(
                        progress = { progress.coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth(),
                        color = accentColor,
                        trackColor = NevexBorder.copy(alpha = 0.34f),
                    )
                    Text(
                        text = autoCalibrationState.completionSummary,
                        style = MaterialTheme.typography.bodySmall,
                        color = NevexTextSecondary,
                    )
                    if (autoCalibrationState.hasOverlapReadiness()) {
                        OverlapReadinessSection(
                            autoCalibrationState = autoCalibrationState,
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = if (autoCalibrationState.fallbackActive) {
                                "Source  FALLBACK"
                            } else if (autoCalibrationState.usingBackend) {
                                "Source  BACKEND"
                            } else {
                                "Source  STANDBY"
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = NevexTextSecondary,
                        )
                        autoCalibrationState.backendStateLabel?.takeIf { it.isNotBlank() }?.let { backendStateLabel ->
                            Text(
                                text = backendStateLabel,
                                style = MaterialTheme.typography.labelSmall,
                                color = NevexTextSecondary,
                            )
                        }
                    }
                    autoCalibrationState.sampleQualitySummary?.takeIf { it.isNotBlank() }?.let { sampleQualitySummary ->
                        CompactStatusLine(
                            label = "Signal",
                            value = sampleQualitySummary,
                        )
                    }
                    if (
                        autoCalibrationState.matchedSampleCount != null ||
                        autoCalibrationState.rejectedSampleCount != null
                    ) {
                        Text(
                            text = buildSampleCountsText(
                                matchedSampleCount = autoCalibrationState.matchedSampleCount,
                                rejectedSampleCount = autoCalibrationState.rejectedSampleCount,
                            ),
                            style = MaterialTheme.typography.labelSmall,
                            color = NevexTextSecondary,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun OverlapReadinessSection(
    autoCalibrationState: com.nevex.xr.nativeapp.ui.state.ThermalAutoCalibrationUiState,
) {
    Surface(
        color = NevexPanelStrong.copy(alpha = 0.66f),
        border = BorderStroke(1.dp, NevexBorder.copy(alpha = 0.75f)),
        shape = MaterialTheme.shapes.extraSmall,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = "OVERLAP READINESS",
                style = MaterialTheme.typography.labelSmall,
                color = NevexTextSecondary,
            )
            autoCalibrationState.overlapReadinessState?.takeIf { it.isNotBlank() }?.let { readinessState ->
                CompactStatusLine(
                    label = "State",
                    value = readinessState.toOperatorLabel(),
                )
            }
            autoCalibrationState.overlapPhysicallyViable?.let { physicallyViable ->
                CompactStatusLine(
                    label = "Physically viable",
                    value = if (physicallyViable) "Yes" else "No",
                )
            }
            autoCalibrationState.overlapRecommendedAction?.takeIf { it.isNotBlank() }?.let { recommendedAction ->
                CompactStatusLine(
                    label = "Action",
                    value = recommendedAction,
                )
            }
            autoCalibrationState.overlapBlockingFactors
                .takeIf { it.isNotEmpty() }
                ?.let { blockingFactors ->
                    CompactStatusLine(
                        label = "Blockers",
                        value = blockingFactors
                            .take(2)
                            .joinToString(", ") { blockingFactor ->
                                blockingFactor.toOperatorLabel()
                            },
                    )
                }
            autoCalibrationState.readinessText?.takeIf { it.isNotBlank() }?.let { readinessText ->
                CompactStatusLine(
                    label = "Summary",
                    value = readinessText,
                )
            }
        }
    }
}

@Composable
private fun CalibrationSetupCard(
    tips: List<String>,
) {
    Surface(
        color = NevexPanel.copy(alpha = 0.78f),
        border = BorderStroke(1.dp, NevexBorder),
        shape = MaterialTheme.shapes.extraSmall,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = "PASS SETUP",
                style = MaterialTheme.typography.labelSmall,
                color = NevexTextSecondary,
            )
            tips.forEach { tip ->
                Text(
                    text = tip,
                    style = MaterialTheme.typography.bodySmall,
                    color = NevexTextPrimary,
                )
            }
        }
    }
}

@Composable
private fun CompactStatusLine(
    label: String,
    value: String,
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = label.uppercase(Locale.US),
            style = MaterialTheme.typography.labelSmall,
            color = NevexTextSecondary,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            color = NevexTextSecondary,
        )
    }
}

private fun CalibrationMode.toStepTitle(): String {
    return when (this) {
        CalibrationMode.Idle -> "AUTO CALIBRATION READY"
        CalibrationMode.WaitingForVisibleSource -> "WAITING FOR VISIBLE SOURCE"
        CalibrationMode.WaitingForMotion -> "WAITING FOR SHARED MOTION"
        CalibrationMode.Capturing -> "COLLECTING CALIBRATION SAMPLES"
        CalibrationMode.Processing -> "SOLVING TRANSFORM"
        CalibrationMode.Complete -> "COARSE START APPLIED"
        CalibrationMode.LowConfidence -> "NO USABLE SOLVE YET"
        CalibrationMode.Failed -> "CALIBRATION INCOMPLETE"
    }
}

private fun CalibrationMode.toInstructionText(): String {
    return when (this) {
        CalibrationMode.Idle -> "Enter the guided workflow when you are ready to present a moving warm target."
        CalibrationMode.WaitingForVisibleSource -> "Visible preview is not active yet. Keep the normal 8090 live session connected so the sender-owned preview publisher stays available."
        CalibrationMode.WaitingForMotion -> "Wave a warm hand through both fields of view. This is a normal hold state while shared overlap and motion are still weak."
        CalibrationMode.Capturing -> "Collecting matched visible and thermal samples. Keep the warm target moving slowly through the shared center region."
        CalibrationMode.Processing -> "Solving transform and validating the candidate before any apply step."
        CalibrationMode.Complete -> "A usable automatic coarse start was applied. Continue into manual alignment for final trim."
        CalibrationMode.LowConfidence -> "No usable automatic solve was produced. The current calibration remains active."
        CalibrationMode.Failed -> "No new calibration was applied. Continue with manual alignment or retry when overlap improves."
    }
}

private fun CalibrationMode.setupTips(): List<String> {
    return when (this) {
        CalibrationMode.WaitingForMotion,
        CalibrationMode.Capturing,
        CalibrationMode.LowConfidence,
        CalibrationMode.Failed,
        -> listOf(
            "Warm hand through both fields of view",
            "Slow, broad motion",
            "Stay in the shared center region",
        )

        else -> emptyList()
    }
}

private fun com.nevex.xr.nativeapp.ui.state.ThermalAutoCalibrationUiState.workflowSummary(): String {
    return when {
        overlapPhysicallyViable == false -> {
            "Physical overlap is not ready yet. No new calibration will be attempted or applied until the shared central pass becomes viable."
        }

        mode == CalibrationMode.Complete -> {
            "A validated coarse start has been applied. Manual alignment remains the final refinement path."
        }

        mode == CalibrationMode.WaitingForVisibleSource -> {
            "Visible preview is not active yet. This is expected until the normal live connection is running."
        }

        mode == CalibrationMode.WaitingForMotion ||
            mode == CalibrationMode.LowConfidence ||
            mode == CalibrationMode.Failed ->
            "No usable automatic solve is a normal outcome while physical overlap and shared motion are still provisional."

        fallbackActive -> {
            "Calibration backend is unavailable, so the local guided shell remains available without changing the normal live-view path."
        }

        usingBackend -> {
            "Automatic calibration monitors the live backend and only applies validated results."
        }

        else -> {
            "Automatic calibration stays available as a coarse initializer. Manual alignment remains the final refinement path."
        }
    }
}

private fun com.nevex.xr.nativeapp.ui.state.ThermalAutoCalibrationUiState.hasOverlapReadiness(): Boolean {
    return overlapReadinessState?.isNotBlank() == true ||
        overlapPhysicallyViable != null ||
        overlapRecommendedAction?.isNotBlank() == true ||
        overlapBlockingFactors.isNotEmpty() ||
        readinessText?.isNotBlank() == true
}

private fun String.toOperatorLabel(): String {
    val normalized = trim()
        .replace('_', ' ')
        .replace(Regex("([a-z])([A-Z])"), "$1 $2")
        .trim()
    if (normalized.isBlank()) {
        return this
    }
    return normalized.split(Regex("\\s+")).joinToString(" ") { word ->
        word.lowercase(Locale.US).replaceFirstChar { character ->
            if (character.isLowerCase()) {
                character.titlecase(Locale.US)
            } else {
                character.toString()
            }
        }
    }
}

private fun buildSampleCountsText(
    matchedSampleCount: Int?,
    rejectedSampleCount: Int?,
): String {
    val matchedText = matchedSampleCount?.toString() ?: "--"
    val rejectedText = rejectedSampleCount?.toString() ?: "--"
    return "Matched samples: $matchedText   Rejected: $rejectedText"
}
