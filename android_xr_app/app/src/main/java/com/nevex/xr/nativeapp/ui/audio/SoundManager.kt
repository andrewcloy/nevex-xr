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

    fun playClick()

    fun playBack()

    fun playAlert()

    fun playActivate()

    fun release()
}

object NoOpSoundManager : SoundManager {
    override fun setVolume(volume: Float) = Unit

    override fun playClick() = Unit

    override fun playBack() = Unit

    override fun playAlert() = Unit

    override fun playActivate() = Unit

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
    val assetPath: String,
    val fallbackRawResId: Int,
    val gainScale: Float,
    val minIntervalMs: Long,
) {
    Click(
        assetPath = "audio/click.wav",
        fallbackRawResId = R.raw.nevex_audio_ui_click_soft,
        gainScale = 0.52f,
        minIntervalMs = 45L,
    ),
    Back(
        assetPath = "audio/back.wav",
        fallbackRawResId = R.raw.nevex_audio_ui_back,
        gainScale = 0.66f,
        minIntervalMs = 80L,
    ),
    Alert(
        assetPath = "audio/alert.wav",
        fallbackRawResId = R.raw.nevex_audio_warning_alert,
        gainScale = 0.88f,
        minIntervalMs = 250L,
    ),
    Activate(
        assetPath = "audio/activate.wav",
        fallbackRawResId = R.raw.nevex_audio_ui_confirm,
        gainScale = 0.76f,
        minIntervalMs = 120L,
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
        soundPool.setOnLoadCompleteListener { _, sampleId, status ->
            if (status == 0) {
                loadedSampleIds.add(sampleId)
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
    }

    override fun playClick() {
        play(UiSoundCue.Click)
    }

    override fun playBack() {
        play(UiSoundCue.Back)
    }

    override fun playAlert() {
        play(UiSoundCue.Alert)
    }

    override fun playActivate() {
        play(UiSoundCue.Activate)
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
            return
        }
        val sampleId = sampleIds[cue] ?: return
        if (!loadedSampleIds.contains(sampleId)) {
            return
        }
        val now = SystemClock.elapsedRealtime()
        val lastPlayedAt = lastPlayAtElapsedMs[cue] ?: Long.MIN_VALUE
        if (now - lastPlayedAt < cue.minIntervalMs) {
            return
        }

        val effectiveVolume = (masterVolume * cue.gainScale).coerceIn(0f, 1f)
        if (effectiveVolume <= 0.01f) {
            return
        }

        lastPlayAtElapsedMs[cue] = now
        soundPool.play(
            sampleId,
            effectiveVolume,
            effectiveVolume,
            1,
            0,
            1f,
        )
    }

    private fun loadSample(cue: UiSoundCue): Int? {
        loadAssetSample(cue)?.let { sampleId ->
            Log.i(SOUND_LOG_TAG, "Loaded UI cue '${cue.name}' from assets: ${cue.assetPath}")
            return sampleId
        }

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
                "Unable to load UI cue '${cue.name}' from assets or raw fallback",
                error,
            )
            null
        }
    }

    private fun loadAssetSample(cue: UiSoundCue): Int? {
        return try {
            context.assets.openFd(cue.assetPath).use { assetDescriptor ->
                soundPool.load(assetDescriptor, 1)
            }
        } catch (_: Exception) {
            null
        }
    }
}
