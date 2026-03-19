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
import com.nevex.xr.nativeapp.ui.state.MenuSelectionIndex
import com.nevex.xr.nativeapp.ui.state.MissionProfile
import com.nevex.xr.nativeapp.ui.state.NevexMenuUiState
import com.nevex.xr.nativeapp.ui.theme.NevexTextSecondary

@Composable
fun MissionProfilesMenu(
    menuUiState: NevexMenuUiState,
    onSelectIndex: (Int) -> Unit,
    onSetMissionProfile: (MissionProfile) -> Unit,
    onReturnMain: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val activeProfile = menuUiState.missionProfile
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "Profiles adjust current shell behavior honestly using the controls that already exist today.",
            style = MaterialTheme.typography.bodyMedium,
            color = NevexTextSecondary,
        )
        ProfileButton(
            title = MissionProfile.Inspection.label,
            subtitle = profileSubtitle(MissionProfile.Inspection, activeProfile),
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.MissionProfiles.Inspection,
            iconResId = R.drawable.nevex_glyph_focus,
            onClick = {
                onSelectIndex(MenuSelectionIndex.MissionProfiles.Inspection)
                onSetMissionProfile(MissionProfile.Inspection)
            },
        )
        ProfileButton(
            title = MissionProfile.Rescue.label,
            subtitle = profileSubtitle(MissionProfile.Rescue, activeProfile),
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.MissionProfiles.Rescue,
            iconResId = R.drawable.nevex_glyph_hotspot,
            onClick = {
                onSelectIndex(MenuSelectionIndex.MissionProfiles.Rescue)
                onSetMissionProfile(MissionProfile.Rescue)
            },
        )
        ProfileButton(
            title = MissionProfile.Tactical.label,
            subtitle = profileSubtitle(MissionProfile.Tactical, activeProfile),
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.MissionProfiles.Tactical,
            iconResId = R.drawable.nevex_glyph_target_lock,
            onClick = {
                onSelectIndex(MenuSelectionIndex.MissionProfiles.Tactical)
                onSetMissionProfile(MissionProfile.Tactical)
            },
        )
        ProfileButton(
            title = MissionProfile.Marine.label,
            subtitle = profileSubtitle(MissionProfile.Marine, activeProfile),
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.MissionProfiles.Marine,
            iconResId = R.drawable.nevex_glyph_compass,
            onClick = {
                onSelectIndex(MenuSelectionIndex.MissionProfiles.Marine)
                onSetMissionProfile(MissionProfile.Marine)
            },
        )
        MenuButton(
            title = "Return to Main Menu",
            subtitle = "Back to viewing mode and operator controls.",
            selected = menuUiState.selectedItemIndex == MenuSelectionIndex.MissionProfiles.ReturnMain,
            iconResId = R.drawable.nevex_glyph_back,
            onClick = onReturnMain,
        )
    }
}

@Composable
private fun ProfileButton(
    title: String,
    subtitle: String,
    selected: Boolean,
    iconResId: Int,
    onClick: () -> Unit,
) {
    MenuButton(
        title = title,
        subtitle = subtitle,
        selected = selected,
        iconResId = iconResId,
        onClick = onClick,
    )
}

private fun profileSubtitle(
    profile: MissionProfile,
    activeProfile: MissionProfile,
): String {
    return if (profile == activeProfile) {
        "${profile.liveIntentText}. Active mission shell."
    } else {
        profile.detailText
    }
}
