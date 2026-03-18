package com.nevex.xr.nativeapp.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp

val NevexBackground = Color(0xFF050910)
val NevexBackgroundDeep = Color(0xFF09111F)
val NevexPanel = Color(0xD10A1222)
val NevexPanelStrong = Color(0xF2142138)
val NevexAccent = Color(0xFF6AD1FF)
val NevexAccentStrong = Color(0xFF7FB8FF)
val NevexTextPrimary = Color(0xFFEDF4FF)
val NevexTextSecondary = Color(0xFFC9D7EA)
val NevexBorder = Color(0x2990B7FF)
val NevexDanger = Color(0xFFFF7A7A)
val NevexSuccess = Color(0xFF7FFFD4)
val NevexOverlayLine = Color(0xA3B6C7D9)
val NevexOverlayLineMuted = Color(0x4A93A8BE)
val NevexThermalWarm = Color(0x7AD07E42)
val NevexThermalHot = Color(0x9AF4B36D)

private val NevexColorScheme = darkColorScheme(
    primary = NevexAccent,
    onPrimary = NevexBackground,
    primaryContainer = NevexPanelStrong,
    onPrimaryContainer = NevexTextPrimary,
    secondary = NevexAccentStrong,
    onSecondary = NevexBackground,
    tertiary = NevexSuccess,
    background = NevexBackground,
    onBackground = NevexTextPrimary,
    surface = NevexPanel,
    onSurface = NevexTextPrimary,
    surfaceVariant = NevexPanelStrong,
    onSurfaceVariant = NevexTextSecondary,
    error = NevexDanger,
    onError = NevexBackground,
)

private val NevexShapes = Shapes(
    extraSmall = RoundedCornerShape(12.dp),
    small = RoundedCornerShape(18.dp),
    medium = RoundedCornerShape(24.dp),
    large = RoundedCornerShape(32.dp),
    extraLarge = RoundedCornerShape(40.dp),
)

@Composable
fun NevexTheme(
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = NevexColorScheme,
        shapes = NevexShapes,
        content = content,
    )
}
