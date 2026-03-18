package com.nevex.xr.nativeapp.stream

import android.graphics.Bitmap
import com.nevex.xr.nativeapp.PresenterExperimentMode

data class JetsonEndpoint(
    val host: String = "192.168.1.56",
    val port: Int = 8090,
    val path: String = "/jetson/messages",
) {
    fun toWebSocketUrl(): String {
        val normalizedPath = if (path.startsWith("/")) path else "/$path"
        return "ws://$host:$port$normalizedPath"
    }
}

enum class JetsonLifecycle {
    Idle,
    Connecting,
    WebSocketOpen,
    AwaitingFirstFrame,
    ReceivingStereoFrame,
    Disconnected,
    Error,
}

enum class StereoEye {
    Left,
    Right,
}

enum class StereoFrameLayoutHint {
    DualEyeBitmaps,
    FutureSceneCoreSurface,
}

enum class StereoPresentationTarget {
    Fallback2DPreview,
    SpatialPanels,
    FutureSceneCoreSurface,
}

data class BitmapReuseStats(
    val decodeCount: Long = 0,
    val reuseAttemptCount: Long = 0,
    val reuseHitCount: Long = 0,
    val reuseFallbackCount: Long = 0,
) {
    val reuseHitRatePercent: Float?
        get() = if (reuseAttemptCount > 0) {
            (reuseHitCount * 100f) / reuseAttemptCount.toFloat()
        } else {
            null
        }
}

data class DecodedJetsonStereoFrame(
    val frameId: Long,
    val timestampMs: Long?,
    val leftBitmap: Bitmap,
    val rightBitmap: Bitmap,
    val messageSizeBytes: Int,
    val receivedAtElapsedNanos: Long,
    val bitmapReuseStats: BitmapReuseStats = BitmapReuseStats(),
    val layoutHint: StereoFrameLayoutHint = StereoFrameLayoutHint.DualEyeBitmaps,
)

data class StereoEyePresenterReceiveEvent(
    val eye: StereoEye,
    val experimentMode: PresenterExperimentMode,
    val frameId: Long,
    val receivedAtElapsedNanos: Long,
    val decodedAtElapsedNanos: Long,
    val frameStatePublishedAtElapsedNanos: Long,
    val presenterReceivedAtElapsedNanos: Long,
    val preDecodeQueueWaitNanos: Long? = null,
    val decodeIdleGapNanos: Long? = null,
    val supersededPendingFrame: Boolean = false,
)

data class StereoEyeFramePresentedEvent(
    val eye: StereoEye,
    val experimentMode: PresenterExperimentMode,
    val frameId: Long,
    val receivedAtElapsedNanos: Long,
    val decodedAtElapsedNanos: Long,
    val frameStatePublishedAtElapsedNanos: Long,
    val presenterReceivedAtElapsedNanos: Long,
    val preDecodeQueueWaitNanos: Long? = null,
    val decodeIdleGapNanos: Long? = null,
    val lockStartedAtElapsedNanos: Long,
    val lockCompletedAtElapsedNanos: Long,
    val unlockStartedAtElapsedNanos: Long,
    val unlockCompletedAtElapsedNanos: Long,
    val presentedAtElapsedNanos: Long,
)

data class StereoRenderableFrame(
    val frameId: Long? = null,
    val timestampMs: Long? = null,
    val leftBitmap: Bitmap? = null,
    val rightBitmap: Bitmap? = null,
    val messageSizeBytes: Int? = null,
    val receivedAtElapsedNanos: Long? = null,
    val receiveFps: Float? = null,
    val decodeTimeMs: Float? = null,
    val bitmapUpdateTimeMs: Float? = null,
    val bitmapReuseStats: BitmapReuseStats = BitmapReuseStats(),
    val presentationFps: Float? = null,
    val presentationLatencyMs: Float? = null,
    val receiveToPresentationLatencyMs: Float? = null,
    val droppedFrameCount: Int = 0,
    val queuedFrameDropCount: Int = 0,
    val presentationLagFrameCount: Int = 0,
    val decodedAtElapsedNanos: Long? = null,
    val frameStatePublishedAtElapsedNanos: Long? = null,
    val preDecodeQueueWaitNanos: Long? = null,
    val decodeIdleGapNanos: Long? = null,
    val layoutHint: StereoFrameLayoutHint = StereoFrameLayoutHint.DualEyeBitmaps,
) {
    val hasLiveFrame: Boolean
        get() = leftBitmap != null && rightBitmap != null
}

data class JetsonStreamSnapshot(
    val endpoint: JetsonEndpoint = JetsonEndpoint(),
    val lifecycle: JetsonLifecycle = JetsonLifecycle.Idle,
    val lifecycleText: String = "Ready to connect",
    val statusText: String = "Enter the Jetson host to begin.",
    val connected: Boolean = false,
    val senderName: String? = null,
    val sourceHealthText: String = "Idle",
    val lastMessageType: String? = null,
    val lastMessageSizeBytes: Int? = null,
    val hasLiveFrame: Boolean = false,
    val lastError: String? = null,
) {
    val isHealthy: Boolean
        get() = connected && hasLiveFrame && lastError == null
}
