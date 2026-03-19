package com.nevex.xr.nativeapp.calibration

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
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

private const val CALIBRATION_LOG_TAG = "NevexXrCalibration"
private const val CALIBRATION_SERVER_PORT = 8094
private const val CALIBRATION_POLL_INTERVAL_MS = 600L

private data class CalibrationHealthResponse(
    val statusText: String? = null,
    val overlapReadinessState: String? = null,
)

class CalibrationRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val host = MutableStateFlow("")
    private val pollingEnabled = MutableStateFlow(false)
    private val client = OkHttpClient.Builder()
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(3, TimeUnit.SECONDS)
        .callTimeout(4, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private val _snapshot = MutableStateFlow(CalibrationServiceSnapshot())
    val snapshot: StateFlow<CalibrationServiceSnapshot> = _snapshot

    init {
        observeConfiguration()
    }

    fun updateHost(nextHost: String) {
        val normalizedHost = nextHost.trim()
        host.value = normalizedHost
        _snapshot.update { currentSnapshot ->
            currentSnapshot.copy(host = normalizedHost.ifEmpty { null })
        }
    }

    fun setPollingEnabled(enabled: Boolean) {
        pollingEnabled.value = enabled
        _snapshot.update { currentSnapshot ->
            currentSnapshot.copy(pollingEnabled = enabled)
        }
    }

    fun close() {
        scope.cancel()
    }

    private fun observeConfiguration() {
        scope.launch {
            combine(host, pollingEnabled) { currentHost, currentPollingEnabled ->
                currentHost.trim() to currentPollingEnabled
            }
                .distinctUntilChanged()
                .collectLatest { (currentHost, currentPollingEnabled) ->
                    _snapshot.update { currentSnapshot ->
                        currentSnapshot.copy(
                            host = currentHost.ifEmpty { null },
                            pollingEnabled = currentPollingEnabled,
                        )
                    }
                    if (!currentPollingEnabled || currentHost.isEmpty()) {
                        _snapshot.update { currentSnapshot ->
                            currentSnapshot.copy(
                                backendAvailable = false,
                                healthOk = false,
                                healthMessage = if (currentPollingEnabled && currentHost.isEmpty()) {
                                    "Calibration host not set"
                                } else {
                                    null
                                },
                                healthOverlapReadinessState = null,
                                lastError = null,
                                status = CalibrationStatusSnapshot(),
                                result = null,
                            )
                        }
                        return@collectLatest
                    }

                    Log.i(CALIBRATION_LOG_TAG, "Calibration polling enabled for host $currentHost")
                    pollCalibration(currentHost)
                }
        }
    }

    private suspend fun pollCalibration(
        currentHost: String,
    ) {
        while (currentCoroutineContext().isActive) {
            try {
                val healthResponse = fetchHealthz(currentHost)
                val statusSnapshot = fetchStatus(currentHost)
                val resultSnapshot = fetchResult(currentHost)

                _snapshot.update { currentSnapshot ->
                    currentSnapshot.copy(
                        backendAvailable = true,
                        healthOk = true,
                        healthMessage = healthResponse.statusText,
                        healthOverlapReadinessState = healthResponse.overlapReadinessState,
                        lastError = null,
                        status = statusSnapshot,
                        result = resultSnapshot,
                    )
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Exception) {
                Log.w(
                    CALIBRATION_LOG_TAG,
                    "Calibration backend unavailable for host $currentHost: ${exception.message}",
                )
                _snapshot.update { currentSnapshot ->
                    currentSnapshot.copy(
                        backendAvailable = false,
                        healthOk = false,
                        healthMessage = null,
                        healthOverlapReadinessState = null,
                        lastError = exception.message ?: "Calibration backend unavailable",
                        status = CalibrationStatusSnapshot(),
                        result = null,
                    )
                }
            }

            delay(CALIBRATION_POLL_INTERVAL_MS)
        }
    }

    private fun fetchHealthz(
        currentHost: String,
    ): CalibrationHealthResponse {
        val request = Request.Builder()
            .url(buildUrl(currentHost, "healthz"))
            .get()
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Calibration health HTTP ${response.code}")
            }
            val responseBody = response.body?.string()?.trim()
            if (responseBody.isNullOrBlank()) {
                return CalibrationHealthResponse(statusText = "ok")
            }
            return if (responseBody.startsWith("{")) {
                val jsonObject = JSONObject(responseBody)
                CalibrationHealthResponse(
                    statusText = jsonObject.optString("status")
                        .takeIf { it.isNotBlank() }
                        ?: if (jsonObject.optBoolean("ok", true)) "ok" else "unhealthy",
                    overlapReadinessState = jsonObject.optStringOrNull("overlapReadinessState"),
                )
            } else {
                CalibrationHealthResponse(statusText = responseBody)
            }
        }
    }

    private fun fetchStatus(
        currentHost: String,
    ): CalibrationStatusSnapshot {
        val request = Request.Builder()
            .url(buildUrl(currentHost, "status.json"))
            .get()
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Calibration status HTTP ${response.code}")
            }
            val responseBody = response.body?.string()
                ?: throw IOException("Calibration status body missing")
            val jsonObject = JSONObject(responseBody)
            val overlapReadiness = jsonObject.optJSONObject("overlapReadiness")
                ?.toCalibrationOverlapReadiness(
                    fallbackState = jsonObject.optStringOrNull("overlapReadinessState"),
                )
            return CalibrationStatusSnapshot(
                calibrationState = CalibrationBackendState.fromWireValue(
                    jsonObject.optString("calibrationState"),
                ),
                calibrationStateNote = jsonObject.optStringOrNull("calibrationStateNote"),
                overlapReadinessState = jsonObject.optStringOrNull("overlapReadinessState")
                    ?: overlapReadiness?.state,
                overlapReadiness = overlapReadiness,
                readinessSummary = overlapReadiness?.summary
                    ?: jsonObject.optSummaryString("readiness")
                    ?: jsonObject.optStringOrNull("readinessNote")
                    ?: jsonObject.optStringOrNull("calibrationStateNote"),
                sampleQualitySummary = jsonObject.optSummaryString("sampleQuality"),
                matchedSampleCount = jsonObject.optInt("matchedSampleCount", 0),
                rejectedSampleCount = jsonObject.optInt("rejectedSampleCount", 0),
                rejectedSamplesByReason = jsonObject.optIntMap("rejectedSamplesByReason"),
                solveAttemptCount = jsonObject.optInt("solveAttemptCount", 0),
                solveSuccessCount = jsonObject.optInt("solveSuccessCount", 0),
                solveValid = jsonObject.optBoolean("solveValid", false),
                published = jsonObject.optBoolean("published", false),
                candidateTransform = jsonObject.optJSONObject("candidateTransform")
                    ?.toCalibrationCandidateResult(),
            )
        }
    }

    private fun fetchResult(
        currentHost: String,
    ): CalibrationCandidateResult {
        val request = Request.Builder()
            .url(buildUrl(currentHost, "result.json"))
            .get()
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Calibration result HTTP ${response.code}")
            }
            val responseBody = response.body?.string()
                ?: throw IOException("Calibration result body missing")
            return JSONObject(responseBody).toCalibrationCandidateResult()
        }
    }

    private fun buildUrl(
        currentHost: String,
        endpointPath: String,
    ): String {
        return "http://$currentHost:$CALIBRATION_SERVER_PORT/$endpointPath"
    }
}

