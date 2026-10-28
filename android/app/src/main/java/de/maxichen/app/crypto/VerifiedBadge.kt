package de.maxichen.app.crypto

/* =====================================================================
   ✅ V4.12 — VERIFIED BADGES (der blaue Haken, der wirklich etwas bedeutet)
   ---------------------------------------------------------------------
   Der Haken ist kein Emoji. Er ist eine Signatur des Servers über genau
   die Daten, die er behauptet:

       BADGE = Sign(serverKey,
                   "maxichat-badge-v1" ‖ userId ‖ role ‖ avatarHash ‖ issuedAt)

   Warum jedes Feld drin ist:
     · userId     → der Haken klebt an einem Konto, nicht an einem Namen
     · role       → „owner" kann man nicht durch Umbenennen werden
     · avatarHash → tauscht jemand das Bild, ist der Haken WEG
                    (sonst könnte man sich als Owner ausgeben, indem man
                     nur das Bild austauscht)
     · issuedAt   → alte Haken verfallen lassen ist möglich

   Die App hat den Public-Key fest eingebaut. Ein gefälschter Haken aus
   einem manipulierten Server kann ihn nicht erzeugen.

   ⚠️ EHRLICH zu Ed25519: auf Android wäre das erst ab API 33 in der
   JCA verfügbar (minSdk ist 26). Wir nehmen ECDSA P-256 — dieselbe
   Widerstandsfähigkeit gegen Fälschung, funktioniert ab Android 8.
   Ed25519 wäre hier ein Fremdcode-Paket für null Sicherheitsgewinn.
   ===================================================================== */

import java.security.MessageDigest

object VerifiedBadge {

    const val VERSION = "maxichat-badge-v1"
    /** Haken verfallen nach 30 Tagen — dann muss der Server neu signieren. */
    const val MAX_AGE_MS = 30L * 24 * 60 * 60 * 1000

    enum class Role(val wire: String, val emoji: String, val label: String, val color: Long) {
        OWNER("owner", "👑", "Owner", 0xFFFFC46B),
        TEAM("team", "🛡️", "Team", 0xFF7EB8FF),
        BOT("bot", "🤖", "Bot", 0xFF1D9BF0),
        VERIFIED("verified", "✅", "Verifiziert", 0xFF1D9BF0),
        USER("user", "", "", 0L),
    }

    data class Badge(
        val userId: String,
        val role: Role,
        val avatarHash: String,
        val issuedAt: Long,
        /** ECDSA-P-256-Signatur über die Nutzlast (X.509-kodiert) */
        val signature: ByteArray,
    ) {
        val hasMark: Boolean get() = role != Role.USER
    }

    /* ---------------- Nutzlast ---------------- */

    /** exakt die Bytes, die signiert werden — Client und Server müssen hier identisch sein */
    fun payload(userId: String, role: String, avatarHash: String, issuedAt: Long): ByteArray =
        "$VERSION|$userId|$role|$avatarHash|$issuedAt".toByteArray(Charsets.UTF_8)

    /** Hash des Avatars. Leerer Avatar = leerer Hash (kein Bild = kein Bild im Haken). */
    fun avatarHash(avatar: String?): String {
        val a = avatar?.trim().orEmpty()
        if (a.isEmpty()) return ""
        return MessageDigest.getInstance("SHA-256")
            .digest(a.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
            .substring(0, 32)      // 128 bit reichen — kürzer in der URL, gleiche Wirkung
    }

    /* ---------------- Prüfung im Client ---------------- */

    sealed class Result {
        data class Ok(val role: Role) : Result()
        data class Fail(val reason: String) : Result()
    }

    /**
     * Prüft alles, was ein Haken behauptet. Ein Fehler an irgendeiner
     * Stelle = kein Haken (nicht „Haken mit Warnung" — sondern keiner).
     */
    fun verify(
        badge: Badge,
        serverPublicKey: ByteArray,
        expectedUserId: String,
        currentAvatar: String?,
        nowMillis: Long,
        maxAgeMs: Long = MAX_AGE_MS,
    ): Result {
        if (badge.role == Role.USER) return Result.Fail("keine Rolle")
        if (badge.userId != expectedUserId) return Result.Fail("Haken gehört einem anderen Konto")
        if (badge.signature.isEmpty()) return Result.Fail("nicht signiert")

        val age = nowMillis - badge.issuedAt
        if (age < 0) return Result.Fail("Haken aus der Zukunft")
        if (age > maxAgeMs) return Result.Fail("Haken abgelaufen — Server muss neu signieren")

        // 🔒 Anti-Impersonation: der Hash muss zum JETZIGEN Bild passen.
        //    Wer das Bild tauscht, ohne neu signieren zu lassen, verliert den Haken.
        if (badge.avatarHash != avatarHash(currentAvatar)) {
            return Result.Fail("Profilbild passt nicht zur Signatur")
        }

        val data = payload(badge.userId, badge.role.wire, badge.avatarHash, badge.issuedAt)
        return if (Crypto.verify(serverPublicKey, data, badge.signature)) {
            Result.Ok(badge.role)
        } else {
            Result.Fail("Signatur ungültig")
        }
    }

    fun roleOf(wire: String?): Role = Role.entries.firstOrNull { it.wire == wire } ?: Role.USER

    /** Serialisierung für API/DB: base64-Felder, mit "|" getrennt. */
    fun encode(b: Badge): String = listOf(
        b.userId, b.role.wire, b.avatarHash, b.issuedAt.toString(), Crypto.b64(b.signature),
    ).joinToString("|")

    fun decode(s: String?): Badge? {
        if (s.isNullOrBlank()) return null
        val f = s.split("|")
        if (f.size != 5) return null
        val issued = f[3].toLongOrNull() ?: return null
        return try {
            Badge(f[0], roleOf(f[1]), f[2], issued, Crypto.unb64(f[4]))
        } catch (t: Throwable) { null }
    }
}
