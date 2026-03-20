package com.nevex.xr.nativeapp.ui.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.SystemClock
import android.util.Log
import com.nevex.xr.nativeapp.R
import java.util.EnumMap
import java.util.concurrent.ConcurrentHashMap

private const val SOUND_LOG_TAG = "NevexXrSound"

interface SoundManager {
    fun setVolume(volume: Float)

    fun playFocusShift()

    fun playClick()

    fun playBack()

    fun playToggle(enabled: Boolean)

    fun playAlert()

    fun playActivate()

    fun playReady()

    fun playMenuOpen()

    fun playMenuClose()

    fun playProfileChange()

    fun playSnapshotSaved()

    fun playRecordingStarted()

    fun playRecordingStopped()

    fun playReconnect()

    fun playConnectionLost()

    fun playCalibrationComplete()

    fun playCalibrationFail()

    fun release()
}

object NoOpSoundManager : SoundManager {
    override fun setVolume(volume: Float) = Unit

    override fun playFocusShift() = Unit

    override fun playClick() = Unit

    override fun playBack() = Unit

    override fun playToggle(enabled: Boolean) = Unit

    override fun playAlert() = Unit

    override fun playActivate() = Unit

    override fun playReady() = Unit

    override fun playMenuOpen() = Unit

    override fun playMenuClose() = Unit

    override fun playProfileChange() = Unit

    override fun playSnapshotSaved() = Unit

    override fun playRecordingStarted() = Unit

    override fun playRecordingStopped() = Unit

    override fun playReconnect() = Unit

    override fun playConnectionLost() = Unit

    override fun playCalibrationComplete() = Unit

    override fun playCalibrationFail() = Unit

    override fun release() = Unit
}

fun createSoundManager(
    context: Context,
    initialVolume: Float,
): SoundManager {
    return AndroidSoundManager(
        context = context.applicationContext,
        initialVolume = initialVolume,
    )
}

private enum class UiSoundCue(
    val fallbackRawResId: Int,
    val gainScale: Float,
    val minIntervalMs: Long,
) {
    FocusShift(
        fallbackRawResId = R.raw.nevex_audio_ui_focus_shift,
        gainScale = 0.44f,
        minIntervalMs = 70L,
    ),
    Click(
        fallbackRawResId = R.raw.nevex_audio_ui_click_soft,
        gainScale = 0.52f,
        minIntervalMs = 45L,
    ),
    Back(
        fallbackRawResId = R.raw.nevex_audio_ui_back,
        gainScale = 0.66f,
        minIntervalMs = 80L,
    ),
    ToggleOn(
        fallbackRawResId = R.raw.nevex_audio_ui_toggle_on,
        gainScale = 0.52f,
        minIntervalMs = 100L,
    ),
    ToggleOff(
        fallbackRawResId = R.raw.nevex_audio_ui_toggle_off,
        gainScale = 0.48f,
        minIntervalMs = 100L,
    ),
    Alert(
        fallbackRawResId = R.raw.nevex_audio_warning_alert,
        gainScale = 0.88f,
        minIntervalMs = 250L,
    ),
    Activate(
        fallbackRawResId = R.raw.nevex_audio_ui_confirm,
        gainScale = 0.76f,
        minIntervalMs = 120L,
    ),
    Ready(
        fallbackRawResId = R.raw.nevex_audio_readiness_ready,
        gainScale = 0.72f,
        minIntervalMs = 1_500L,
    ),
    MenuOpen(
        fallbackRawResId = R.raw.nevex_audio_playback_open,
        gainScale = 0.60f,
        minIntervalMs = 120L,
    ),
    MenuClose(
        fallbackRawResId = R.raw.nevex_audio_ui_dismiss,
        gainScale = 0.56f,
        minIntervalMs = 120L,
    ),
    ProfileChange(
        fallbackRawResId = R.raw.nevex_audio_playback_select,
        gainScale = 0.64f,
        minIntervalMs = 180L,
    ),
    SnapshotSaved(
        fallbackRawResId = R.raw.nevex_audio_capture_photo,
        gainScale = 0.68f,
        minIntervalMs = 160L,
    ),
    RecordingStarted(
        fallbackRawResId = R.raw.nevex_audio_record_start,
        gainScale = 0.70f,
        minIntervalMs = 220L,
    ),
    RecordingStopped(
        fallbackRawResId = R.raw.nevex_audio_record_stop,
        gainScale = 0.66f,
        minIntervalMs = 220L,
    ),
    Reconnect(
        fallbackRawResId = R.raw.nevex_audio_reconnect,
        gainScale = 0.58f,
        minIntervalMs = 1_200L,
    ),
    ConnectionLost(
        fallbackRawResId = R.raw.nevex_audio_disconnect,
        gainScale = 0.62f,
        minIntervalMs = 1_200L,
    ),
    CalibrationComplete(
        fallbackRawResId = R.raw.nevex_audio_calibration_complete,
        gainScale = 0.70f,
        minIntervalMs = 1_200L,
    ),
    CalibrationFail(
        fallbackRawResId = R.raw.nevex_audio_calibration_fail,
        gainScale = 0.74f,
        minIntervalMs = 1_500L,
    ),
}

