package de.maxichen.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

/* =====================================================================
   🖼️ BILD-KOMPRESSION → data:image/jpeg;base64,…
   ===================================================================== */

suspend fun compressToDataUrl(ctx: Context, uri: Uri, maxWidth: Int, maxBytes: Int): String? =
    withContext(Dispatchers.IO) {
        try {
            val input = ctx.contentResolver.openInputStream(uri) ?: return@withContext null
            val original = BitmapFactory.decodeStream(input)
            input.close()
            if (original == null) return@withContext null

            val w = maxWidth.coerceAtMost(original.width)
            val h = (original.height * (w.toFloat() / original.width)).toInt().coerceAtLeast(1)
            val scaled = if (w != original.width) Bitmap.createScaledBitmap(original, w, h, true) else original

            val out = ByteArrayOutputStream()
            var q = 82
            var data = ByteArray(0)
            while (q >= 25) {
                out.reset()
                scaled.compress(Bitmap.CompressFormat.JPEG, q, out)
                data = out.toByteArray()
                if (data.size <= maxBytes) break
                q -= 8
            }
            if (data.isEmpty() || data.size > maxBytes) return@withContext null
            "data:image/jpeg;base64," + Base64.encodeToString(data, Base64.NO_WRAP)
        } catch (e: Exception) {
            null
        }
    }

fun queryName(ctx: android.content.Context, uri: Uri): String = try {
    ctx.contentResolver.query(uri, null, null, null, null)?.use { c ->
        val i = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
        if (i >= 0 && c.moveToFirst()) c.getString(i) else "Foto"
    } ?: "Foto"
} catch (e: Exception) { "Foto" }
