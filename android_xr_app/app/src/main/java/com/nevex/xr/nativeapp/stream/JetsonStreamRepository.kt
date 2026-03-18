package com.nevex.xr.nativeapp.stream

import android.os.Process as AndroidProcess
import android.os.SystemClock
import android.util.Log
import com.nevex.xr.nativeapp.PresenterExperimentMode
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExecutorCoroutineDispatcher
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONObject
import java.io.Closeable
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.sqrt

class JetsonStreamRepository(
    decodeDispatcher: CoroutineDispatcher? = null,
) : Closeable {
    private data class PresentPathUiSnapshot(
        val presentationFps: Float?,
        val presentationLatencyMs: Float?,
        val receiveToPresentationLatencyMs: Float?,
    )

    private companion object {
        const val TAG = "NevexXrStream"
        const val PERFORMANCE_LOG_INTERVAL_FRAMES = 300L
        const val MAX_BUFFERED_BINARY_FRAMES = 3
        const val PRESENT_STALL_THRESHOLD_NANOS = 30_000_000L
        const val QUEUE_SPIKE_CORRELATION_THRESHOLD_NANOS = 8_000_000L
        const val IDLE_GAP_CORRELATION_THRESHOLD_NANOS = 4_000_000L
        const val PRESENT_INTERVAL_HISTOGRAM_MAX_BUCKET_MS = 50
        const val MAX_PENDING_STEREO_PAIR_SAMPLES = 128

        fun createDecodeDispatcher(): ExecutorCoroutineDispatcher {
            return Executors.newSingleThreadExecutor { runnable ->
                Thread(
                    {
                        try {
                            AndroidProcess.setThreadPriority(
                                AndroidProcess.THREAD_PRIORITY_DEFAULT +
                                    AndroidProcess.THREAD_PRIORITY_MORE_FAVORABLE,
                            )
                        } catch (_: Throwable) {
                            // Best-effort only; continue even if priority cannot be changed.
                        }
                        runnable.run()
                    },
                    "NevexXrDecode",
                ).apply {
                    isDaemon = true
                }
            }.asCoroutineDispatcher()
        }
    }

    private data class QueuedBinaryFrame(
        val bytes: ByteArray,
        val receivedAtElapsedNanos: Long,
        val generation: Long,
    )

    private enum class QueueDropStage(
        val diagnosticsLabel: String,
    ) {
        PreDecodeBufferFullEviction("pre-decode-buffer-full-eviction"),
    }

    private val okHttpClient = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private val ownedDecodeDispatcher = decodeDispatcher?.let { null } ?: createDecodeDispatcher()
    private val decodeDispatcher = decodeDispatcher ?: ownedDecodeDispatcher!!
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val binaryFrameDecoder = JetsonBinaryFrameDecoder()
    private val jsonStereoFrameDecoder = JetsonJsonStereoFrameDecoder()
    private val receiveRateMeter = FrameRateMeter()
    private val binaryEnqueueRateMeter = FrameRateMeter()
    private val binaryDecodeRateMeter = FrameRateMeter()
    private val bufferedBinaryFrames = ArrayDeque<QueuedBinaryFrame>(MAX_BUFFERED_BINARY_FRAMES)
    private val bufferedBinaryFramesLock = Any()
    private val binaryDrainRunning = AtomicBoolean(false)
    private val instrumentationEnabled = AtomicBoolean(false)
    private val queuedFrameDropCount = AtomicLong(0L)
    private val droppedFrameCount = AtomicLong(0L)
    private val lastPublishedFrameId = AtomicLong(-1L)
    private val lastPresentedFrameId = AtomicLong(-1L)
    private val lastPerformanceLogFrameId = AtomicLong(-1L)
    private val firstQueueDropLogged = AtomicBoolean(false)
    private val lastQueueDropStage = AtomicReference<QueueDropStage?>(null)
    private val binaryFrameReceiveCount = AtomicLong(0L)
    private val binaryFrameDecodeStartCount = AtomicLong(0L)
    private val binaryFramePublishCount = AtomicLong(0L)
    private val bufferFullEvictionDropCount = AtomicLong(0L)
    private val overwriteDropCount = AtomicLong(0L)
    private val lastBufferedFrameCount = AtomicLong(0L)
    private val totalBufferedFrameCount = AtomicLong(0L)
    private val bufferedFrameSampleCount = AtomicLong(0L)
    private val maxBufferedFrameCount = AtomicLong(0L)
    private val decodeIdleGapSampleCount = AtomicLong(0L)
    private val lastDecodeIdleGapNanos = AtomicLong(0L)
    private val totalDecodeIdleGapNanos = AtomicLong(0L)
    private val maxDecodeIdleGapNanos = AtomicLong(0L)
    private val bufferNonEmptyWhileDecodeIdleSinceNanos = AtomicLong(0L)
    private val lastBinaryQueueWaitNanos = AtomicLong(0L)
    private val totalBinaryQueueWaitNanos = AtomicLong(0L)
    private val maxBinaryQueueWaitNanos = AtomicLong(0L)
    private val lastDecodeToFrameStatePublishNanos = AtomicLong(0L)
    private val totalDecodeToFrameStatePublishNanos = AtomicLong(0L)
    private val maxDecodeToFrameStatePublishNanos = AtomicLong(0L)
    private val decodeToFrameStatePublishSampleCount = AtomicLong(0L)
    private val lastFrameStatePublishNanos = AtomicLong(0L)
    private val totalFrameStatePublishNanos = AtomicLong(0L)
    private val maxFrameStatePublishNanos = AtomicLong(0L)
    private val lastSnapshotUpdateNanos = AtomicLong(0L)
    private val totalSnapshotUpdateNanos = AtomicLong(0L)
    private val maxSnapshotUpdateNanos = AtomicLong(0L)
    private val lastPublishWorkNanos = AtomicLong(0L)
    private val totalPublishWorkNanos = AtomicLong(0L)
    private val maxPublishWorkNanos = AtomicLong(0L)
    private val presentPathMetrics = PresentPathMetricsTracker()
    @Volatile
    private var lastBinaryEnqueueFps: Float? = null
    @Volatile
    private var lastBinaryDecodeFps: Float? = null
    @Volatile
    private var currentPresenterExperimentMode = PresenterExperimentMode.NormalBitmap

    private val _snapshot = MutableStateFlow(JetsonStreamSnapshot())
    val snapshot: StateFlow<JetsonStreamSnapshot> = _snapshot.asStateFlow()

    private val _frameState = MutableStateFlow(StereoRenderableFrame())
    val frameState: StateFlow<StereoRenderableFrame> = _frameState.asStateFlow()

    private var activeSocket: WebSocket? = null
    private var connectionGeneration: Long = 0L

    fun connect(endpoint: JetsonEndpoint) {
        closeActiveSocket()
        resetFrameState()
        Log.i(TAG, "Connecting to ${endpoint.toWebSocketUrl()}")

        connectionGeneration += 1L
        val generation = connectionGeneration

        _snapshot.value = JetsonStreamSnapshot(
            endpoint = endpoint,
            lifecycle = JetsonLifecycle.Connecting,
            lifecycleText = "Connecting to Jetson",
            statusText = endpoint.toWebSocketUrl(),
            connected = false,
            sourceHealthText = "Connecting",
        )

        activeSocket = okHttpClient.newWebSocket(
            Request.Builder()
                .url(endpoint.toWebSocketUrl())
                .build(),
            createListener(endpoint, generation),
        )
    }

    fun disconnect() {
        connectionGeneration += 1L
        closeActiveSocket()
        resetFrameState()
        Log.i(TAG, "Disconnect requested")
        _snapshot.update {
            it.copy(
                connected = false,
                lifecycle = JetsonLifecycle.Disconnected,
                lifecycleText = "Disconnected",
                statusText = "Connect to resume the live stereo view.",
                hasLiveFrame = false,
                lastError = null,
            )
        }
    }

    fun setInstrumentationEnabled(enabled: Boolean) {
        instrumentationEnabled.set(enabled)
        presentPathMetrics.reset()
        if (enabled) {
            lastPresentedFrameId.set(-1L)
            lastPerformanceLogFrameId.set(-1L)
        }
        _frameState.update {
            it.copy(
                decodeTimeMs = if (enabled) it.decodeTimeMs else null,
                bitmapUpdateTimeMs = if (enabled) it.bitmapUpdateTimeMs else null,
                presentationFps = if (enabled) it.presentationFps else null,
                presentationLatencyMs = if (enabled) it.presentationLatencyMs else null,
                receiveToPresentationLatencyMs = if (enabled) it.receiveToPresentationLatencyMs else null,
            )
        }
    }

    fun setPresenterExperimentMode(mode: PresenterExperimentMode) {
        if (currentPresenterExperimentMode == mode) {
            return
        }
        currentPresenterExperimentMode = mode
        lastPresentedFrameId.set(-1L)
        presentPathMetrics.reset()
        lastPerformanceLogFrameId.set(-1L)
        Log.i(TAG, "Presenter experiment mode switched to ${mode.wireValue}")
    }

    fun recordEyePresenterReceived(event: StereoEyePresenterReceiveEvent) {
        if (!instrumentationEnabled.get()) {
            return
        }
        if (event.experimentMode != currentPresenterExperimentMode) {
            return
        }
        presentPathMetrics.recordPresenterReceive(event)
    }

    fun recordFramePresented(event: StereoEyeFramePresentedEvent) {
        if (!instrumentationEnabled.get()) {
            return
        }
        if (event.experimentMode != currentPresenterExperimentMode) {
            return
        }
        presentPathMetrics.recordFramePresented(event)
        lastPresentedFrameId.set(presentPathMetrics.currentLagAnchorFrameId())
    }

    override fun close() {
        disconnect()
        scope.cancel()
        ownedDecodeDispatcher?.close()
        okHttpClient.dispatcher.executorService.shutdown()
        okHttpClient.connectionPool.evictAll()
    }

    private fun closeActiveSocket() {
        clearBufferedBinaryFrames()
        binaryDrainRunning.set(false)
        activeSocket?.cancel()
        activeSocket = null
    }

    private fun resetFrameState() {
        receiveRateMeter.reset()
        binaryEnqueueRateMeter.reset()
        binaryDecodeRateMeter.reset()
        queuedFrameDropCount.set(0L)
        droppedFrameCount.set(0L)
        lastPublishedFrameId.set(-1L)
        lastPresentedFrameId.set(-1L)
        lastPerformanceLogFrameId.set(-1L)
        firstQueueDropLogged.set(false)
        lastQueueDropStage.set(null)
        binaryFrameReceiveCount.set(0L)
        binaryFrameDecodeStartCount.set(0L)
        binaryFramePublishCount.set(0L)
        bufferFullEvictionDropCount.set(0L)
        overwriteDropCount.set(0L)
        lastBufferedFrameCount.set(0L)
        totalBufferedFrameCount.set(0L)
        bufferedFrameSampleCount.set(0L)
        maxBufferedFrameCount.set(0L)
        decodeIdleGapSampleCount.set(0L)
        lastDecodeIdleGapNanos.set(0L)
        totalDecodeIdleGapNanos.set(0L)
        maxDecodeIdleGapNanos.set(0L)
        bufferNonEmptyWhileDecodeIdleSinceNanos.set(0L)
        lastBinaryQueueWaitNanos.set(0L)
        totalBinaryQueueWaitNanos.set(0L)
        maxBinaryQueueWaitNanos.set(0L)
        lastDecodeToFrameStatePublishNanos.set(0L)
        totalDecodeToFrameStatePublishNanos.set(0L)
        maxDecodeToFrameStatePublishNanos.set(0L)
        decodeToFrameStatePublishSampleCount.set(0L)
        lastFrameStatePublishNanos.set(0L)
        totalFrameStatePublishNanos.set(0L)
        maxFrameStatePublishNanos.set(0L)
        lastSnapshotUpdateNanos.set(0L)
        totalSnapshotUpdateNanos.set(0L)
        maxSnapshotUpdateNanos.set(0L)
        lastPublishWorkNanos.set(0L)
        totalPublishWorkNanos.set(0L)
        maxPublishWorkNanos.set(0L)
        lastBinaryEnqueueFps = null
        lastBinaryDecodeFps = null
        presentPathMetrics.reset()
        clearBufferedBinaryFrames()
        binaryFrameDecoder.resetMetrics()
        jsonStereoFrameDecoder.resetMetrics()
        _frameState.value = StereoRenderableFrame()
    }

    private fun createListener(
        endpoint: JetsonEndpoint,
        generation: Long,
    ): WebSocketListener {
        return object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                if (isStale(generation)) {
                    return
                }
                Log.i(TAG, "WebSocket opened for ${endpoint.toWebSocketUrl()}")
                _snapshot.update {
                    it.copy(
                        endpoint = endpoint,
                        connected = true,
                        lifecycle = JetsonLifecycle.WebSocketOpen,
                        lifecycleText = "WebSocket open",
                        statusText = "Awaiting first frame",
                        sourceHealthText = "Awaiting stream",
                        lastError = null,
                    )
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (isStale(generation)) {
                    return
                }
                val receivedAtElapsedNanos = SystemClock.elapsedRealtimeNanos()
                handleTextMessage(
                    message = text,
                    generation = generation,
                    receivedAtElapsedNanos = receivedAtElapsedNanos,
                )
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                if (isStale(generation)) {
                    return
                }
                val receivedAtElapsedNanos = SystemClock.elapsedRealtimeNanos()
                queueLatestBinaryFrame(
                    frameBytes = bytes.toByteArray(),
                    generation = generation,
                    receivedAtElapsedNanos = receivedAtElapsedNanos,
                )
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                if (isStale(generation)) {
                    return
                }
                Log.i(TAG, "WebSocket closing: code=$code reason=$reason")
                _snapshot.update {
                    it.copy(
                        connected = false,
                        lifecycle = JetsonLifecycle.Disconnected,
                        lifecycleText = "Connection closing",
                        statusText = reason.ifBlank { "The Jetson endpoint is closing the socket." },
                    )
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (isStale(generation)) {
                    return
                }
                Log.i(TAG, "WebSocket closed: code=$code reason=$reason")
                _snapshot.update {
                    it.copy(
                        connected = false,
                        lifecycle = JetsonLifecycle.Disconnected,
                        lifecycleText = "Disconnected",
                        statusText = reason.ifBlank { "The Jetson endpoint closed the connection." },
                    )
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (isStale(generation)) {
                    return
                }
                Log.e(TAG, "WebSocket failure", t)
                _snapshot.update {
                    it.copy(
                        connected = false,
                        lifecycle = JetsonLifecycle.Error,
                        lifecycleText = "Connection failed",
                        statusText = "Unable to reach the Jetson stream.",
                        lastError = t.message ?: "Unknown WebSocket failure.",
                    )
                }
            }
        }
    }

    private fun handleTextMessage(
        message: String,
        generation: Long,
        receivedAtElapsedNanos: Long,
    ) {
        val messageSizeBytes = message.toByteArray().size
        try {
            val envelope = JSONObject(message)
            val messageType = envelope.optString("messageType")
            val payload = envelope.optJSONObject("payload") ?: JSONObject()

            when (messageType) {
                "capabilities" -> {
                    val senderName = payload.optString("senderName").takeIf(String::isNotBlank)
                    if (senderName != null) {
                        Log.i(TAG, "Capabilities received from $senderName")
                    }
                    _snapshot.update {
                        it.copy(
                            senderName = senderName,
                            lastMessageType = "capabilities",
                            lastMessageSizeBytes = messageSizeBytes,
                            statusText = "Jetson capabilities received.",
                        )
                    }
                }

                "transport_status" -> {
                    val transportState = payload.optString("transportState")
                    val parseErrorText = payload.optString("parseErrorText").takeIf(String::isNotBlank)
                    val reportedError = payload.optString("lastError").takeIf(String::isNotBlank)
                    val connected = if (payload.has("connected")) {
                        payload.optBoolean("connected")
                    } else {
                        _snapshot.value.connected
                    }
                    val lifecycleText = when {
                        transportState.equals("reconnecting", ignoreCase = true) -> "Retry scheduled"
                        _snapshot.value.hasLiveFrame -> "Receiving stereo_frame"
                        connected -> "Awaiting first frame"
                        else -> "WebSocket open"
                    }
                    _snapshot.update {
                        it.copy(
                            connected = connected,
                            lifecycle = when (lifecycleText) {
                                "Retry scheduled" -> JetsonLifecycle.Connecting
                                "Receiving stereo_frame" -> JetsonLifecycle.ReceivingStereoFrame
                                "Awaiting first frame" -> JetsonLifecycle.AwaitingFirstFrame
                                else -> JetsonLifecycle.WebSocketOpen
                            },
                            lifecycleText = lifecycleText,
                            statusText = payload.optString("statusText")
                                .takeIf(String::isNotBlank)
                                ?: "Transport update received.",
                            lastMessageType = "transport_status",
                            lastMessageSizeBytes = messageSizeBytes,
                            lastError = parseErrorText ?: reportedError ?: it.lastError,
                        )
                    }
                }

                "source_status" -> {
                    val cameraTelemetry = payload.optJSONObject("cameraTelemetry")
                    val sourceHealth = cameraTelemetry
                        ?.optString("captureHealthState")
                        ?.takeIf(String::isNotBlank)
                        ?: payload.optString("sourceState").takeIf(String::isNotBlank)
                        ?: "running"
                    _snapshot.update {
                        it.copy(
                            sourceHealthText = humanizeToken(sourceHealth),
                            statusText = payload.optString("statusText")
                                .takeIf(String::isNotBlank)
                                ?: it.statusText,
                            lastMessageType = "source_status",
                            lastMessageSizeBytes = messageSizeBytes,
                        )
                    }
                }

                "error" -> {
                    _snapshot.update {
                        it.copy(
                            lifecycle = JetsonLifecycle.Error,
                            lifecycleText = "Protocol error",
                            statusText = "The stream reported an error.",
                            lastMessageType = "error",
                            lastMessageSizeBytes = messageSizeBytes,
                            lastError = payload.optString("message")
                                .takeIf(String::isNotBlank)
                                ?: "Unknown sender error.",
                        )
                    }
                }

                "stereo_frame" -> {
                    scope.launch(decodeDispatcher) {
                        try {
                            val decodeStartedNanos = SystemClock.elapsedRealtimeNanos()
                            val decodedFrame = jsonStereoFrameDecoder.decode(
                                messageText = message,
                                receivedAtElapsedNanos = receivedAtElapsedNanos,
                            )
                            publishFrame(
                                frame = decodedFrame,
                                generation = generation,
                                decodeFinishedNanos = SystemClock.elapsedRealtimeNanos(),
                                decodeStartedNanos = decodeStartedNanos,
                                preDecodeQueueWaitNanos = null,
                                decodeIdleGapNanos = null,
                            )
                        } catch (error: Throwable) {
                            publishDecodeFailure(error)
                        }
                    }
                }

                else -> {
                    _snapshot.update {
                        it.copy(
                            lastMessageType = messageType.ifBlank { "unknown" },
                            lastMessageSizeBytes = messageSizeBytes,
                        )
                    }
                }
            }
        } catch (error: Throwable) {
            publishDecodeFailure(error)
        }
    }

    private fun queueLatestBinaryFrame(
        frameBytes: ByteArray,
        generation: Long,
        receivedAtElapsedNanos: Long,
    ) {
        binaryFrameReceiveCount.incrementAndGet()
        lastBinaryEnqueueFps = binaryEnqueueRateMeter.mark(nowMs = receivedAtElapsedNanos / 1_000_000L)
        var evictedFrameAgeMs: Float? = null
        synchronized(bufferedBinaryFramesLock) {
            val bufferWasEmpty = bufferedBinaryFrames.isEmpty()
            if (bufferedBinaryFrames.size >= MAX_BUFFERED_BINARY_FRAMES) {
                val evictedFrame = bufferedBinaryFrames.removeFirst()
                queuedFrameDropCount.incrementAndGet()
                bufferFullEvictionDropCount.incrementAndGet()
                lastQueueDropStage.set(QueueDropStage.PreDecodeBufferFullEviction)
                evictedFrameAgeMs = nanosToMilliseconds(
                    (receivedAtElapsedNanos - evictedFrame.receivedAtElapsedNanos).coerceAtLeast(0L),
                )
            }
            bufferedBinaryFrames.addLast(
                QueuedBinaryFrame(
                    bytes = frameBytes,
                    receivedAtElapsedNanos = receivedAtElapsedNanos,
                    generation = generation,
                ),
            )
            if (bufferWasEmpty && !binaryDrainRunning.get()) {
                bufferNonEmptyWhileDecodeIdleSinceNanos.set(receivedAtElapsedNanos)
            }
            recordBufferedFrameCountSampleLocked()
        }
        if (evictedFrameAgeMs != null && firstQueueDropLogged.compareAndSet(false, true)) {
            Log.i(
                TAG,
                "First queueDrop occurred at ${QueueDropStage.PreDecodeBufferFullEviction.diagnosticsLabel} " +
                    "before bitmap handoff: droppedFrameAgeMs=${formatMetric(evictedFrameAgeMs)}",
            )
        }
        if (!binaryDrainRunning.compareAndSet(false, true)) {
            return
        }
        startBinaryDrain(generation)
    }

    private fun startBinaryDrain(generation: Long) {
        scope.launch(decodeDispatcher) {
            try {
                while (true) {
                    if (isStale(generation)) {
                        break
                    }
                    val nextFrame = pollBufferedBinaryFrame() ?: break
                    if (isStale(nextFrame.generation)) {
                        continue
                    }
                    val decodeStartedNanos = SystemClock.elapsedRealtimeNanos()
                    lastBinaryDecodeFps = binaryDecodeRateMeter.mark(nowMs = decodeStartedNanos / 1_000_000L)
                    binaryFrameDecodeStartCount.incrementAndGet()
                    val decodeIdleGapNanos = recordDecodeIdleGapIfNeeded(decodeStartedNanos)
                    val queueWaitNanos = (decodeStartedNanos - nextFrame.receivedAtElapsedNanos).coerceAtLeast(0L)
                    recordDurationSample(
                        lastValue = lastBinaryQueueWaitNanos,
                        totalValue = totalBinaryQueueWaitNanos,
                        maxValue = maxBinaryQueueWaitNanos,
                        durationNanos = queueWaitNanos,
                    )
                    val decodedFrame = binaryFrameDecoder.decode(
                        messageBytes = nextFrame.bytes,
                        receivedAtElapsedNanos = nextFrame.receivedAtElapsedNanos,
                    )
                    publishFrame(
                        frame = decodedFrame,
                        generation = generation,
                        decodeFinishedNanos = SystemClock.elapsedRealtimeNanos(),
                        decodeStartedNanos = decodeStartedNanos,
                        preDecodeQueueWaitNanos = queueWaitNanos,
                        decodeIdleGapNanos = decodeIdleGapNanos,
                    )
                }
            } catch (error: Throwable) {
                publishDecodeFailure(error)
            } finally {
                binaryDrainRunning.set(false)
                if (
                    !isStale(generation) &&
                    hasBufferedBinaryFrames() &&
                    binaryDrainRunning.compareAndSet(false, true)
                ) {
                    startBinaryDrain(generation)
                }
            }
        }
    }

    private fun publishFrame(
        frame: DecodedJetsonStereoFrame,
        generation: Long,
        decodeFinishedNanos: Long,
        decodeStartedNanos: Long,
        preDecodeQueueWaitNanos: Long?,
        decodeIdleGapNanos: Long?,
    ) {
        if (isStale(generation)) {
            return
        }

        val previousSnapshot = _snapshot.value
        val previousFrameState = _frameState.value
        val firstLiveFrame = !previousSnapshot.hasLiveFrame
        val receiveFps = receiveRateMeter.mark()
        updateDroppedFrameCount(frame.frameId)
        val independentEyeBitmaps = frame.leftBitmap !== frame.rightBitmap

        val publishWorkStartedNanos = SystemClock.elapsedRealtimeNanos()
        val decodeTimeMs = nanosToMilliseconds(decodeFinishedNanos - decodeStartedNanos)
        val frameStatePublishedAtElapsedNanos = SystemClock.elapsedRealtimeNanos()
        val presentPathUiSnapshot = presentPathMetrics.uiSnapshot()
        recordDurationSample(
            lastValue = lastDecodeToFrameStatePublishNanos,
            totalValue = totalDecodeToFrameStatePublishNanos,
            maxValue = maxDecodeToFrameStatePublishNanos,
            durationNanos = (frameStatePublishedAtElapsedNanos - decodeFinishedNanos).coerceAtLeast(0L),
        )
        decodeToFrameStatePublishSampleCount.incrementAndGet()
        val nextFrameState = StereoRenderableFrame(
            frameId = frame.frameId,
            timestampMs = frame.timestampMs,
            leftBitmap = frame.leftBitmap,
            rightBitmap = frame.rightBitmap,
            messageSizeBytes = frame.messageSizeBytes,
            receivedAtElapsedNanos = frame.receivedAtElapsedNanos,
            receiveFps = receiveFps,
            decodeTimeMs = decodeTimeMs.takeIf { instrumentationEnabled.get() },
            bitmapUpdateTimeMs = previousFrameState.bitmapUpdateTimeMs.takeIf { instrumentationEnabled.get() },
            bitmapReuseStats = frame.bitmapReuseStats,
            presentationFps = presentPathUiSnapshot.presentationFps.takeIf { instrumentationEnabled.get() },
            presentationLatencyMs = presentPathUiSnapshot.presentationLatencyMs
                .takeIf { instrumentationEnabled.get() },
            receiveToPresentationLatencyMs = presentPathUiSnapshot.receiveToPresentationLatencyMs
                .takeIf { instrumentationEnabled.get() },
            droppedFrameCount = droppedFrameCount.get().toInt(),
            queuedFrameDropCount = queuedFrameDropCount.get().toInt(),
            presentationLagFrameCount = currentPresentationLag(frame.frameId),
            decodedAtElapsedNanos = decodeFinishedNanos,
            frameStatePublishedAtElapsedNanos = frameStatePublishedAtElapsedNanos,
            preDecodeQueueWaitNanos = preDecodeQueueWaitNanos,
            decodeIdleGapNanos = decodeIdleGapNanos,
            layoutHint = frame.layoutHint,
        )

        val frameStatePublishStartedNanos = frameStatePublishedAtElapsedNanos
        _frameState.value = nextFrameState
        val frameStatePublishNanos = SystemClock.elapsedRealtimeNanos() - frameStatePublishStartedNanos
        recordDurationSample(
            lastValue = lastFrameStatePublishNanos,
            totalValue = totalFrameStatePublishNanos,
            maxValue = maxFrameStatePublishNanos,
            durationNanos = frameStatePublishNanos,
        )
        val bitmapUpdateTimeMs = nanosToMilliseconds(frameStatePublishNanos)

        if (instrumentationEnabled.get()) {
            _frameState.update { current ->
                if (current.frameId != frame.frameId) {
                    current
                } else {
                    current.copy(bitmapUpdateTimeMs = bitmapUpdateTimeMs)
                }
            }
        }

        if (firstLiveFrame) {
            val snapshotUpdateStartedNanos = SystemClock.elapsedRealtimeNanos()
            _snapshot.update { current ->
                current.copy(
                    connected = true,
                    lifecycle = JetsonLifecycle.ReceivingStereoFrame,
                    lifecycleText = "Receiving stereo_frame",
                    statusText = "Live stereo imagery flowing.",
                    sourceHealthText = if (current.sourceHealthText == "Idle") "Healthy" else current.sourceHealthText,
                    lastMessageType = "stereo_frame",
                    lastMessageSizeBytes = frame.messageSizeBytes,
                    hasLiveFrame = true,
                    lastError = null,
                )
            }
            recordDurationSample(
                lastValue = lastSnapshotUpdateNanos,
                totalValue = totalSnapshotUpdateNanos,
                maxValue = maxSnapshotUpdateNanos,
                durationNanos = SystemClock.elapsedRealtimeNanos() - snapshotUpdateStartedNanos,
            )
        }

        recordDurationSample(
            lastValue = lastPublishWorkNanos,
            totalValue = totalPublishWorkNanos,
            maxValue = maxPublishWorkNanos,
            durationNanos = SystemClock.elapsedRealtimeNanos() - publishWorkStartedNanos,
        )
        binaryFramePublishCount.incrementAndGet()
        if (firstLiveFrame) {
            Log.i(
                TAG,
                "First stereo frame rendered: frameId=${frame.frameId}, size=${frame.messageSizeBytes} bytes, " +
                    "leftBitmapId=${System.identityHashCode(frame.leftBitmap)}, " +
                    "rightBitmapId=${System.identityHashCode(frame.rightBitmap)}, " +
                    "independentEyes=$independentEyeBitmaps",
            )
        } else if (!independentEyeBitmaps) {
            Log.w(TAG, "Stereo frame ${frame.frameId} reused the same Bitmap instance for both eyes.")
        }
        maybeLogPerformanceSample(frame.frameId)
    }

    private fun updateDroppedFrameCount(frameId: Long) {
        val previousFrameId = lastPublishedFrameId.getAndSet(frameId)
        if (previousFrameId >= 0L && frameId > previousFrameId + 1L) {
            droppedFrameCount.addAndGet(frameId - previousFrameId - 1L)
        }
    }

    private fun currentPresentationLag(frameId: Long): Int {
        val presentedFrameId = lastPresentedFrameId.get()
        if (presentedFrameId < 0L || frameId <= presentedFrameId) {
            return 0
        }
        return (frameId - presentedFrameId).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    }

    private fun maybeLogPerformanceSample(frameId: Long) {
        val lastLoggedFrameId = lastPerformanceLogFrameId.get()
        val shouldLog = lastLoggedFrameId < 0L || frameId - lastLoggedFrameId >= PERFORMANCE_LOG_INTERVAL_FRAMES
        if (!shouldLog) {
            return
        }
        lastPerformanceLogFrameId.set(frameId)
        val current = _frameState.value
        Log.i(
            TAG,
            "XR perf sample: mode=${currentPresenterExperimentMode.wireValue} frameId=$frameId " +
                "receiveFps=${formatMetric(current.receiveFps)} " +
                "presentationFps=${formatMetric(current.presentationFps)} " +
                "decodeMs=${formatMetric(current.decodeTimeMs)} " +
                "handoffMs=${formatMetric(current.bitmapUpdateTimeMs)} " +
                "decodeToPublishMs=${formatDurationSummary(lastDecodeToFrameStatePublishNanos, totalDecodeToFrameStatePublishNanos, maxDecodeToFrameStatePublishNanos, decodeToFrameStatePublishSampleCount)} " +
                "decodeToPresentMs=${formatMetric(current.presentationLatencyMs)} " +
                "receiveToPresentMs=${formatMetric(current.receiveToPresentationLatencyMs)} " +
                "reuse=${formatBitmapReuse(current.bitmapReuseStats)} " +
                "dropped=${current.droppedFrameCount} " +
                "queueDrops=${current.queuedFrameDropCount} " +
                "lagFrames=${current.presentationLagFrameCount} " +
                "dropStage=${lastQueueDropStage.get()?.diagnosticsLabel ?: "none"} " +
                "binaryRates=${formatMetric(lastBinaryEnqueueFps)}/${formatMetric(lastBinaryDecodeFps)} " +
                "binaryFrames=${binaryFrameReceiveCount.get()}/${binaryFrameDecodeStartCount.get()}/${binaryFramePublishCount.get()} " +
                "buffer=${formatBufferSizeSummary()} " +
                "dropReasons=${bufferFullEvictionDropCount.get()}/${overwriteDropCount.get()} " +
                "idleGapMs=${formatDurationSummary(lastDecodeIdleGapNanos, totalDecodeIdleGapNanos, maxDecodeIdleGapNanos, decodeIdleGapSampleCount)} " +
                "queueWaitMs=${formatDurationSummary(lastBinaryQueueWaitNanos, totalBinaryQueueWaitNanos, maxBinaryQueueWaitNanos, binaryFrameDecodeStartCount)} " +
                "frameStateMs=${formatDurationSummary(lastFrameStatePublishNanos, totalFrameStatePublishNanos, maxFrameStatePublishNanos, binaryFramePublishCount)} " +
                "snapshotMs=${formatDurationSummary(lastSnapshotUpdateNanos, totalSnapshotUpdateNanos, maxSnapshotUpdateNanos, binaryFramePublishCount)} " +
                "publishMs=${formatDurationSummary(lastPublishWorkNanos, totalPublishWorkNanos, maxPublishWorkNanos, binaryFramePublishCount)}",
        )
        Log.i(TAG, "XR present mode=${currentPresenterExperimentMode.wireValue} left: ${presentPathMetrics.formatEyeSummary(StereoEye.Left)}")
        Log.i(TAG, "XR present mode=${currentPresenterExperimentMode.wireValue} right: ${presentPathMetrics.formatEyeSummary(StereoEye.Right)}")
        Log.i(TAG, "XR stereo pair mode=${currentPresenterExperimentMode.wireValue}: ${presentPathMetrics.formatStereoPairSummary()}")
    }

    private fun publishDecodeFailure(error: Throwable) {
        Log.e(TAG, "Failed to decode Jetson message", error)
        _snapshot.update {
            it.copy(
                lifecycle = JetsonLifecycle.Error,
                lifecycleText = "Decode failed",
                statusText = "A frame or protocol payload could not be decoded.",
                lastError = error.message ?: "Unknown decode error.",
            )
        }
    }

    private fun isStale(generation: Long): Boolean = generation != connectionGeneration

    private fun clearBufferedBinaryFrames() {
        synchronized(bufferedBinaryFramesLock) {
            bufferedBinaryFrames.clear()
            recordBufferedFrameCountSampleLocked()
        }
        bufferNonEmptyWhileDecodeIdleSinceNanos.set(0L)
    }

    private fun pollBufferedBinaryFrame(): QueuedBinaryFrame? {
        synchronized(bufferedBinaryFramesLock) {
            if (bufferedBinaryFrames.isEmpty()) {
                return null
            }
            val nextFrame = bufferedBinaryFrames.removeFirst()
            recordBufferedFrameCountSampleLocked()
            return nextFrame
        }
    }

    private fun hasBufferedBinaryFrames(): Boolean {
        synchronized(bufferedBinaryFramesLock) {
            return bufferedBinaryFrames.isNotEmpty()
        }
    }

    private fun recordBufferedFrameCountSampleLocked() {
        val bufferSize = bufferedBinaryFrames.size.toLong()
        lastBufferedFrameCount.set(bufferSize)
        totalBufferedFrameCount.addAndGet(bufferSize)
        bufferedFrameSampleCount.incrementAndGet()
        updateMaxValue(maxBufferedFrameCount, bufferSize)
    }

    private fun recordDecodeIdleGapIfNeeded(
        decodeStartedNanos: Long,
    ): Long? {
        val idleStartedAtNanos = bufferNonEmptyWhileDecodeIdleSinceNanos.getAndSet(0L)
        if (idleStartedAtNanos <= 0L) {
            return null
        }
        val decodeIdleGapNanos = (decodeStartedNanos - idleStartedAtNanos).coerceAtLeast(0L)
        recordDurationSample(
            lastValue = lastDecodeIdleGapNanos,
            totalValue = totalDecodeIdleGapNanos,
            maxValue = maxDecodeIdleGapNanos,
            durationNanos = decodeIdleGapNanos,
        )
        decodeIdleGapSampleCount.incrementAndGet()
        return decodeIdleGapNanos
    }

    private class PresentPathMetricsTracker {
        private val lock = Any()
        private val eyeMetricsByEye = mutableMapOf(
            StereoEye.Left to EyePresentPathMetrics(),
            StereoEye.Right to EyePresentPathMetrics(),
        )
        private val pendingReceivePairs = LinkedHashMap<Long, StereoPairTiming>()
        private val pendingPresentPairs = LinkedHashMap<Long, StereoPairTiming>()
        private val presenterReceiveSkewStats = RunningDurationStats()
        private val presentSkewStats = RunningDurationStats()

        fun reset() {
            synchronized(lock) {
                eyeMetricsByEye.values.forEach(EyePresentPathMetrics::reset)
                pendingReceivePairs.clear()
                pendingPresentPairs.clear()
                presenterReceiveSkewStats.reset()
                presentSkewStats.reset()
            }
        }

        fun uiSnapshot(): PresentPathUiSnapshot {
            synchronized(lock) {
                val leftMetrics = eyeMetricsByEye.getValue(StereoEye.Left)
                val rightMetrics = eyeMetricsByEye.getValue(StereoEye.Right)
                return PresentPathUiSnapshot(
                    presentationFps = averageFloat(leftMetrics.lastPresentFps, rightMetrics.lastPresentFps),
                    presentationLatencyMs = averageFloat(
                        leftMetrics.decodeToPresentStats.averageMs(),
                        rightMetrics.decodeToPresentStats.averageMs(),
                    ),
                    receiveToPresentationLatencyMs = averageFloat(
                        leftMetrics.receiveToPresentStats.averageMs(),
                        rightMetrics.receiveToPresentStats.averageMs(),
                    ),
                )
            }
        }

        fun currentLagAnchorFrameId(): Long {
            synchronized(lock) {
                val leftPresentedFrameId = eyeMetricsByEye.getValue(StereoEye.Left).lastPresentedFrameId
                val rightPresentedFrameId = eyeMetricsByEye.getValue(StereoEye.Right).lastPresentedFrameId
                return when {
                    leftPresentedFrameId >= 0L && rightPresentedFrameId >= 0L -> {
                        minOf(leftPresentedFrameId, rightPresentedFrameId)
                    }
                    leftPresentedFrameId >= 0L -> leftPresentedFrameId
                    rightPresentedFrameId >= 0L -> rightPresentedFrameId
                    else -> -1L
                }
            }
        }

        fun recordPresenterReceive(event: StereoEyePresenterReceiveEvent) {
            synchronized(lock) {
                val eyeMetrics = eyeMetricsByEye.getValue(event.eye)
                eyeMetrics.receivedCount += 1L
                eyeMetrics.lastReceiveFps = eyeMetrics.receiveRateMeter.mark(
                    nowMs = event.presenterReceivedAtElapsedNanos / 1_000_000L,
                )
                val previousReceivedFrameId = eyeMetrics.lastReceivedFrameId
                if (previousReceivedFrameId >= 0L && event.frameId > previousReceivedFrameId + 1L) {
                    eyeMetrics.receiveGapFrameCount += event.frameId - previousReceivedFrameId - 1L
                }
                eyeMetrics.lastReceivedFrameId = event.frameId
                eyeMetrics.publishToPresenterStats.record(
                    (event.presenterReceivedAtElapsedNanos - event.frameStatePublishedAtElapsedNanos)
                        .coerceAtLeast(0L),
                )
                if (event.supersededPendingFrame) {
                    eyeMetrics.supersededPendingFrameCount += 1L
                }
                recordStereoPairTiming(
                    pendingPairs = pendingReceivePairs,
                    stats = presenterReceiveSkewStats,
                    frameId = event.frameId,
                    eye = event.eye,
                    timestampNanos = event.presenterReceivedAtElapsedNanos,
                )
            }
        }

        fun recordFramePresented(event: StereoEyeFramePresentedEvent) {
            synchronized(lock) {
                val eyeMetrics = eyeMetricsByEye.getValue(event.eye)
                eyeMetrics.presentCount += 1L
                eyeMetrics.lastPresentFps = eyeMetrics.presentRateMeter.mark(
                    nowMs = event.presentedAtElapsedNanos / 1_000_000L,
                )
                val previousPresentedFrameId = eyeMetrics.lastPresentedFrameId
                if (previousPresentedFrameId >= 0L && event.frameId > previousPresentedFrameId + 1L) {
                    eyeMetrics.presentGapFrameCount += event.frameId - previousPresentedFrameId - 1L
                }
                eyeMetrics.lastPresentedFrameId = event.frameId
                if (eyeMetrics.lastPresentedAtElapsedNanos > 0L) {
                    val presentIntervalNanos = (
                        event.presentedAtElapsedNanos - eyeMetrics.lastPresentedAtElapsedNanos
                    ).coerceAtLeast(0L)
                    eyeMetrics.presentIntervalStats.record(presentIntervalNanos)
                    if (presentIntervalNanos >= PRESENT_STALL_THRESHOLD_NANOS) {
                        eyeMetrics.presentStallCount += 1L
                        if ((event.preDecodeQueueWaitNanos ?: 0L) >= QUEUE_SPIKE_CORRELATION_THRESHOLD_NANOS) {
                            eyeMetrics.presentStallsWithQueueSpike += 1L
                        }
                        if ((event.decodeIdleGapNanos ?: 0L) >= IDLE_GAP_CORRELATION_THRESHOLD_NANOS) {
                            eyeMetrics.presentStallsWithDecodeIdleGap += 1L
                        }
                    }
                }
                eyeMetrics.lastPresentedAtElapsedNanos = event.presentedAtElapsedNanos
                eyeMetrics.frameReadyToLockStats.record(
                    (event.lockStartedAtElapsedNanos - event.frameStatePublishedAtElapsedNanos)
                        .coerceAtLeast(0L),
                )
                eyeMetrics.presenterToLockStats.record(
                    (event.lockStartedAtElapsedNanos - event.presenterReceivedAtElapsedNanos)
                        .coerceAtLeast(0L),
                )
                eyeMetrics.lockCanvasStats.record(
                    (event.lockCompletedAtElapsedNanos - event.lockStartedAtElapsedNanos)
                        .coerceAtLeast(0L),
                )
                eyeMetrics.drawStats.record(
                    (event.unlockStartedAtElapsedNanos - event.lockCompletedAtElapsedNanos)
                        .coerceAtLeast(0L),
                )
                eyeMetrics.unlockAndPostStats.record(
                    (event.unlockCompletedAtElapsedNanos - event.unlockStartedAtElapsedNanos)
                        .coerceAtLeast(0L),
                )
                eyeMetrics.callbackStats.record(
                    (event.presentedAtElapsedNanos - event.unlockCompletedAtElapsedNanos)
                        .coerceAtLeast(0L),
                )
                eyeMetrics.presenterToPresentStats.record(
                    (event.presentedAtElapsedNanos - event.presenterReceivedAtElapsedNanos)
                        .coerceAtLeast(0L),
                )
                eyeMetrics.decodeToPresentStats.record(
                    (event.presentedAtElapsedNanos - event.decodedAtElapsedNanos)
                        .coerceAtLeast(0L),
                )
                eyeMetrics.receiveToPresentStats.record(
                    (event.presentedAtElapsedNanos - event.receivedAtElapsedNanos)
                        .coerceAtLeast(0L),
                )
                recordStereoPairTiming(
                    pendingPairs = pendingPresentPairs,
                    stats = presentSkewStats,
                    frameId = event.frameId,
                    eye = event.eye,
                    timestampNanos = event.presentedAtElapsedNanos,
                )
            }
        }

        fun formatEyeSummary(eye: StereoEye): String {
            synchronized(lock) {
                val eyeMetrics = eyeMetricsByEye.getValue(eye)
                return "recv/present=${eyeMetrics.receivedCount}/${eyeMetrics.presentCount} " +
                    "gaps=${eyeMetrics.receiveGapFrameCount}/${eyeMetrics.presentGapFrameCount} " +
                    "ready=${eyeMetrics.readyNotPresentedCount()} " +
                    "superseded=${eyeMetrics.supersededPendingFrameCount} " +
                    "fps=${formatMetric(eyeMetrics.lastReceiveFps)}/${formatMetric(eyeMetrics.lastPresentFps)} " +
                    "publishToPresenterMs=${eyeMetrics.publishToPresenterStats.summary()} " +
                    "frameReadyToLockMs=${eyeMetrics.frameReadyToLockStats.summary()} " +
                    "presenterToPresentMs=${eyeMetrics.presenterToPresentStats.summary()} " +
                    "decodeToPresentMs=${eyeMetrics.decodeToPresentStats.summary()} " +
                    "receiveToPresentMs=${eyeMetrics.receiveToPresentStats.summary()} " +
                    "stagesMs=q:${eyeMetrics.presenterToLockStats.summary()}," +
                    "lock:${eyeMetrics.lockCanvasStats.summary()}," +
                    "draw:${eyeMetrics.drawStats.summary()}," +
                    "post:${eyeMetrics.unlockAndPostStats.summary()}," +
                    "cb:${eyeMetrics.callbackStats.summary()} " +
                    "intervalMs=${eyeMetrics.presentIntervalStats.summary()} " +
                    "hist=${eyeMetrics.presentIntervalStats.histogramSummary()} " +
                    "lock=${eyeMetrics.presentIntervalStats.quantizationSummary()} " +
                    "stalls=${eyeMetrics.presentStallCount}(" +
                    "q=${eyeMetrics.presentStallsWithQueueSpike}," +
                    "idle=${eyeMetrics.presentStallsWithDecodeIdleGap})"
            }
        }

        fun formatStereoPairSummary(): String {
            synchronized(lock) {
                return "receiveSkewMs=${presenterReceiveSkewStats.summary()} " +
                    "presentSkewMs=${presentSkewStats.summary()}"
            }
        }

        private fun recordStereoPairTiming(
            pendingPairs: LinkedHashMap<Long, StereoPairTiming>,
            stats: RunningDurationStats,
            frameId: Long,
            eye: StereoEye,
            timestampNanos: Long,
        ) {
            val timing = pendingPairs.getOrPut(frameId) { StereoPairTiming() }
            when (eye) {
                StereoEye.Left -> timing.leftAtElapsedNanos = timestampNanos
                StereoEye.Right -> timing.rightAtElapsedNanos = timestampNanos
            }
            val leftAtElapsedNanos = timing.leftAtElapsedNanos
            val rightAtElapsedNanos = timing.rightAtElapsedNanos
            if (leftAtElapsedNanos != null && rightAtElapsedNanos != null) {
                stats.record(abs(leftAtElapsedNanos - rightAtElapsedNanos))
                pendingPairs.remove(frameId)
            } else if (pendingPairs.size > MAX_PENDING_STEREO_PAIR_SAMPLES) {
                val oldestFrameId = pendingPairs.entries.firstOrNull()?.key
                if (oldestFrameId != null) {
                    pendingPairs.remove(oldestFrameId)
                }
            }
        }
    }

    private class EyePresentPathMetrics {
        val receiveRateMeter = FrameRateMeter()
        val presentRateMeter = FrameRateMeter()
        val publishToPresenterStats = RunningDurationStats()
        val frameReadyToLockStats = RunningDurationStats()
        val presenterToLockStats = RunningDurationStats()
        val lockCanvasStats = RunningDurationStats()
        val drawStats = RunningDurationStats()
        val unlockAndPostStats = RunningDurationStats()
        val callbackStats = RunningDurationStats()
        val presenterToPresentStats = RunningDurationStats()
        val decodeToPresentStats = RunningDurationStats()
        val receiveToPresentStats = RunningDurationStats()
        val presentIntervalStats = IntervalJitterStats()
        var receivedCount: Long = 0L
        var presentCount: Long = 0L
        var receiveGapFrameCount: Long = 0L
        var presentGapFrameCount: Long = 0L
        var supersededPendingFrameCount: Long = 0L
        var presentStallCount: Long = 0L
        var presentStallsWithQueueSpike: Long = 0L
        var presentStallsWithDecodeIdleGap: Long = 0L
        var lastReceivedFrameId: Long = -1L
        var lastPresentedFrameId: Long = -1L
        var lastPresentedAtElapsedNanos: Long = 0L
        var lastReceiveFps: Float? = null
        var lastPresentFps: Float? = null

        fun reset() {
            receiveRateMeter.reset()
            presentRateMeter.reset()
            publishToPresenterStats.reset()
            frameReadyToLockStats.reset()
            presenterToLockStats.reset()
            lockCanvasStats.reset()
            drawStats.reset()
            unlockAndPostStats.reset()
            callbackStats.reset()
            presenterToPresentStats.reset()
            decodeToPresentStats.reset()
            receiveToPresentStats.reset()
            presentIntervalStats.reset()
            receivedCount = 0L
            presentCount = 0L
            receiveGapFrameCount = 0L
            presentGapFrameCount = 0L
            supersededPendingFrameCount = 0L
            presentStallCount = 0L
            presentStallsWithQueueSpike = 0L
            presentStallsWithDecodeIdleGap = 0L
            lastReceivedFrameId = -1L
            lastPresentedFrameId = -1L
            lastPresentedAtElapsedNanos = 0L
            lastReceiveFps = null
            lastPresentFps = null
        }

        fun readyNotPresentedCount(): Long {
            return (receivedCount - presentCount).coerceAtLeast(0L)
        }
    }

    private data class StereoPairTiming(
        var leftAtElapsedNanos: Long? = null,
        var rightAtElapsedNanos: Long? = null,
    )

    private class RunningDurationStats {
        private var lastNanos: Long = 0L
        private var totalNanos: Long = 0L
        private var maxNanos: Long = 0L
        private var sampleCount: Long = 0L

        fun reset() {
            lastNanos = 0L
            totalNanos = 0L
            maxNanos = 0L
            sampleCount = 0L
        }

        fun record(durationNanos: Long) {
            lastNanos = durationNanos
            totalNanos += durationNanos
            maxNanos = maxOf(maxNanos, durationNanos)
            sampleCount += 1L
        }

        fun summary(): String {
            return formatDurationSummary(
                lastNanos = lastNanos,
                totalNanos = totalNanos,
                maxNanos = maxNanos,
                sampleCount = sampleCount,
            )
        }

        fun averageMs(): Float? {
            if (sampleCount <= 0L) {
                return null
            }
            return nanosToMilliseconds(totalNanos / sampleCount)
        }
    }

    private class IntervalJitterStats {
        private val histogram = LinkedHashMap<Int, Long>()
        private var lastNanos: Long = 0L
        private var totalNanos: Long = 0L
        private var sampleCount: Long = 0L
        private var meanNanos: Double = 0.0
        private var m2Nanos: Double = 0.0

        fun reset() {
            histogram.clear()
            lastNanos = 0L
            totalNanos = 0L
            sampleCount = 0L
            meanNanos = 0.0
            m2Nanos = 0.0
        }

        fun record(intervalNanos: Long) {
            lastNanos = intervalNanos
            totalNanos += intervalNanos
            sampleCount += 1L
            val delta = intervalNanos.toDouble() - meanNanos
            meanNanos += delta / sampleCount.toDouble()
            val deltaAfterMeanUpdate = intervalNanos.toDouble() - meanNanos
            m2Nanos += delta * deltaAfterMeanUpdate
            val bucketMs = nanosToMilliseconds(intervalNanos)
                .roundToInt()
                .coerceAtLeast(0)
                .coerceAtMost(PRESENT_INTERVAL_HISTOGRAM_MAX_BUCKET_MS)
            histogram[bucketMs] = (histogram[bucketMs] ?: 0L) + 1L
        }

        fun summary(): String {
            if (sampleCount <= 0L) {
                return "--"
            }
            val averageNanos = totalNanos / sampleCount
            return "${formatMetric(nanosToMilliseconds(lastNanos))}/" +
                "${formatMetric(nanosToMilliseconds(averageNanos))}/" +
                "${formatMetric(jitterStdDevMs())}"
        }

        fun histogramSummary(): String {
            if (histogram.isEmpty()) {
                return "--"
            }
            return histogram.entries
                .sortedByDescending { entry -> entry.value }
                .take(3)
                .joinToString(",") { entry ->
                    "${formatBucketLabel(entry.key)}=${entry.value}"
                }
        }

        fun quantizationSummary(): String {
            if (histogram.isEmpty() || sampleCount <= 0L) {
                return "--"
            }
            val dominantBucket = histogram.maxByOrNull { entry -> entry.value } ?: return "--"
            val dominantClusterCount = histogram.entries.sumOf { entry ->
                if (abs(entry.key - dominantBucket.key) <= 1) {
                    entry.value
                } else {
                    0L
                }
            }
            val dominantClusterPercent = (dominantClusterCount * 100f) / sampleCount.toFloat()
            return "${formatBucketLabel(dominantBucket.key)}@" +
                String.format(Locale.US, "%.0f%%", dominantClusterPercent)
        }

        private fun jitterStdDevMs(): Float? {
            if (sampleCount <= 1L) {
                return null
            }
            val varianceNanos = m2Nanos / (sampleCount - 1L).toDouble()
            return (sqrt(varianceNanos) / 1_000_000.0).toFloat()
        }

        private fun formatBucketLabel(bucketMs: Int): String {
            return if (bucketMs >= PRESENT_INTERVAL_HISTOGRAM_MAX_BUCKET_MS) {
                "${PRESENT_INTERVAL_HISTOGRAM_MAX_BUCKET_MS}+ms"
            } else {
                "${bucketMs}ms"
            }
        }
    }

    private fun formatBufferSizeSummary(): String {
        val sampleCount = bufferedFrameSampleCount.get()
        if (sampleCount <= 0L) {
            return "--"
        }
        val averageBufferSize = totalBufferedFrameCount.get().toFloat() / sampleCount.toFloat()
        return "${lastBufferedFrameCount.get()}/" +
            String.format(Locale.US, "%.2f", averageBufferSize) +
            "/${maxBufferedFrameCount.get()}"
    }
}

private fun nanosToMilliseconds(value: Long): Float = value / 1_000_000f

private fun formatMetric(value: Float?): String {
    return value?.let { metric ->
        String.format(Locale.US, "%.2f", metric)
    } ?: "--"
}

private fun formatBitmapReuse(stats: BitmapReuseStats): String {
    val hitRatePercent = stats.reuseHitRatePercent
    return if (hitRatePercent != null) {
        String.format(
            Locale.US,
            "%.1f%% (%d/%d, fallback=%d)",
            hitRatePercent,
            stats.reuseHitCount,
            stats.reuseAttemptCount,
            stats.reuseFallbackCount,
        )
    } else {
        "warming (${stats.decodeCount} decodes)"
    }
}

private fun recordDurationSample(
    lastValue: AtomicLong,
    totalValue: AtomicLong,
    maxValue: AtomicLong,
    durationNanos: Long,
) {
    lastValue.set(durationNanos)
    totalValue.addAndGet(durationNanos)
    updateMaxValue(maxValue, durationNanos)
}

private fun updateMaxValue(
    maxValue: AtomicLong,
    candidate: Long,
) {
    while (true) {
        val currentMax = maxValue.get()
        if (candidate <= currentMax) {
            return
        }
        if (maxValue.compareAndSet(currentMax, candidate)) {
            return
        }
    }
}

private fun formatDurationSummary(
    lastValue: AtomicLong,
    totalValue: AtomicLong,
    maxValue: AtomicLong,
    sampleCount: AtomicLong,
): String {
    val count = sampleCount.get()
    if (count <= 0L) {
        return "--"
    }
    val averageNanos = totalValue.get() / count
    return "${formatMetric(nanosToMilliseconds(lastValue.get()))}/" +
        "${formatMetric(nanosToMilliseconds(averageNanos))}/" +
        "${formatMetric(nanosToMilliseconds(maxValue.get()))}"
}

private fun formatDurationSummary(
    lastNanos: Long,
    totalNanos: Long,
    maxNanos: Long,
    sampleCount: Long,
): String {
    if (sampleCount <= 0L) {
        return "--"
    }
    val averageNanos = totalNanos / sampleCount
    return "${formatMetric(nanosToMilliseconds(lastNanos))}/" +
        "${formatMetric(nanosToMilliseconds(averageNanos))}/" +
        "${formatMetric(nanosToMilliseconds(maxNanos))}"
}

private fun averageFloat(
    first: Float?,
    second: Float?,
): Float? {
    return when {
        first != null && second != null -> (first + second) / 2f
        first != null -> first
        second != null -> second
        else -> null
    }
}

private fun humanizeToken(raw: String): String {
    return raw
        .replace('_', ' ')
        .lowercase()
        .split(' ')
        .filter(String::isNotBlank)
        .joinToString(" ") { token ->
            token.replaceFirstChar { first ->
                if (first.isLowerCase()) {
                    first.titlecase()
                } else {
                    first.toString()
                }
            }
        }
}
