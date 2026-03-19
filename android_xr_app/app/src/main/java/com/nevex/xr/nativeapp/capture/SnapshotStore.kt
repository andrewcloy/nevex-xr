package com.nevex.xr.nativeapp.capture

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class SnapshotSaveResult(
    val file: File,
    val savedAtEpochMs: Long,
)

class SnapshotStore(
    private val context: Context,
) {
    private val drawPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val filenameTimestampFormat = SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US)

    fun saveStereoSnapshot(
        leftBitmap: Bitmap,
        rightBitmap: Bitmap,
        frameId: Long?,
    ): SnapshotSaveResult {
        val savedAtEpochMs = System.currentTimeMillis()
        val snapshotDirectory = File(
            context.getExternalFilesDir(null) ?: context.filesDir,
            "snapshots",
        ).apply {
            mkdirs()
        }
        val frameSuffix = frameId?.let { "_f$it" } ?: ""
        val snapshotFile = File(
            snapshotDirectory,
            "nevex_snapshot_${filenameTimestampFormat.format(Date(savedAtEpochMs))}$frameSuffix.png",
        )

        val combinedBitmap = composeStereoBitmap(leftBitmap, rightBitmap)
        FileOutputStream(snapshotFile).use { stream ->
            check(combinedBitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
                "Failed to encode snapshot PNG."
            }
            stream.flush()
        }
        combinedBitmap.recycle()

        return SnapshotSaveResult(
            file = snapshotFile,
            savedAtEpochMs = savedAtEpochMs,
        )
    }

    private fun composeStereoBitmap(
        leftBitmap: Bitmap,
        rightBitmap: Bitmap,
    ): Bitmap {
        val width = leftBitmap.width + rightBitmap.width
        val height = maxOf(leftBitmap.height, rightBitmap.height)
        val combinedBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(combinedBitmap)
        canvas.drawColor(Color.BLACK)
        canvas.drawBitmap(
            leftBitmap,
            0f,
            ((height - leftBitmap.height) / 2f),
            drawPaint,
        )
        canvas.drawBitmap(
            rightBitmap,
            leftBitmap.width.toFloat(),
            ((height - rightBitmap.height) / 2f),
            drawPaint,
        )
        return combinedBitmap
    }
}
