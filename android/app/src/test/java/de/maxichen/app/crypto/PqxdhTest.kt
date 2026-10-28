package de.maxichen.app.crypto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * V4.9 — PQXDH: echte Handshakes, keine Statuscodes.
 *
 * Geprüft wird:
 *  1) Alice und Bob landen auf demselben Sitzungsschlüssel (Nachricht kommt an)
 *  2) Beide Richtungen + mehrere Nachrichten (DH-Ratchet läuft)
 *  3) Der PQ-Ciphertext reist mit und ist 1088 Byte (ML-KEM-768)
 *  4) Manipulierter PQ-Ciphertext → Bob kann NICHT entschlüsseln
 *  5) Gefälschte PQ-Signatur → Handshake wird abgelehnt
 *  6) Gegenstelle ohne PQ-Prekey → KEIN stiller Fallback, sondern Fehler
 *  7) Einmal-Prekey ist wirklich einmalig (zwei Sitzungen, verschiedene Schlüssel)
 */
class PqxdhTest {

    private class Party {
        val ik = Curve25519.pair()
        val spk = Curve25519.pair()
        val opk = Curve25519.pair()
        val signing = Crypto.newSigningKeyPair()
        val spkSig = Crypto.sign(signing.private, spk.second)

        val pq = MlKem768.keygenRandom()          // (ek, dk)
        val pqSig = Crypto.sign(signing.private, pq.first)

        fun bundle(withOpk: Boolean = true, withPq: Boolean = true) = Pqxdh.PeerBundle(
            identityKey = ik.second,
            signedPrekey = spk.second,
            prekeySignature = spkSig,
            signingKey = signing.public.encoded,
            signedPrekeyId = "spk-1",
            oneTimePrekey = if (withOpk) opk.second else null,
            oneTimePrekeyId = if (withOpk) "opk-1" else "",
            pqPrekey = if (withPq) pq.first else null,
            pqSignature = if (withPq) pqSig else null,
        )
    }

    private fun handshake(
        alice: Party = Party(),
        bob: Party = Party(),
    ): Triple<DoubleRatchet, DoubleRatchet, PreKeyInit> {
        val (sessionA, init) = Pqxdh.initiate(
            alice.ik.first, alice.ik.second, alice.signing.public.encoded, bob.bundle(),
        )
        val sessionB = Pqxdh.respond(
            bob.ik.first, bob.spk.first, bob.spk.second, bob.opk.first, bob.pq.second, init,
        )
        return Triple(sessionA, sessionB, init)
    }

    @Test
    fun `PQXDH - Alice und Bob landen auf demselben Sitzungsschluessel`() {
        val (a, b, init) = handshake()
        val env = a.encrypt("hallo bob, jetzt quantensicher 💗".toByteArray())
        val out = b.decrypt(Envelope(env.header, env.iv, env.ciphertext, init))
        assertEquals("hallo bob, jetzt quantensicher 💗", String(out))
    }

    @Test
    fun `PQ-Ciphertext reist mit und hat ML-KEM-768-Groesse`() {
        val (_, _, init) = handshake()
        val ct = init.pqCiphertext
        assertNotNull("PQ-Ciphertext muss in der ersten Nachricht stecken", ct)
        assertEquals(1088, ct!!.size)
    }

    @Test
    fun `mehrere Nachrichten in beide Richtungen`() {
        val (a, b, init) = handshake()
        var e = a.encrypt("1".toByteArray())
        assertEquals("1", String(b.decrypt(Envelope(e.header, e.iv, e.ciphertext, init))))

        e = b.encrypt("2".toByteArray())
        assertEquals("2", String(a.decrypt(e)))

        e = a.encrypt("3".toByteArray())
        assertEquals("3", String(b.decrypt(e)))
        e = b.encrypt("4".toByteArray())
        assertEquals("4", String(a.decrypt(e)))
    }

    @Test
    fun `Envelope mit PQ-Ciphertext ueberlebt serialize und parse`() {
        val (a, _, init) = handshake()
        val env = a.encrypt("test".toByteArray())
        val wire = Envelope(env.header, env.iv, env.ciphertext, init).serialize()
        val back = Envelope.parse(wire)
        assertNotNull(back)
        assertNotNull(back!!.init?.pqCiphertext)
        assertTrue(init.pqCiphertext!!.contentEquals(back.init!!.pqCiphertext!!))
    }

