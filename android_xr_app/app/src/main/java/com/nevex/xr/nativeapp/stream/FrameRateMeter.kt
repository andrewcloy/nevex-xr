package com.nevex.xr.nativeapp.stream

import android.os.SystemClock
import kotlin.math.max

class FrameRateMeter(
    private val maxSamples: Int = 60,
) {
    private val samples = ArrayDeque<Long>()

    @Synchronized
    fun mark(nowMs: Long = SystemClock.elapsedRealtime()): Float? {
        samples.addLast(nowMs)
        while (samples.size > maxSamples) {
            samples.removeFirst()
        }
        if (samples.size < 2) {
            return null
        }
        val elapsedMs = max(1L, samples.last() - samples.first())
        return ((samples.size - 1) * 1000f) / elapsedMs.toFloat()
    }

    @Synchronized
    fun reset() {
        samples.clear()
    }
}
