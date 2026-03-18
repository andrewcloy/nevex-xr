package com.nevex.xr.nativeapp.stream

import android.graphics.Bitmap
import org.json.JSONObject

private const val BINARY_MAGIC = "JSBF"
private const val BINARY_VERSION = 1
private const val BINARY_MESSAGE_TYPE = 1
private const val FIXED_HEADER_SIZE = 20

class JetsonBinaryFrameDecoder {
    private val leftEyeBuffers = ReusableBitmapBuffers()
    private val rightEyeBuffers = ReusableBitmapBuffers()

    fun decode(
        messageBytes: ByteArray,
        receivedAtElapsedNanos: Long,
    ): DecodedJetsonStereoFrame {
        require(messageBytes.size >= FIXED_HEADER_SIZE) {
            "Binary stereo frame must be at least $FIXED_HEADER_SIZE bytes."
        }

        val magic = messageBytes.decodeToString(startIndex = 0, endIndex = 4)
        require(magic == BINARY_MAGIC) { "Unexpected binary frame magic: $magic" }

        val version = messageBytes[4].toInt() and 0xFF
        require(version == BINARY_VERSION) { "Unsupported binary frame version: $version" }

        val messageType = messageBytes[5].toInt() and 0xFF
        require(messageType == BINARY_MESSAGE_TYPE) {
            "Unsupported binary frame type: $messageType"
        }

        val headerLength = readUInt32(messageBytes, 8)
        val leftLength = readUInt32(messageBytes, 12)
        val rightLength = readUInt32(messageBytes, 16)
        val expectedSize = FIXED_HEADER_SIZE + headerLength + leftLength + rightLength
        require(messageBytes.size == expectedSize) {
            "Binary stereo frame size ${messageBytes.size} did not match expected $expectedSize."
        }

        val headerStart = FIXED_HEADER_SIZE
        val headerEnd = headerStart + headerLength
        val leftStart = headerEnd
        val leftEnd = leftStart + leftLength
        val rightStart = leftEnd
        val rightEnd = rightStart + rightLength

        val envelope = JSONObject(
            messageBytes.decodeToString(startIndex = headerStart, endIndex = headerEnd),
        )
        require(envelope.optString("messageType") == "stereo_frame") {
            "Binary frame header must describe a stereo_frame."
        }

        val payload = envelope.getJSONObject("payload")
        val frameId = payload.optLong("frameId", -1L)
        require(frameId >= 0L) { "Binary stereo frame payload.frameId is required." }

        val timestampMs = payload.optLongOrNull("timestampMs")
        val leftBitmap = leftEyeBuffers.decode(messageBytes, leftStart, leftEnd - leftStart)
        val rightBitmap = rightEyeBuffers.decode(messageBytes, rightStart, rightEnd - rightStart)
        val leftStats = leftEyeBuffers.snapshot()
        val rightStats = rightEyeBuffers.snapshot()

        return DecodedJetsonStereoFrame(
            frameId = frameId,
            timestampMs = timestampMs,
            leftBitmap = leftBitmap.bitmap,
            rightBitmap = rightBitmap.bitmap,
            messageSizeBytes = messageBytes.size,
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

    private fun readUInt32(bytes: ByteArray, offset: Int): Int {
        return (
            ((bytes[offset].toInt() and 0xFF) shl 24) or
                ((bytes[offset + 1].toInt() and 0xFF) shl 16) or
                ((bytes[offset + 2].toInt() and 0xFF) shl 8) or
                (bytes[offset + 3].toInt() and 0xFF)
            )
    }
}
