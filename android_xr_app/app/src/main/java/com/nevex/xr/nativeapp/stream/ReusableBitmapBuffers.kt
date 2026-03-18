package com.nevex.xr.nativeapp.stream

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.util.concurrent.atomic.AtomicLong

internal data class BitmapDecodeResult(
    val bitmap: Bitmap,
    val reusedBitmap: Boolean,
    val reuseAttempted: Boolean,
    val fellBackWithoutReuse: Boolean,
)

internal class ReusableBitmapBuffers(
    private val bufferCount: Int = 3,
) {
    private val buffers = arrayOfNulls<Bitmap>(bufferCount)
    private var nextIndex = 0
    private val decodeCount = AtomicLong(0L)
    private val reuseAttemptCount = AtomicLong(0L)
    private val reuseHitCount = AtomicLong(0L)
    private val reuseFallbackCount = AtomicLong(0L)

    fun decode(
        source: ByteArray,
        offset: Int,
        length: Int,
    ): BitmapDecodeResult {
        decodeCount.incrementAndGet()
        val reusableBitmap = buffers[nextIndex]
            ?.takeIf { bitmap -> bitmap.isMutable && !bitmap.isRecycled }
        if (reusableBitmap != null) {
            reuseAttemptCount.incrementAndGet()
        }
        val decodedBitmap = decodeWithOptionalReuse(
            source = source,
            offset = offset,
            length = length,
            reusableBitmap = reusableBitmap,
        )
        if (decodedBitmap.reusedBitmap) {
            reuseHitCount.incrementAndGet()
        }
        if (decodedBitmap.fellBackWithoutReuse) {
            reuseFallbackCount.incrementAndGet()
        }
        buffers[nextIndex] = decodedBitmap.bitmap
        nextIndex = (nextIndex + 1) % bufferCount
        return decodedBitmap
    }

    fun snapshot(): BitmapReuseStats {
        return BitmapReuseStats(
            decodeCount = decodeCount.get(),
            reuseAttemptCount = reuseAttemptCount.get(),
            reuseHitCount = reuseHitCount.get(),
            reuseFallbackCount = reuseFallbackCount.get(),
        )
    }

    fun resetMetrics() {
        decodeCount.set(0L)
        reuseAttemptCount.set(0L)
        reuseHitCount.set(0L)
        reuseFallbackCount.set(0L)
    }

    private fun decodeWithOptionalReuse(
        source: ByteArray,
        offset: Int,
        length: Int,
        reusableBitmap: Bitmap?,
    ): BitmapDecodeResult {
        val decodeOptions = BitmapFactory.Options().apply {
            inMutable = true
            inPreferredConfig = Bitmap.Config.ARGB_8888
            if (reusableBitmap != null) {
                inBitmap = reusableBitmap
            }
        }

        return try {
            val decodedBitmap = BitmapFactory.decodeByteArray(source, offset, length, decodeOptions)
                ?: error("Failed to decode stereo eye JPEG payload.")
            BitmapDecodeResult(
                bitmap = decodedBitmap,
                reusedBitmap = reusableBitmap != null && decodedBitmap === reusableBitmap,
                reuseAttempted = reusableBitmap != null,
                fellBackWithoutReuse = false,
            )
        } catch (_: IllegalArgumentException) {
            val decodedBitmap = BitmapFactory.decodeByteArray(
                source,
                offset,
                length,
                BitmapFactory.Options().apply {
                    inMutable = true
                    inPreferredConfig = Bitmap.Config.ARGB_8888
                },
            ) ?: error("Failed to decode stereo eye JPEG payload.")
            BitmapDecodeResult(
                bitmap = decodedBitmap,
                reusedBitmap = false,
                reuseAttempted = reusableBitmap != null,
                fellBackWithoutReuse = reusableBitmap != null,
            )
        }
    }
}