private fun JSONObject.toCalibrationCandidateResult(): CalibrationCandidateResult {
    return CalibrationCandidateResult(
        ok = optBooleanOrNull("ok"),
        offsetX = optFloatOrNull("offsetX"),
        offsetY = optFloatOrNull("offsetY"),
        scale = optFloatOrNull("scale"),
        visibleWidthPx = optIntFromKeys("visibleWidthPx", "visibleWidth", "previewWidth", "imageWidth"),
        visibleHeightPx = optIntFromKeys("visibleHeightPx", "visibleHeight", "previewHeight", "imageHeight"),
        confidence = optFloatOrNull("confidence"),
        residualRmsePx = optFloatOrNull("residualRmsePx"),
        matchedSampleCount = optIntOrNull("matchedSampleCount"),
        solveValid = optBoolean("solveValid", false),
        published = optBoolean("published", false),
        overlapReadinessState = optStringOrNull("overlapReadinessState"),
        overlapReadinessSummary = optStringOrNull("overlapReadinessSummary")
            ?: optSummaryString("overlapReadiness"),
    )
}

private fun JSONObject.toCalibrationOverlapReadiness(
    fallbackState: String? = null,
): CalibrationOverlapReadiness {
    return CalibrationOverlapReadiness(
        state = optStringOrNull("state")
            ?: optStringOrNull("overlapReadinessState")
            ?: fallbackState,
        physicallyViable = optBooleanOrNull("physicallyViable"),
        blockingFactors = optStringList("blockingFactors"),
        recommendedAction = optStringOrNull("recommendedAction"),
        summary = optSummaryString("summary")
            ?: optStringOrNull("note")
            ?: optStringOrNull("recommendedAction"),
        checks = optStringMap("checks"),
    )
}

