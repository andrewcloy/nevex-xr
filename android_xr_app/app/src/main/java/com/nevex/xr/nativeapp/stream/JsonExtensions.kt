package com.nevex.xr.nativeapp.stream

import org.json.JSONObject

internal fun JSONObject.optLongOrNull(name: String): Long? {
    if (!has(name)) {
        return null
    }
    return optLong(name)
}