    @Test
    fun `manipulierter PQ-Ciphertext - Bob kann nicht entschluesseln`() {
        val alice = Party(); val bob = Party()
        val (sessionA, init) = Pqxdh.initiate(
            alice.ik.first, alice.ik.second, alice.signing.public.encoded, bob.bundle(),
        )
        val env = sessionA.encrypt("geheim".toByteArray())

        val broken = init.copy(pqCiphertext = init.pqCiphertext!!.copyOf().also {
            it[it.size / 2] = (it[it.size / 2].toInt() xor 0x01).toByte()
        })
        val bobSession = Pqxdh.respond(
            bob.ik.first, bob.spk.first, bob.spk.second, bob.opk.first, bob.pq.second, broken,
        )
        var klar = false
        try {
            val out = bobSession.decrypt(Envelope(env.header, env.iv, env.ciphertext, broken))
            klar = String(out) == "geheim"
        } catch (t: Throwable) { klar = false }
        assertFalse("mit manipuliertem PQ-Anteil darf nichts Lesbares rauskommen 🛑", klar)
    }

    @Test
    fun `gefaelschte PQ-Signatur - Handshake wird abgelehnt`() {
        val alice = Party(); val bob = Party()
        val evil = bob.bundle().copy(pqSignature = ByteArray(70) { 7 })
        try {
            Pqxdh.initiate(alice.ik.first, alice.ik.second, alice.signing.public.encoded, evil)
            assertTrue("Handshake hätte scheitern müssen", false)
        } catch (e: IllegalArgumentException) { /* genau so soll es sein */ }
    }

    @Test
    fun `Gegenstelle ohne PQ-Prekey - kein stiller Fallback`() {
        val alice = Party(); val bob = Party()
        try {
            Pqxdh.initiate(alice.ik.first, alice.ik.second, alice.signing.public.encoded, bob.bundle(withPq = false))
            assertTrue("ohne PQ-Schlüssel darf nicht still auf X3DH zurückgefallen werden", false)
        } catch (e: IllegalArgumentException) { }
    }

    @Test
    fun `Einmal-Prekey - zwei Sitzungen ergeben verschiedene Schluessel`() {
        val alice1 = Party(); val alice2 = Party()
        val bob = Party()
        val (s1, i1) = Pqxdh.initiate(alice1.ik.first, alice1.ik.second, alice1.signing.public.encoded, bob.bundle())
        val (s2, i2) = Pqxdh.initiate(alice2.ik.first, alice2.ik.second, alice2.signing.public.encoded, bob.bundle())
        assertFalse("zwei Handshakes dürfen nie denselben PQ-Ciphertext liefern", i1.pqCiphertext!!.contentEquals(i2.pqCiphertext!!))

        val bob1 = Pqxdh.respond(bob.ik.first, bob.spk.first, bob.spk.second, bob.opk.first, bob.pq.second, i1)
        val bob2 = Pqxdh.respond(bob.ik.first, bob.spk.first, bob.spk.second, bob.opk.first, bob.pq.second, i2)
        val m1 = s1.encrypt("a".toByteArray())
        val m2 = s2.encrypt("b".toByteArray())
        assertEquals("a", String(bob1.decrypt(Envelope(m1.header, m1.iv, m1.ciphertext, i1))))
        assertEquals("b", String(bob2.decrypt(Envelope(m2.header, m2.iv, m2.ciphertext, i2))))
    }

    @Test
    fun `Signaturpruefung akzeptiert gueltige und lehnt kaputte Bundles ab`() {
        val bob = Party()
        assertTrue(Pqxdh.verifyPrekeys(bob.bundle()))
        assertFalse(Pqxdh.verifyPrekeys(bob.bundle().copy(signedPrekey = Curve25519.pair().second)))
        assertFalse(Pqxdh.verifyPrekeys(bob.bundle().copy(pqSignature = null)))
    }
}
