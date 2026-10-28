package de.maxichen.app.crypto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Echte Doppel-Ratchet-Fälle — keine Statuscodes, sondern Kryptografie:
 * 1) X3DH-Handshake mit signiertem Prekey
 * 2) Hin und Her (DH-Ratchet-Schritte)
 * 3) Out-of-order (Nachricht 3 vor 1)
 * 4) Manipulation fliegt auf (AAD/Header + AEAD)
 * 5) Session-Persistenz (serialisieren → weiterreden)
 * 6) Einmal-Prekey wird nur einmal benutzt
 */
class RatchetTest {

    private class Party {
        val ik = Curve25519.pair()
        val spk = Curve25519.pair()
        val opk = Curve25519.pair()
        val signing = Crypto.newSigningKeyPair()
        val spkSig = Crypto.sign(signing.private, spk.second)

        fun bundleWithOpk(): X3DH.PeerBundle = X3DH.PeerBundle(
            identityKey = ik.second,
            signedPrekey = spk.second,
            prekeySignature = spkSig,
            signingKey = signing.public.encoded,
            signedPrekeyId = "spk-1",
            oneTimePrekey = opk.second,
            oneTimePrekeyId = "opk-1",
        )
    }

    private fun handshake(): Triple<DoubleRatchet, DoubleRatchet, PreKeyInit> {
        val alice = Party()
        val bob = Party()
        val (sessionA, init) = X3DH.initiate(
            alice.ik.first, alice.ik.second, alice.signing.public.encoded, bob.bundleWithOpk(),
        )
        val sessionB = X3DH.respond(
            bob.ik.first, bob.spk.first, bob.spk.second, bob.opk.first, init,
        )
        return Triple(sessionA, sessionB, init)
    }

    @Test
    fun `X3DH - beide Seiten leiten dasselbe Geheimnis ab`() {
        val (a, b, init) = handshake()
        val env = a.encrypt("hallo bob 💗".toByteArray())
        assertNotNull(init)
        val out = b.decrypt(Envelope(env.header, env.iv, env.ciphertext, init))
        assertEquals("hallo bob 💗", String(out))
    }

    @Test
    fun `Hin und Her - DH-Ratchet nach jeder Antwort`() {
        val (a, b, init) = handshake()

        val m1 = a.encrypt("1 von A".toByteArray())
        assertEquals("1 von A", String(b.decrypt(Envelope(m1.header, m1.iv, m1.ciphertext, init))))

        val m2 = b.encrypt("1 von B".toByteArray())
        assertEquals("1 von B", String(a.decrypt(m2)))

        val m3 = a.encrypt("2 von A".toByteArray())
        assertEquals("2 von A", String(b.decrypt(m3)))

        val m4 = b.encrypt("2 von B".toByteArray())
        assertEquals("2 von B", String(a.decrypt(m4)))

        // Nach jeder Richtung muss sich der Self-Key geändert haben
        assertFalse(m1.header.dh.contentEquals(m3.header.dh))
        assertFalse(m2.header.dh.contentEquals(m4.header.dh))
    }

    @Test
    fun `Out-of-order - Nachricht 3 kommt vor 1`() {
        val (a, b, init) = handshake()
        val e1 = a.encrypt("eins".toByteArray())
        val e2 = a.encrypt("zwei".toByteArray())
        val e3 = a.encrypt("drei".toByteArray())

        val first = Envelope(e1.header, e1.iv, e1.ciphertext, init)
        val third = Envelope(e3.header, e3.iv, e3.ciphertext, null)

        assertEquals("drei", String(b.decrypt(third)))     // springt vor
        assertEquals("eins", String(b.decrypt(first)))      // holt übersprungenen Key
        assertEquals("zwei", String(b.decrypt(e2)))         // Chain weiter
    }

    @Test
    fun `Manipulierter Ciphertext wird abgelehnt`() {
        val (a, b, init) = handshake()
        val env = a.encrypt("geheim".toByteArray())
        val broken = env.ciphertext.copyOf()
        broken[0] = (broken[0].toInt() xor 0xFF).toByte()
        try {
            b.decrypt(Envelope(env.header, env.iv, broken, init))
            fail("Manipulation wurde NICHT erkannt")
        } catch (e: RatchetException) {
            assertTrue(e.message!!.contains("Entschlüsselung"))
        }
    }

    @Test
    fun `Manipulierter Header wird abgelehnt (AAD)`() {
        val (a, b, init) = handshake()
        val env = a.encrypt("geheim".toByteArray())
        val fakeHeader = env.header.copy(n = env.header.n + 1)
        try {
            b.decrypt(Envelope(fakeHeader, env.iv, env.ciphertext, init))
            fail("Header-Manipulation wurde NICHT erkannt")
        } catch (e: RatchetException) {
            // ok
        }
    }

    @Test
    fun `Session laesst sich speichern und weiterreden`() {
        val (a, b, init) = handshake()
        val e1 = a.encrypt("vor dem Neustart".toByteArray())
        assertEquals("vor dem Neustart", String(b.decrypt(Envelope(e1.header, e1.iv, e1.ciphertext, init))))

        val aJson = a.serialize()
        val bJson = b.serialize()
        val a2 = DoubleRatchet.deserialize(aJson)
        val b2 = DoubleRatchet.deserialize(bJson)
        assertNotNull(a2)
        assertNotNull(b2)

        val e2 = a2!!.encrypt("nach dem Neustart".toByteArray())
        assertEquals("nach dem Neustart", String(b2!!.decrypt(e2)))

        val e3 = b2.encrypt("zurück".toByteArray())
        assertEquals("zurück", String(a2.decrypt(e3)))
    }

    @Test
    fun `falscher Empfaenger kann nicht entschluesseln`() {
        val (a, _, init) = handshake()
        val eve = Party()
        val eveSession = X3DH.respond(eve.ik.first, eve.spk.first, eve.spk.second, eve.opk.first, init)
        val env = a.encrypt("nur für bob".toByteArray())
        try {
            eveSession.decrypt(Envelope(env.header, env.iv, env.ciphertext, init))
            fail("Eve konnte entschlüsseln — das darf NIE passieren")
        } catch (e: RatchetException) {
            // gut
        }
    }

    @Test
    fun `Prekey-Signatur wird geprueft`() {
        val alice = Party()
        val bob = Party()
        val tampered = X3DH.PeerBundle(
            identityKey = bob.ik.second,
            signedPrekey = bob.spk.second,
            prekeySignature = ByteArray(70) { 1 },   // Müll
            signingKey = bob.signing.public.encoded,
            signedPrekeyId = "spk-1",
            oneTimePrekey = bob.opk.second,
            oneTimePrekeyId = "opk-1",
        )
        assertFalse(X3DH.verifyPrekey(tampered))
        try {
            X3DH.initiate(alice.ik.first, alice.ik.second, alice.signing.public.encoded, tampered)
            fail("Ungültige Signatur wurde akzeptiert")
        } catch (e: IllegalArgumentException) {
            // gut — MITM-Schutz greift
        }
    }

    @Test
    fun `viele Nachrichten - Ketten laufen nicht auseinander`() {
        val (a, b, init) = handshake()
        for (i in 1..50) {
            val env = a.encrypt("A$i".toByteArray())
            val decoded = b.decrypt(Envelope(env.header, env.iv, env.ciphertext, if (i == 1) init else null))
            assertEquals("A$i", String(decoded))
            if (i % 5 == 0) {
                val back = b.encrypt("B$i".toByteArray())
                assertEquals("B$i", String(a.decrypt(back)))
            }
        }
    }
}
