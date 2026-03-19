package com.nevex.xr.nativeapp.settings

import android.content.Context
import android.content.SharedPreferences
import com.nevex.xr.nativeapp.ui.state.ThermalPreviewOpacityPreset

private const val VIEWING_PREFS_NAME = "nevex_viewing_preferences"
private const val VIEWING_SCHEMA_VERSION = 1
private const val KEY_SCHEMA_VERSION = "schema_version"
private const val KEY_VIEWING_MODE = "viewing_mode"
private const val KEY_THERMAL_OPACITY = "thermal_opacity"

enum class PersistedViewingMode(
    val wireValue: String,
) {
    Visible("visible"),
    ThermalOverlay("thermal_overlay"),
    ThermalOnly("thermal_only");

    companion object {
        fun fromWireValue(value: String?): PersistedViewingMode {
            return entries.firstOrNull { mode -> mode.wireValue == value } ?: Visible
        }
    }
}

data class ViewingPreferencesSnapshot(
    val viewingMode: PersistedViewingMode = PersistedViewingMode.Visible,
    val thermalOpacityPreset: ThermalPreviewOpacityPreset = ThermalPreviewOpacityPreset.P25,
    val hasPersistedValues: Boolean = false,
)

class ViewingPreferencesStore(
    context: Context,
) {
    private val prefs: SharedPreferences = context.getSharedPreferences(
        VIEWING_PREFS_NAME,
        Context.MODE_PRIVATE,
    )

    fun load(): ViewingPreferencesSnapshot {
        val hasPersistedValues = prefs.contains(KEY_VIEWING_MODE) || prefs.contains(KEY_THERMAL_OPACITY)
        if (!hasPersistedValues) {
            return ViewingPreferencesSnapshot()
        }

        return ViewingPreferencesSnapshot(
            viewingMode = PersistedViewingMode.fromWireValue(
                prefs.getString(KEY_VIEWING_MODE, PersistedViewingMode.Visible.wireValue),
            ),
            thermalOpacityPreset = prefs.getString(KEY_THERMAL_OPACITY, ThermalPreviewOpacityPreset.P25.name)
                ?.let { storedName ->
                    ThermalPreviewOpacityPreset.entries.firstOrNull { preset -> preset.name == storedName }
                }
                ?: ThermalPreviewOpacityPreset.P25,
            hasPersistedValues = true,
        )
    }

    fun save(
        viewingMode: PersistedViewingMode,
        thermalOpacityPreset: ThermalPreviewOpacityPreset,
    ) {
        prefs.edit()
            .putInt(KEY_SCHEMA_VERSION, VIEWING_SCHEMA_VERSION)
            .putString(KEY_VIEWING_MODE, viewingMode.wireValue)
            .putString(KEY_THERMAL_OPACITY, thermalOpacityPreset.name)
            .apply()
    }
}
