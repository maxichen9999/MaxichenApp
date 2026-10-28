package de.maxichen.app.crypto

/* =====================================================================
   🌍 V4.14 — CROSS-LANGUAGE-VEKTOREN
   ---------------------------------------------------------------------
   Android (Kotlin), iOS (Swift) und der Node-Server müssen bei jedem
   sicherheitsrelevanten Wert EXAKT dasselbe rechnen. Sonst gilt:
     · ein auf Android signierter Haken ist auf iOS ungültig
     · ein Recovery-Code aus der App passt nicht zum Server-Hash
     · ein TOTP-Code wird abgelehnt, obwohl er richtig ist

   Die Werte hier sind nicht ausgedacht — sie sind mit einer
   unabhängigen Node-Implementierung erzeugt und mit dem Swift-Paket
   (`maxichen-ios`, 33 Tests) gegengeprüft. Alle drei Seiten liefern
   dieselben 12 Zeilen.
   ===================================================================== */

import de.maxichen.app.Onboard
import org.junit.Assert.assertEquals
import org.junit.Test

class CrossVectorTest {

    private val secret = "12345678901234567890".toByteArray()

    @Test
    fun base32_und_totp_wie_ueberall_sonst() {
        assertEquals("MZXW6YTBOI", Totp.base32Encode("foobar".toByteArray()))
        assertEquals("755224", Totp.hotp(secret, 0))
        assertEquals("520489", Totp.hotp(secret, 9))
        assertEquals("94287082", Totp.totp(secret, 59, digits = 8))
        assertEquals("005924", Totp.totp(secret, 1234567890))
        assertEquals("732303", Totp.totp(secret, 1700000010))
    }

    @Test
    fun avatarHash_wie_auf_ios_und_im_server() {
        // Swift: BadgeFormat.avatarHash("🦊") → derselbe Wert
        // Node:  sha256("🦊").slice(0,32)        → derselbe Wert
        assertEquals("0a9f72e8edad3748ffee34e08891b3bf", VerifiedBadge.avatarHash("🦊"))
        assertEquals("46eeaf23edd9726b57005d24efe27a7c", VerifiedBadge.avatarHash("🐱"))
    }

    @Test
    fun badgeNutzlast_byteGleich() {
        assertEquals(
            "maxichat-badge-v1|u_maxi|owner|abcd1234|1790000000000",
            String(VerifiedBadge.payload("u_maxi", "owner", "abcd1234", 1790000000000L)),
        )
    }

    @Test
    fun telefonnummer_wie_auf_ios_und_im_server() {
        assertEquals("+4915155894714", Onboard.normalizePhone("+49 (151) 558-947-14"))
        assertEquals("+49 151 558 947 14", Onboard.prettyPhone("+4915155894714"))
    }

    @Test
    fun recoveryAlphabet_wie_auf_ios() {
        // 31 Zeichen, 2–9 (nicht 2–7!) — daran hing schon einmal ein echter Fehler
        assertEquals("ABCDEFGHJKMNPQRSTUVWXYZ23456789", RecoveryCodes.ALPHABET)
        assertEquals(31, RecoveryCodes.ALPHABET.length)
    }

    @Test
    fun otpauthLink_wie_auf_ios() {
        val url = Totp.otpauthUrl(Totp.Config(secret = secret, issuer = "MaxiChen", account = "maxi"))
        assertEquals(
            "otpauth://totp/MaxiChen:maxi?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" +
                "&issuer=MaxiChen&algorithm=SHA1&digits=6&period=30",
            url,
        )
    }
}