private class AndroidSoundManager(
    private val context: Context,
    initialVolume: Float,
) : SoundManager {
    private val loadedSampleIds = ConcurrentHashMap.newKeySet<Int>()
    private val sampleIds = mutableMapOf<UiSoundCue, Int>()
    private val lastPlayAtElapsedMs = EnumMap<UiSoundCue, Long>(UiSoundCue::class.java)
    private val soundPool = SoundPool.Builder()
        .setMaxStreams(4)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(),
        )
        .build()

    @Volatile
    private var masterVolume = initialVolume.coerceIn(0f, 1f)

    @Volatile
    private var released = false

    init {
        Log.i(SOUND_LOG_TAG, "Sound manager initialized masterVolume=$masterVolume")
        soundPool.setOnLoadCompleteListener { _, sampleId, status ->
            if (status == 0) {
                loadedSampleIds.add(sampleId)
                Log.i(SOUND_LOG_TAG, "UI cue sample ready: sampleId=$sampleId")
            } else {
                Log.w(SOUND_LOG_TAG, "SoundPool failed to load sampleId=$sampleId status=$status")
            }
        }
        UiSoundCue.entries.forEach { cue ->
            loadSample(cue)?.let { sampleId ->
                sampleIds[cue] = sampleId
            }
        }
    }

    override fun setVolume(volume: Float) {
        masterVolume = volume.coerceIn(0f, 1f)
        Log.i(SOUND_LOG_TAG, "Updated UI cue master volume=$masterVolume")
    }

    override fun playFocusShift() {
        play(UiSoundCue.FocusShift)
    }

    override fun playClick() {
        play(UiSoundCue.Click)
    }

    override fun playBack() {
        play(UiSoundCue.Back)
    }

    override fun playToggle(enabled: Boolean) {
        play(if (enabled) UiSoundCue.ToggleOn else UiSoundCue.ToggleOff)
    }

    override fun playAlert() {
        play(UiSoundCue.Alert)
    }

    override fun playActivate() {
        play(UiSoundCue.Activate)
    }

    override fun playReady() {
        play(UiSoundCue.Ready)
    }

    override fun playMenuOpen() {
        play(UiSoundCue.MenuOpen)
    }

    override fun playMenuClose() {
        play(UiSoundCue.MenuClose)
    }

    override fun playProfileChange() {
        play(UiSoundCue.ProfileChange)
    }

    override fun playSnapshotSaved() {
        play(UiSoundCue.SnapshotSaved)
    }

    override fun playRecordingStarted() {
        play(UiSoundCue.RecordingStarted)
    }

    override fun playRecordingStopped() {
        play(UiSoundCue.RecordingStopped)
    }

    override fun playReconnect() {
        play(UiSoundCue.Reconnect)
    }

    override fun playConnectionLost() {
        play(UiSoundCue.ConnectionLost)
    }

    override fun playCalibrationComplete() {
        play(UiSoundCue.CalibrationComplete)
    }

    override fun playCalibrationFail() {
        play(UiSoundCue.CalibrationFail)
    }

    override fun release() {
        if (released) {
            return
        }
        released = true
        loadedSampleIds.clear()
        sampleIds.clear()
        soundPool.release()
    }

    private fun play(cue: UiSoundCue) {
        if (released) {
            Log.w(SOUND_LOG_TAG, "Skipped UI cue '${cue.name}' because the sound manager is released")
            return
        }
        val sampleId = sampleIds[cue] ?: run {
            Log.w(SOUND_LOG_TAG, "Skipped UI cue '${cue.name}' because no sample was loaded")
            return
        }
        val now = SystemClock.elapsedRealtime()
        val lastPlayedAt = lastPlayAtElapsedMs[cue]
        if (lastPlayedAt != null && now - lastPlayedAt < cue.minIntervalMs) {
            Log.i(
                SOUND_LOG_TAG,
                "Skipped UI cue '${cue.name}' due to throttle window ${cue.minIntervalMs}ms",
            )
            return
        }

        val effectiveVolume = (masterVolume * cue.gainScale).coerceIn(0f, 1f)
        if (effectiveVolume <= 0.01f) {
            Log.i(
                SOUND_LOG_TAG,
                "Skipped UI cue '${cue.name}' because effectiveVolume=$effectiveVolume masterVolume=$masterVolume",
            )
            return
        }

        Log.i(
            SOUND_LOG_TAG,
            "Requesting UI cue '${cue.name}' sampleId=$sampleId volume=$effectiveVolume ready=${loadedSampleIds.contains(sampleId)}",
        )
        val streamId = soundPool.play(
            sampleId,
            effectiveVolume,
            effectiveVolume,
            1,
            0,
            1f,
        )
        if (streamId == 0) {
            Log.w(
                SOUND_LOG_TAG,
                "SoundPool rejected cue '${cue.name}' ready=${loadedSampleIds.contains(sampleId)} sampleId=$sampleId",
            )
            return
        }
        lastPlayAtElapsedMs[cue] = now
        Log.i(
            SOUND_LOG_TAG,
            "Played UI cue '${cue.name}' streamId=$streamId ready=${loadedSampleIds.contains(sampleId)}",
        )
    }

    private fun loadSample(cue: UiSoundCue): Int? {
        return try {
            soundPool.load(context, cue.fallbackRawResId, 1).also { sampleId ->
                Log.i(
                    SOUND_LOG_TAG,
                    "Loaded UI cue '${cue.name}' from raw resource: ${cue.fallbackRawResId} sampleId=$sampleId",
                )
            }
        } catch (error: RuntimeException) {
            Log.w(
                SOUND_LOG_TAG,
                "Unable to load UI cue '${cue.name}' from raw resource",
                error,
            )
            null
        }
    }
}
