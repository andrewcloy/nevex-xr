package com.nevex.xr.nativeapp.thermal

import android.content.Context
import android.content.SharedPreferences
import com.nevex.xr.nativeapp.ui.state.ThermalOverlayTransform

private const val CALIBRATION_PREFS_NAME = "nevex_thermal_calibration"
private const val CALIBRATION_SCHEMA_VERSION = 1
private const val KEY_SCHEMA_VERSION = "schema_version"
private const val KEY_OFFSET_X = "offset_x_fraction"
private const val KEY_OFFSET_Y = "offset_y_fraction"
private const val KEY_SCALE = "scale"

data class ThermalCalibrationSnapshot(
    val transform: ThermalOverlayTransform = ThermalOverlayTransform(),
    val hasPersistedValues: Boolean = false,
)

class ThermalCalibrationStore(
    context: Context,
) {
    private val prefs: SharedPreferences = context.getSharedPreferences(
        CALIBRATION_PREFS_NAME,
        Context.MODE_PRIVATE,
    )

    fun load(): ThermalCalibrationSnapshot {
        val hasPersistedValues = prefs.contains(KEY_OFFSET_X) ||
            prefs.contains(KEY_OFFSET_Y) ||
            prefs.contains(KEY_SCALE)
        if (!hasPersistedValues) {
            return ThermalCalibrationSnapshot()
        }

        return ThermalCalibrationSnapshot(
            transform = ThermalOverlayTransform(
                offsetXFraction = prefs.getFloat(KEY_OFFSET_X, 0f),
                offsetYFraction = prefs.getFloat(KEY_OFFSET_Y, 0f),
                scale = prefs.getFloat(KEY_SCALE, 1f),
            ),
            hasPersistedValues = true,
        )
    }

    fun save(
        transform: ThermalOverlayTransform,
    ) {
        prefs.edit()
            .putInt(KEY_SCHEMA_VERSION, CALIBRATION_SCHEMA_VERSION)
            .putFloat(KEY_OFFSET_X, transform.offsetXFraction)
            .putFloat(KEY_OFFSET_Y, transform.offsetYFraction)
            .putFloat(KEY_SCALE, transform.scale)
            .apply()
    }

    fun clear() {
        prefs.edit()
            .remove(KEY_SCHEMA_VERSION)
            .remove(KEY_OFFSET_X)
            .remove(KEY_OFFSET_Y)
            .remove(KEY_SCALE)
            .apply()
    }
}
