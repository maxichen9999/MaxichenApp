package de.maxichen.app.crypto

/* =====================================================================
   ✅ V4.12 — TEST: Verified-Badge
   ---------------------------------------------------------------------
   Ein Haken-Test, der nur „gültige Signatur wird akzeptiert" prüft, wäre
   wertlos. Die interessante Frage ist: was passiert, wenn jemand ANGREIFT?

   Hier durchgespielt:
     1) gültig → durch
     2) Nutzlast manipuliert (Rolle hochgesetzt) → abgelehnt
     3) Signatur eines anderen Schlüssels → abgelehnt
     4) Avatar getauscht, Signatur alt → abgelehnt (Anti-Impersonation)
     5) Avatar gewechselt UND neu signiert → durch (der echte Weg)
     6) Haken für fremde userId → abgelehnt
     7) Haken aus der Zukunft → abgelehnt
     8) Haken 31 Tage alt → abgelehnt; 29 Tage → durch
     9) Rolle "user" → nie ein Haken
    10) Müll-Strings im decode → null statt Absturz
   ===================================================================== */

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec

class VerifiedBadgeTest {

    /* ------------- Hilfen: wir sind hier der Server ------------- */

    private fun key(): KeyPair =
        KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()

    private fun sign(kp: KeyPair, userId: String, role: String, avatarHash: String, issuedAt: Long): ByteArray {
        val data = VerifiedBadge.payload(userId, role, avatarHash, issuedAt)
        val s = Signature.getInstance("SHA256withECDSA")
        s.initSign(kp.private)
        s.update(data)
        return s.sign()
    }

    /** so, wie der Server es baut */
    private fun badge(
        kp: KeyPair,
        userId: String = "u_maxi",
        role: String = "owner",
        avatar: String? = "🦊",
        issuedAt: Long = NOW,
    ): VerifiedBadge.Badge {
        val h = VerifiedBadge.avatarHash(avatar)
        return VerifiedBadge.Badge(userId, VerifiedBadge.roleOf(role), h, issuedAt, sign(kp, userId, role, h, issuedAt))
    }

    private val kp by lazy { key() }
    private val pub: ByteArray by lazy { kp.public.encoded }

    private fun check(b: VerifiedBadge.Badge, pubKey: ByteArray = pub, uid: String = "u_maxi", avatar: String? = "🦊", now: Long = NOW) =
        VerifiedBadge.verify(b, pubKey, uid, avatar, now)

    private inline fun <reified T> reason(r: VerifiedBadge.Result): String =
        if (r is VerifiedBadge.Result.Fail) r.reason else "OK"

    /* ================= 1. der gute Fall ================= */

    @Test
    fun gueltigerHaken_wirdAkzeptiert() {
        val r = check(badge(kp))
        assertTrue("muss durchgehen, war: " + reason<Any>(r), r is VerifiedBadge.Result.Ok)
        assertEquals(VerifiedBadge.Role.OWNER, (r as VerifiedBadge.Result.Ok).role)
    }

    @Test
    fun alleRollen_tragenEmoji() {
        assertEquals("👑", VerifiedBadge.Role.OWNER.emoji)
        assertEquals("🛡️", VerifiedBadge.Role.TEAM.emoji)
        assertEquals("🤖", VerifiedBadge.Role.BOT.emoji)
        // hasMark hängt am Badge (Rolle + Signatur), nicht an der Rolle allein
        assertTrue(badge(kp, role = "owner").hasMark)
        assertFalse(badge(kp, role = "user").hasMark)
    }

    /* ================= 2. Rolle hochsetzen ================= */

    @Test
    fun rolleHochgesetzt_wirdAbgelehnt() {
        // Angreifer nimmt einen echten Haken und schreibt "owner" rein
        val echt = badge(kp, role = "verified")
        val gefaelscht = echt.copy(role = VerifiedBadge.Role.OWNER)
        val r = check(gefaelscht)
        assertTrue(r is VerifiedBadge.Result.Fail)
        assertEquals("Signatur ungültig", (r as VerifiedBadge.Result.Fail).reason)
    }

