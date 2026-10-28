package de.maxichen.app

import kotlinx.coroutines.flow.MutableStateFlow

/* =====================================================================
   🎨 GLOBALER ZUSTAND (V3/V4)
   ===================================================================== */

object V3State {
    /** "preset|pink-dream" · "custom|data:image/…" · "animated|stars" */
    val appBackground = MutableStateFlow("preset|pink-dream")
}

/* =====================================================================
   🕒 FORMAT-HILFEN
   ===================================================================== */

fun fmtTime(ts: Long): String {
    if (ts <= 0) return ""
    val c = java.util.Calendar.getInstance()
    c.timeInMillis = ts
    return String.format(java.util.Locale.GERMANY, "%02d:%02d", c.get(java.util.Calendar.HOUR_OF_DAY), c.get(java.util.Calendar.MINUTE))
}

fun fmtDate(ts: Long): String {
    if (ts <= 0) return "—"
    val c = java.util.Calendar.getInstance()
    c.timeInMillis = ts
    val now = java.util.Calendar.getInstance()
    val sameDay = c.get(java.util.Calendar.YEAR) == now.get(java.util.Calendar.YEAR) &&
        c.get(java.util.Calendar.DAY_OF_YEAR) == now.get(java.util.Calendar.DAY_OF_YEAR)
    if (sameDay) return "heute " + fmtTime(ts)
    return String.format(
        java.util.Locale.GERMANY, "%02d.%02d.%d · %s",
        c.get(java.util.Calendar.DAY_OF_MONTH), c.get(java.util.Calendar.MONTH) + 1,
        c.get(java.util.Calendar.YEAR), fmtTime(ts),
    )
}

fun timeAgo(ts: Long): String {
    if (ts <= 0) return ""
    val d = System.currentTimeMillis() - ts
    return when {
        d < 60_000 -> "jetzt"
        d < 3_600_000 -> (d / 60_000).toString() + " Min"
        d < 86_400_000 -> (d / 3_600_000).toString() + " Std"
        d < 604_800_000 -> (d / 86_400_000).toString() + " T"
        else -> fmtDate(ts).substringBefore(" ·")
    }
}

fun humanSize(bytes: Long): String = when {
    bytes <= 0 -> ""
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> String.format(java.util.Locale.GERMANY, "%.0f KB", bytes / 1024.0)
    else -> String.format(java.util.Locale.GERMANY, "%.1f MB", bytes / 1048576.0)
}

fun fmtClock(sec: Int): String = String.format(java.util.Locale.GERMANY, "%02d:%02d", sec / 60, sec % 60)
