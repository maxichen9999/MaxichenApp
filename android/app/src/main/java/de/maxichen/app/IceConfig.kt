package de.maxichen.app

/* =====================================================================
   🔥 V4.7 — ICE-KONFIGURATION (STUN + TURN)
   ---------------------------------------------------------------------
   Vorher standen STUN-Server fest in der App und es gab KEIN TURN.
   Ergebnis: hinter symmetrischem NAT / Firmen-Firewall kam kein Anruf
   zustande — und niemand konnte sagen, warum.

   Jetzt:
   • App holt /api/rtc/ice → STUN + TURN mit KURZLEBIGEN Credentials
   • Credentials werden nie in die APK gebaut (kein Bandbreiten-Diebstahl)
   • TTL vom Server (Standard 1 h), danach automatisch neu holen
   • fällt der Endpunkt aus: ehrlicher STUN-Fallback statt Absturz
   • `turnAvailable` sagt der UI die Wahrheit (Hinweis statt Schweigen)
   ===================================================================== */

import org.json.JSONArray
import org.webrtc.PeerConnection

object IceConfig {
    private const val FALLBACK_STUN = "stun:stun.l.google.com:19302"

    @Volatile private var cached: List<PeerConnection.IceServer> = fallback()
    @Volatile private var fetchedAt = 0L
    @Volatile private var ttlMs = 3_600_000L

    /** true, wenn der Server TURN-Credentials liefert (dann halten Calls auch hinter NAT) */
    @Volatile var turnAvailable: Boolean = false
        private set

    @Volatile var lastError: String? = null
        private set

    private fun fallback(): List<PeerConnection.IceServer> = try {
        listOf(PeerConnection.IceServer.builder(FALLBACK_STUN).createIceServer())
    } catch (e: Exception) {
        emptyList()
    }

    /** Synchron nutzbar (z. B. in createPc) — gibt den letzten guten Stand zurück. */
    fun servers(): List<PeerConnection.IceServer> = cached

    /**
     * Holt die aktuelle ICE-Liste. Erneuert automatisch 60 s vor Ablauf.
     * Wirft nie — im Zweifel bleibt der alte Stand.
     */
    suspend fun refresh(force: Boolean = false): List<PeerConnection.IceServer> {
        if (!force && System.currentTimeMillis() - fetchedAt < ttlMs - 60_000 && fetchedAt != 0L) {
            return cached
        }
        return try {
            val res = Api.get("/api/rtc/ice")
            val arr = res.optJSONArray("iceServers") ?: JSONArray()
            val list = ArrayList<PeerConnection.IceServer>()

            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val urlsArr = o.optJSONArray("urls")
                val urls: List<String> = if (urlsArr != null) {
                    (0 until urlsArr.length()).map { urlsArr.getString(it) }
                } else {
                    listOfNotNull(o.optString("urls").takeIf { it.isNotEmpty() })
                }
                if (urls.isEmpty()) continue

                val user = o.optString("username", "")
                val cred = o.optString("credential", "")
                val builder = PeerConnection.IceServer.builder(urls)
                if (user.isNotEmpty() && cred.isNotEmpty()) {
                    builder.setUsername(user)
                    builder.setPassword(cred)
                }
                list += builder.createIceServer()
            }

            if (list.isNotEmpty() && list.size != 1) {  // 1 = nur Fallback-Kopie, dann lieber nichts überschreiben
                cached = list
                fetchedAt = System.currentTimeMillis()
                ttlMs = (res.optLong("ttl", 3600).coerceAtLeast(300)) * 1000
                turnAvailable = res.optBoolean("turn", false)
                lastError = null
            }
            cached
        } catch (e: Exception) {
            lastError = e.message ?: "ICE nicht abrufbar"
            cached
        }
    }
}
