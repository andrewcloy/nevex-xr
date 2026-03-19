package com.nevex.xr.nativeapp.settings

import android.content.Context
import android.content.SharedPreferences
import com.nevex.xr.nativeapp.stream.JetsonEndpoint
import com.nevex.xr.nativeapp.ui.state.MissionProfile
import com.nevex.xr.nativeapp.ui.state.ThermalVisualMode

private const val OPERATOR_PREFS_NAME = "nevex_operator_preferences"
private const val OPERATOR_SCHEMA_VERSION = 1
private const val KEY_OPERATOR_SCHEMA_VERSION = "schema_version"
private const val KEY_LAST_HOST = "last_host"
private const val KEY_AUTO_CONNECT = "auto_connect_on_startup"
private const val KEY_MISSION_PROFILE = "mission_profile"
private const val KEY_THERMAL_VISUAL_MODE = "thermal_visual_mode"
private const val KEY_SOUND_VOLUME = "sound_volume"

data class OperatorPreferencesSnapshot(
    val lastHost: String = JetsonEndpoint().host,
    val autoConnectOnStartup: Boolean = true,
    val missionProfile: MissionProfile = MissionProfile.Inspection,
    val thermalVisualMode: ThermalVisualMode = ThermalVisualMode.WhiteHot,
    val soundVolume: Float = 0.60f,
    val hasPersistedValues: Boolean = false,
)

class OperatorPreferencesStore(
    context: Context,
) {
    private val prefs: SharedPreferences = context.getSharedPreferences(
        OPERATOR_PREFS_NAME,
        Context.MODE_PRIVATE,
    )

    fun load(): OperatorPreferencesSnapshot {
        val hasPersistedValues = prefs.contains(KEY_LAST_HOST) ||
            prefs.contains(KEY_AUTO_CONNECT) ||
            prefs.contains(KEY_MISSION_PROFILE) ||
            prefs.contains(KEY_THERMAL_VISUAL_MODE) ||
            prefs.contains(KEY_SOUND_VOLUME)
        if (!hasPersistedValues) {
            return OperatorPreferencesSnapshot()
        }

        return OperatorPreferencesSnapshot(
            lastHost = prefs.getString(KEY_LAST_HOST, JetsonEndpoint().host)
                ?.trim()
                ?.ifEmpty { JetsonEndpoint().host }
                ?: JetsonEndpoint().host,
            autoConnectOnStartup = prefs.getBoolean(KEY_AUTO_CONNECT, true),
            missionProfile = prefs.getString(KEY_MISSION_PROFILE, MissionProfile.Inspection.name)
                ?.let { storedName ->
                    MissionProfile.entries.firstOrNull { profile -> profile.name == storedName }
                }
                ?: MissionProfile.Inspection,
            thermalVisualMode = prefs.getString(KEY_THERMAL_VISUAL_MODE, ThermalVisualMode.WhiteHot.name)
                ?.let { storedName ->
                    ThermalVisualMode.entries.firstOrNull { mode -> mode.name == storedName }
                }
                ?: ThermalVisualMode.WhiteHot,
            soundVolume = prefs.getFloat(KEY_SOUND_VOLUME, 0.60f).coerceIn(0f, 1f),
            hasPersistedValues = true,
        )
    }

    fun save(
        snapshot: OperatorPreferencesSnapshot,
    ) {
        prefs.edit()
            .putInt(KEY_OPERATOR_SCHEMA_VERSION, OPERATOR_SCHEMA_VERSION)
            .putString(KEY_LAST_HOST, snapshot.lastHost.trim().ifEmpty { JetsonEndpoint().host })
            .putBoolean(KEY_AUTO_CONNECT, snapshot.autoConnectOnStartup)
            .putString(KEY_MISSION_PROFILE, snapshot.missionProfile.name)
            .putString(KEY_THERMAL_VISUAL_MODE, snapshot.thermalVisualMode.name)
            .putFloat(KEY_SOUND_VOLUME, snapshot.soundVolume.coerceIn(0f, 1f))
            .apply()
    }
}