    @Test
    fun issuedAtVeraendert_wirdAbgelehnt() {
        // Haken verlängern (Ablauf austricksen) geht nicht
        val echt = badge(kp, issuedAt = NOW - 40L * 24 * 3600 * 1000)   // schon abgelaufen
        val verlaengert = echt.copy(issuedAt = NOW)                      // "frisch gemacht"
        assertTrue(check(verlaengert) is VerifiedBadge.Result.Fail)
    }

    /* ================= 3. fremder Schlüssel ================= */

    @Test
    fun signaturVonAnderemSchluessel_wirdAbgelehnt() {
        val fremd = key()
        val b = badge(fremd)                     // korrekt signiert — aber nicht von unserem Server
        val r = check(b)                          // geprüft gegen den ECHTEN Public Key
        assertTrue(r is VerifiedBadge.Result.Fail)
        assertEquals("Signatur ungültig", (r as VerifiedBadge.Result.Fail).reason)
    }

    @Test
    fun leereSignatur_wirdAbgelehnt() {
        val b = badge(kp).copy(signature = ByteArray(0))
        assertEquals("nicht signiert", (check(b) as VerifiedBadge.Result.Fail).reason)
    }

    @Test
    fun einByteInDerSignaturGekippt_wirdAbgelehnt() {
        val b = badge(kp)
        val kaputt = b.signature.copyOf()
        kaputt[kaputt.size / 2] = (kaputt[kaputt.size / 2].toInt() xor 0x01).toByte()
        assertTrue(check(b.copy(signature = kaputt)) is VerifiedBadge.Result.Fail)
    }

    /* ================= 4./5. Avatar-Tausch ================= */

    @Test
    fun avatarGetauscht_ohneNeueSignatur_verliertDenHaken() {
        // Das ist DER Betrugsfall: "guck, ich bin maxichen, ich hab den Haken"
        // — mit dem Bild von maxichen, aber dem eigenen Konto.
        val b = badge(kp, userId = "u_boese", avatar = "😈")   // eigener Haken für 😈
        // jetzt Bild von Maxichen untergeschoben:
        val r = check(b, uid = "u_boese", avatar = "👑")
        assertTrue(r is VerifiedBadge.Result.Fail)
        assertEquals("Profilbild passt nicht zur Signatur", (r as VerifiedBadge.Result.Fail).reason)
    }

    @Test
    fun avatarGewechseltUndNeuSigniert_gehtWieder() {
        val b = badge(kp, avatar = "🐸")
        assertTrue(check(b, avatar = "🐸") is VerifiedBadge.Result.Ok)
        // Bild geändert → alter Haken tot
        assertTrue(check(b, avatar = "🐙") is VerifiedBadge.Result.Fail)
        // Server signiert neu → wieder gültig
        val neu = badge(kp, avatar = "🐙")
        assertTrue(check(neu, avatar = "🐙") is VerifiedBadge.Result.Ok)
    }

    @Test
    fun leererAvatar_istEinEigenerZustand() {
        val ohneBild = badge(kp, avatar = "")
        assertEquals("", VerifiedBadge.avatarHash(null))
        assertEquals("", VerifiedBadge.avatarHash("   "))
        assertTrue(check(ohneBild, avatar = null) is VerifiedBadge.Result.Ok)
        // und wer sich ein Bild dazuholt, muss neu signieren lassen
        assertTrue(check(ohneBild, avatar = "🦊") is VerifiedBadge.Result.Fail)
    }

