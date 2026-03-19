package com.nevex.xr.nativeapp.thermal

import android.graphics.BitmapFactory
import android.os.SystemClock
import android.util.Log
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.job
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okio.BufferedSource
import okio.ByteString.Companion.decodeHex
import org.json.JSONObject

private const val THERMAL_LOG_TAG = "NevexXrThermal"
private const val THERMAL_STREAM_PORT = 8092
private const val THERMAL_METADATA_POLL_INTERVAL_MS = 3_000L
private const val THERMAL_RECONNECT_DELAY_MS = 1_500L

class ThermalRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val host = MutableStateFlow("")
    private val streamingEnabled = MutableStateFlow(false)
    private val streamClient = OkHttpClient.Builder()
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .retryOnConnectionFailure(true)
        .build()
    private val metadataClient = streamClient.newBuilder()
        .readTimeout(3, TimeUnit.SECONDS)
        .callTimeout(5, TimeUnit.SECONDS)
        .build()
    private val jpegStartMarker = "ffd8".decodeHex()
    private val jpegEndMarker = "ffd9".decodeHex()
    private val decodeOptions = BitmapFactory.Options().apply {
        inScaled = false
    }

    private val _snapshot = MutableStateFlow(ThermalStreamSnapshot())
    val snapshot: StateFlow<ThermalStreamSnapshot> = _snapshot

    init {
        observeStreamingConfiguration()
        launchMetadataPolling()
    }

    fun updateHost(nextHost: String) {
        val normalizedHost = nextHost.trim()
        host.value = normalizedHost
        _snapshot.update { currentSnapshot ->
            currentSnapshot.copy(host = normalizedHost.ifEmpty { null })
        }
    }

    fun setStreamingEnabled(enabled: Boolean) {
        streamingEnabled.value = enabled
        _snapshot.update { currentSnapshot ->
            currentSnapshot.copy(streamingEnabled = enabled)
        }
    }

    fun close() {
        scope.cancel()
    }

    private fun observeStreamingConfiguration() {
        scope.launch {
            combine(host, streamingEnabled) { currentHost, streamEnabled ->
                currentHost.trim() to streamEnabled
            }
                .distinctUntilChanged()
                .collectLatest { (currentHost, streamEnabled) ->
                    _snapshot.update { currentSnapshot ->
                        currentSnapshot.copy(
                            host = currentHost.ifEmpty { null },
                            streamingEnabled = streamEnabled,
                        )
                    }
                    if (!streamEnabled || currentHost.isEmpty()) {
                        _snapshot.update { currentSnapshot ->
                            currentSnapshot.copy(
                                connected = false,
                                healthy = false,
                                frameBitmap = null,
                                lastError = if (streamEnabled && currentHost.isEmpty()) {
                                    "Thermal host not set"
                                } else {
                                    null
                                },
                                lastFrameAtElapsedNanos = null,
                            )
                        }
                        return@collectLatest
                    }

                    Log.i(THERMAL_LOG_TAG, "Thermal stream requested for host $currentHost")
                    streamThermalFrames(currentHost)
                }
        }
    }

    private suspend fun streamThermalFrames(currentHost: String) {
        while (currentCoroutineContext().isActive) {
            try {
                val request = Request.Builder()
                    .url(buildStreamUrl(currentHost))
                    .get()
                    .build()
                val call = streamClient.newCall(request)
                val completionHandle = currentCoroutineContext().job.invokeOnCompletion {
                    call.cancel()
                }
                _snapshot.update { currentSnapshot ->
                    currentSnapshot.copy(
                        connected = false,
                        healthy = false,
                        lastError = null,
                    )
                }
                try {
                    call.execute().use { response ->
                        if (!response.isSuccessful) {
                            throw IOException("Thermal stream HTTP ${response.code}")
                        }
                        val body = response.body ?: throw IOException("Thermal stream response body missing")
                        val source = body.source()
                        var loggedFirstFrame = false
                        Log.i(THERMAL_LOG_TAG, "Thermal MJPEG stream connected for host $currentHost")
                        _snapshot.update { currentSnapshot ->
                            currentSnapshot.copy(
                                connected = true,
                                healthy = false,
                                lastError = null,
                            )
                        }
                        while (currentCoroutineContext().isActive) {
                            val frameBytes = readNextJpegFrame(source) ?: break
                            val bitmap = BitmapFactory.decodeByteArray(
                                frameBytes,
                                0,
                                frameBytes.size,
                                decodeOptions,
                            ) ?: continue
                            val receivedAtElapsedNanos = SystemClock.elapsedRealtimeNanos()
                            if (!loggedFirstFrame) {
                                loggedFirstFrame = true
                                Log.i(
                                    THERMAL_LOG_TAG,
                                    "Thermal live frame decoded (${bitmap.width}x${bitmap.height})",
                                )
                            }
                            _snapshot.update { currentSnapshot ->
                                currentSnapshot.copy(
                                    connected = true,
                                    healthy = true,
                                    frameBitmap = bitmap,
                                    lastError = null,
                                    lastFrameAtElapsedNanos = receivedAtElapsedNanos,
                                )
                            }
                        }
                    }
                } finally {
                    completionHandle.dispose()
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Exception) {
                Log.w(
                    THERMAL_LOG_TAG,
                    "Thermal stream unavailable for host $currentHost: ${exception.message}",
                )
                _snapshot.update { currentSnapshot ->
                    currentSnapshot.copy(
                        connected = false,
                        healthy = false,
                        frameBitmap = null,
                        lastError = exception.message ?: "Thermal stream unavailable",
                        lastFrameAtElapsedNanos = null,
                    )
                }
                delay(THERMAL_RECONNECT_DELAY_MS)
            }
        }
    }

    private fun launchMetadataPolling() {
        scope.launch {
            while (currentCoroutineContext().isActive) {
                val currentHost = host.value.trim()
                if (currentHost.isNotEmpty()) {
                    try {
                        val metadata = fetchMetadata(currentHost)
                        _snapshot.update { currentSnapshot ->
                            currentSnapshot.copy(metadata = metadata)
                        }
                    } catch (exception: CancellationException) {
                        throw exception
                    } catch (exception: Exception) {
                        Log.w(
                            THERMAL_LOG_TAG,
                            "Thermal metadata unavailable for host $currentHost: ${exception.message}",
                        )
                        _snapshot.update { currentSnapshot ->
                            currentSnapshot.copy(
                                metadata = currentSnapshot.metadata,
                                lastError = if (currentSnapshot.connected) {
                                    currentSnapshot.lastError
                                } else {
                                    exception.message ?: "Thermal metadata unavailable"
                                },
                            )
                        }
                    }
                }
                delay(THERMAL_METADATA_POLL_INTERVAL_MS)
            }
        }
    }

    private fun fetchMetadata(currentHost: String): ThermalMetadata {
        val request = Request.Builder()
            .url(buildMetadataUrl(currentHost))
            .get()
            .build()
        metadataClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Thermal metadata HTTP ${response.code}")
            }
            val responseBody = response.body?.string()
                ?: throw IOException("Thermal metadata response body missing")
            val jsonObject = JSONObject(responseBody)
            return ThermalMetadata(
                minCelsius = jsonObject.optFloatOrNull("minCelsius"),
                maxCelsius = jsonObject.optFloatOrNull("maxCelsius"),
                avgCelsius = jsonObject.optFloatOrNull("avgCelsius"),
                centerCelsius = jsonObject.optFloatOrNull("centerCelsius"),
                captureFpsObserved = jsonObject.optFloatOrNull("captureFpsObserved"),
            )
        }
    }

    private fun readNextJpegFrame(source: BufferedSource): ByteArray? {
        val startOffset = source.indexOf(jpegStartMarker)
        if (startOffset < 0L) {
            return null
        }
        if (startOffset > 0L) {
            source.skip(startOffset)
        }
        val endOffset = source.indexOf(jpegEndMarker, fromIndex = 2L)
        if (endOffset < 0L) {
            return null
        }
        return source.readByteArray(endOffset + 2L)
    }

    private fun buildStreamUrl(currentHost: String): String {
        return "http://$currentHost:$THERMAL_STREAM_PORT/stream.mjpeg?palette=grayscale"
    }

    private fun buildMetadataUrl(currentHost: String): String {
        return "http://$currentHost:$THERMAL_STREAM_PORT/meta.json"
    }
}

private fun JSONObject.optFloatOrNull(key: String): Float? {
    if (!has(key) || isNull(key)) {
        return null
    }
    return optDouble(key).toFloat()
}
