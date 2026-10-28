package de.maxichen.app

/* =====================================================================
   ✅ V4.12 — BADGE-TRUST: woher weiß die App, welcher Schlüssel echt ist?
   ---------------------------------------------------------------------
   Das Problem: der Server signiert die Haken. Woher weiß die App, dass
   der Schlüssel, der ihr geschickt wird, wirklich ihrer ist?

   Lösung wie bei SSH (`known_hosts`): TRUST ON FIRST USE.
     · beim ersten Kontakt wird der Public-Key geladen und im VAULT gepinnt
     · bei jedem weiteren Kontakt wird verglichen
     · ändert er sich, gibt es eine laute Warnung — und geprüfte Haken
       werden NICHT angezeigt

   ⚠️ EHRLICH: beim ALLERERSTEN Start könnte ein Man-in-the-Middle einen
   falschen Key einschleusen. Das ist bei SSH genauso und lässt sich ohne
   fest eingebauten Schlüssel nicht vermeiden. Der Unterschied: danach ist
   es festgenagelt, und ein Wechsel wird gemeldet statt still akzeptiert.
   Wer es härter will, baut den Key in die APK — dann läuft die App aber
   nur noch mit genau diesem Server.
   ===================================================================== */

import android.content.Context
import de.maxichen.app.crypto.Crypto
import de.maxichen.app.crypto.VerifiedBadge

object BadgeTrust {

    private const val PREFS = "maxichat_secure_v45"
    private const val KEY_NAME = "badge_server_key"

    sealed class Trust {
        data class Pinned(val key: ByteArray) : Trust()
        data class FirstContact(val key: ByteArray) : Trust()
        data class Changed(val old: ByteArray, val new: ByteArray) : Trust()
        data class Unavailable(val reason: String) : Trust()
    }

    /** Holt den Server-Key und vergleicht ihn mit dem gepinnten. */
    suspend fun fetchAndCheck(ctx: Context): Trust {
        val json = try {
            Api4.badgeKey()
        } catch (t: Throwable) {
            return Trust.Unavailable(t.message ?: "Server nicht erreichbar")
        }
        val b64 = json.optString("publicKey", "")
        if (b64.isEmpty()) return Trust.Unavailable("Server liefert keinen Schlüssel")
        val fresh = try { Crypto.unb64(b64) } catch (t: Throwable) { return Trust.Unavailable("Schlüssel unlesbar") }

        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val pinnedRaw = Vault.readSecret(ctx, p, KEY_NAME)
        if (pinnedRaw.isNullOrEmpty()) {
            Vault.writeSecret(ctx, p, KEY_NAME, Crypto.b64(fresh))
            return Trust.FirstContact(fresh)
        }
        val pinned = try { Crypto.unb64(pinnedRaw) } catch (t: Throwable) { return Trust.Unavailable("Pin unlesbar") }
        return if (pinned.contentEquals(fresh)) Trust.Pinned(fresh) else Trust.Changed(pinned, fresh)
    }

    /** Was der Server gerade behauptet, ohne Netz — für die UI. */
    fun cachedKey(ctx: Context): ByteArray? {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val raw = Vault.readSecret(ctx, p, KEY_NAME) ?: return null
        return try { Crypto.unb64(raw) } catch (t: Throwable) { null }
    }

    /** Nutzer hat den neuen Schlüssel bewusst akzeptiert (nach Warnung). */
    fun repin(ctx: Context, key: ByteArray) {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        Vault.writeSecret(ctx, p, KEY_NAME, Crypto.b64(key))
    }

    /**
     * Prüft einen Badge-String vom Server — Ende zu Ende.
     * @return Rolle, oder null wenn irgendetwas nicht stimmt
     */
    fun verify(
        ctx: Context, badgeWire: String?, expectedUserId: String, currentAvatar: String?, nowMillis: Long,
    ): VerifiedBadge.Role? {
        val key = cachedKey(ctx) ?: return null
        val badge = VerifiedBadge.decode(badgeWire) ?: return null
        return when (val r = VerifiedBadge.verify(badge, key, expectedUserId, currentAvatar, nowMillis)) {
            is VerifiedBadge.Result.Ok -> r.role
            is VerifiedBadge.Result.Fail -> null
        }
    }

    /** Für die UI: warum kein Haken? (ehrlich, statt einfach nichts zu zeigen) */
    fun why(ctx: Context, badgeWire: String?, expectedUserId: String, currentAvatar: String?, nowMillis: Long): String {
        val key = cachedKey(ctx) ?: return "Server-Schlüssel noch nicht gepinnt"
        val badge = VerifiedBadge.decode(badgeWire) ?: return "kein Haken vorhanden"
        return when (val r = VerifiedBadge.verify(badge, key, expectedUserId, currentAvatar, nowMillis)) {
            is VerifiedBadge.Result.Ok -> "geprüft ✓"
            is VerifiedBadge.Result.Fail -> r.reason
        }
    }
}