private fun JSONObject.optStringOrNull(
    key: String,
): String? {
    val value = optString(key)
    return value.takeIf { it.isNotBlank() }
}

private fun JSONObject.optIntOrNull(
    key: String,
): Int? {
    if (!has(key) || isNull(key)) {
        return null
    }
    return optInt(key)
}

private fun JSONObject.optIntFromKeys(
    vararg keys: String,
): Int? {
    keys.forEach { key ->
        val value = optIntOrNull(key)
        if (value != null) {
            return value
        }
    }
    return null
}

private fun JSONObject.optBooleanOrNull(
    key: String,
): Boolean? {
    if (!has(key) || isNull(key)) {
        return null
    }
    return optBoolean(key)
}

private fun JSONObject.optFloatOrNull(
    key: String,
): Float? {
    if (!has(key) || isNull(key)) {
        return null
    }
    return optDouble(key).toFloat()
}

private fun JSONObject.optIntMap(
    key: String,
): Map<String, Int> {
    val nestedObject = optJSONObject(key) ?: return emptyMap()
    val output = linkedMapOf<String, Int>()
    nestedObject.keys().forEach { nestedKey ->
        output[nestedKey] = nestedObject.optInt(nestedKey, 0)
    }
    return output
}

private fun JSONObject.optStringMap(
    key: String,
): Map<String, String> {
    val nestedObject = optJSONObject(key) ?: return emptyMap()
    val output = linkedMapOf<String, String>()
    nestedObject.keys().forEach { nestedKey ->
        val rawValue = nestedObject.opt(nestedKey)
        if (rawValue != null && rawValue != JSONObject.NULL) {
            output[nestedKey] = rawValue.toString()
        }
    }
    return output
}

private fun JSONObject.optStringList(
    key: String,
): List<String> {
    val jsonArray = optJSONArray(key) ?: return emptyList()
    return buildList {
        for (index in 0 until jsonArray.length()) {
            val entry = jsonArray.optString(index)
            if (entry.isNotBlank()) {
                add(entry)
            }
        }
    }
}

private fun JSONObject.optSummaryString(
    key: String,
): String? {
    val rawValue = opt(key)
    return when (rawValue) {
        null, JSONObject.NULL -> null

        is String -> rawValue.takeIf { it.isNotBlank() }
        is Number, is Boolean -> rawValue.toString()

        is JSONObject -> {
            rawValue.optString("summary")
                .takeIf { it.isNotBlank() }
                ?: rawValue.optString("label").takeIf { it.isNotBlank() }
                ?: rawValue.optString("state").takeIf { it.isNotBlank() }
                ?: rawValue.keys().asSequence().take(3).joinToString(", ") { nestedKey ->
                    "$nestedKey=${rawValue.opt(nestedKey)}"
                }.takeIf { it.isNotBlank() }
        }

        else -> rawValue.toString()
    }
}
