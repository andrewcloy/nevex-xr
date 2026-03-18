package com.nevex.xr.nativeapp.stream

import android.graphics.Bitmap
import android.util.Base64
import org.json.JSONObject

class JetsonJsonStereoFrameDecoder {
    private val leftEyeBuffers = ReusableBitmapBuffers()
    private val rightEyeBuffers = ReusableBitmapBuffers()

    fun decode(
        messageText: String,
        receivedAtElapsedNanos: Long,
    ): DecodedJetsonStereoFrame {
        val envelope = JSONObject(messageText)
        require(envelope.optString("messageType") == "stereo_frame") {
            "Expected stereo_frame envelope."
        }

        val payload = envelope.getJSONObject("payload")
        val frameId = payload.optLong("frameId", -1L)
        require(frameId >= 0L) { "JSON stereo frame payload.frameId is required." }
        val leftBytes = decodeImageBytes(payload.getJSONObject("left"))
        val rightBytes = decodeImageBytes(payload.getJSONObject("right"))
        val leftBitmap = leftEyeBuffers.decode(leftBytes, 0, leftBytes.size)
        val rightBitmap = rightEyeBuffers.decode(rightBytes, 0, rightBytes.size)
        val leftStats = leftEyeBuffers.snapshot()
        val rightStats = rightEyeBuffers.snapshot()

        return DecodedJetsonStereoFrame(
            frameId = frameId,
            timestampMs = payload.optLongOrNull("timestampMs"),
            leftBitmap = leftBitmap.bitmap,
            rightBitmap = rightBitmap.bitmap,
            messageSizeBytes = messageText.toByteArray().size,
            receivedAtElapsedNanos = receivedAtElapsedNanos,
            bitmapReuseStats = BitmapReuseStats(
                decodeCount = leftStats.decodeCount + rightStats.decodeCount,
                reuseAttemptCount = leftStats.reuseAttemptCount + rightStats.reuseAttemptCount,
                reuseHitCount = leftStats.reuseHitCount + rightStats.reuseHitCount,
                reuseFallbackCount = leftStats.reuseFallbackCount + rightStats.reuseFallbackCount,
            ),
        )
    }

    fun resetMetrics() {
        leftEyeBuffers.resetMetrics()
        rightEyeBuffers.resetMetrics()
    }

    private fun decodeImageBytes(eyePayload: JSONObject): ByteArray {
        val imagePayload = eyePayload.getJSONObject("image")
        return when {
            imagePayload.has("base64Data") -> {
                Base64.decode(imagePayload.getString("base64Data"), Base64.DEFAULT)
            }
            imagePayload.has("dataUrl") -> {
                val dataUrl = imagePayload.getString("dataUrl")
                val base64Section = dataUrl.substringAfter("base64,", missingDelimiterValue = "")
                require(base64Section.isNotEmpty()) {
                    "Only base64 data URLs are supported for JSON stereo frames."
                }
                Base64.decode(base64Section, Base64.DEFAULT)
            }
            else -> error("Unsupported JSON stereo frame image payload. Use binary_frame, base64Data, or dataUrl.")
        }
    }
}
