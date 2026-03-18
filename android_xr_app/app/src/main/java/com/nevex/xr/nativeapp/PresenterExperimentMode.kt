package com.nevex.xr.nativeapp

enum class PresenterExperimentMode(
    val wireValue: String,
    val shortLabel: String,
    val diagnosticsLabel: String,
) {
    NormalBitmap(
        wireValue = "normal",
        shortLabel = "Normal",
        diagnosticsLabel = "Normal bitmap draw",
    ),
    ClearOnly(
        wireValue = "clear",
        shortLabel = "Clear",
        diagnosticsLabel = "Clear-only draw",
    ),
    TestPattern(
        wireValue = "pattern",
        shortLabel = "Pattern",
        diagnosticsLabel = "Fixed test pattern",
    ),
    PostOnly(
        wireValue = "post-only",
        shortLabel = "Post",
        diagnosticsLabel = "Lock/post only",
    ),
    ;

    fun next(): PresenterExperimentMode {
        val values = entries
        return values[(ordinal + 1) % values.size]
    }

    companion object {
        fun fromWireValue(rawValue: String?): PresenterExperimentMode? {
            val normalized = rawValue
                ?.trim()
                ?.lowercase()
                ?.takeIf { value -> value.isNotEmpty() }
                ?: return null
            return entries.firstOrNull { mode ->
                mode.wireValue == normalized || mode.shortLabel.lowercase() == normalized
            }
        }
    }
}