    @Test
    fun avatarHash_istKurzUndStabil() {
        val h = VerifiedBadge.avatarHash("🦊")
        assertEquals(32, h.length)
        assertTrue(h.all { it in "0123456789abcdef" })
        assertEquals(h, VerifiedBadge.avatarHash("🦊"))
        // Leerraum wird bewusst abgeschnitten: ein versehentliches Leerzeichen
        // in der DB soll niemandem den Haken kosten.
        assertEquals(h, VerifiedBadge.avatarHash("  🦊 "))
        // Emoji ist 4 Byte in UTF-8 — der Hash muss genau darauf passen
        assertEquals(h, VerifiedBadge.avatarHash(String("🦊".toByteArray(Charsets.UTF_8), Charsets.UTF_8)))
        // aber ein anderes Emoji ergibt einen anderen Hash
        assertNotEquals(h, VerifiedBadge.avatarHash("🐙"))
    }

    /* ================= 6. fremde userId ================= */

    @Test
    fun hakenFuerAnderesKonto_wirdAbgelehnt() {
        val b = badge(kp, userId = "u_maxi")
        val r = check(b, uid = "u_boese")
        assertEquals("Haken gehört einem anderen Konto", (r as VerifiedBadge.Result.Fail).reason)
    }

    /* ================= 7./8. Zeit ================= */

    @Test
    fun hakenAusDerZukunft_wirdAbgelehnt() {
        val b = badge(kp, issuedAt = NOW + 60_000)
        assertEquals("Haken aus der Zukunft", (check(b) as VerifiedBadge.Result.Fail).reason)
    }

    @Test
    fun ablaufNach30Tagen() {
        val alt = badge(kp, issuedAt = NOW - VerifiedBadge.MAX_AGE_MS - 1)
        assertTrue(check(alt) is VerifiedBadge.Result.Fail)
        val frisch = badge(kp, issuedAt = NOW - VerifiedBadge.MAX_AGE_MS + 60_000)
        assertTrue("29 Tage alt muss noch gelten", check(frisch) is VerifiedBadge.Result.Ok)
    }

    /* ================= 9. Rolle "user" ================= */

    @Test
    fun rolleUser_bekommtNieEinenHaken() {
        val b = badge(kp, role = "user")
        assertEquals("keine Rolle", (check(b) as VerifiedBadge.Result.Fail).reason)
    }

    @Test
    fun unbekannteRolle_istUser() {
        assertEquals(VerifiedBadge.Role.USER, VerifiedBadge.roleOf("admin_god"))
        assertEquals(VerifiedBadge.Role.TEAM, VerifiedBadge.roleOf("team"))
    }

    /* ================= 10. Müll ================= */

    @Test
    fun decode_kaputteStrings_liefertNull() {
        assertNull(VerifiedBadge.decode(null))
        assertNull(VerifiedBadge.decode(""))
        assertNull(VerifiedBadge.decode("nur|vier|felder|hier"))
        assertNull(VerifiedBadge.decode("a|b|c|keinZahl|AAAA"))
        assertNull(VerifiedBadge.decode("a|b|c|1700000000000|kein-base64!!"))
    }

    @Test
    fun encodeDecode_istVerlustfrei() {
        val b = badge(kp)
        val wieder = VerifiedBadge.decode(VerifiedBadge.encode(b))
        assertTrue(wieder != null)
        assertEquals(b.userId, wieder!!.userId)
        assertEquals(b.role, wieder.role)
        assertEquals(b.avatarHash, wieder.avatarHash)
        assertEquals(b.issuedAt, wieder.issuedAt)
        assertTrue(b.signature.contentEquals(wieder.signature))
        // und der wiederhergestellte Haken ist immer noch gültig
        assertTrue(check(wieder) is VerifiedBadge.Result.Ok)
    }

    @Test
    fun nutzlast_hatExaktesFormat() {
        val p = String(VerifiedBadge.payload("u1", "owner", "abcd", 1700000000000L), Charsets.UTF_8)
        assertEquals("maxichat-badge-v1|u1|owner|abcd|1700000000000", p)
    }

    companion object {
        const val NOW = 1_790_000_000_000L
    }
}
