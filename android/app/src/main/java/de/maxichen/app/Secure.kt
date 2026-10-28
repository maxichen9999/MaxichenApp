package de.maxichen.app

/* =====================================================================
   🛡️ V4.4 — FLAG_SECURE + SCREENSHOT-ERKENNUNG
   ---------------------------------------------------------------------
   • Versteckte Chats, Einmal-Medien und Chats mit aktivem Schutz werden
     mit WindowManager.LayoutParams.FLAG_SECURE gezeichnet → Screenshots
     und Bildschirmaufnahmen sind im System blockiert (schwarzes Bild).
   • Android 14 (API 34): echte Screenshot-Erkennung über
     Activity.registerScreenCaptureCallback() → Benachrichtigung an den
     Chat-Partner (POST /api/security/screenshot).
   • Unter Android 14 gibt es KEINE offizielle Erkennung — das sagen wir
     ehrlich, statt so zu tun als ob.
   ===================================================================== */

import android.app.Activity
import android.os.Build
import android.view.WindowManager
import androidx.annotation.RequiresApi
import java.lang.ref.WeakReference

object SecureScreen {
    private var windowRef: WeakReference<android.view.Window>? = null
    private var activityRef: WeakReference<Activity>? = null

    /** true, solange FLAG_SECURE gesetzt ist (für Debug/Anzeige) */
    var active: Boolean = false
        private set

    /** Wird bei einem erkannten Screenshot gerufen (nur Android 14+). */
    var onCaptured: (() -> Unit)? = null

    fun attach(activity: Activity) {
        activityRef = WeakReference(activity)
        windowRef = WeakReference(activity.window)
    }

    fun setSecure(on: Boolean) {
        val w = windowRef?.get() ?: return
        try {
            if (on) {
                w.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            } else {
                w.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
            active = on
        } catch (t: Throwable) {
        }
    }

    /**
     * Screenshot-Erkennung. Ab Android 14 offiziell — darunter bewusst
     * nicht vorgetäuscht (keine versteckte API-Hacks).
     */
    @RequiresApi(34)
    fun registerCaptureDetection(activity: Activity) {
        try {
            activity.registerScreenCaptureCallback(
                activity.mainExecutor,
                object : Activity.ScreenCaptureCallback {
                    override fun onScreenCaptured() {
                        onCaptured?.invoke()
                    }
                },
            )
        } catch (t: Throwable) {
        }
    }

    /** Kann dieses Gerät Screenshots überhaupt erkennen? */
    val canDetect: Boolean get() = Build.VERSION.SDK_INT >= 34
}
