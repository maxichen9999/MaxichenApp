package de.maxichen.app.crypto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * V4.6 — Sender Keys (Gruppen-E2E). Echte Fälle, keine Gefälligkeiten:
 * 1) ein Sender → drei Empfänger lesen dieselbe Nachricht
 * 2) Out-of-order 3 → 1 → 2
 * 3) manipulierter Ciphertext fliegt auf (AEAD)
 * 4) Fälschung durch ein Gruppenmitglied fliegt auf (Signatur VOR Entschlüsselung)
 * 5) manipulierter Header/Iteration fliegt auf (AAD)
 * 6) Replay wird abgelehnt
 * 7) fremder Chat (Namespace) kann nicht mitlesen
 * 8) Persistenz: serialize → deserialize → weiterreden
 * 9) 100 Nachrichten, jede mit eigenem Key
 * 10) SKDM-Rundreise + Ketten-Key ändert sich (Forward Secrecy der Kette)
 */
class SenderKeyTest {

    private val ns = "chat-Gruppe-42".toByteArray()

    private fun sender(): Pair<SenderKeyState, SenderKeyDistribution> = SenderKeyState.create()


    @Test
    fun `ein Sender - drei Empfaenger lesen dieselbe Nachricht`() {
        val (s, dist) = sender()
        val r1 = SenderKeyState.fromDistribution(dist, ns)
        val r2 = SenderKeyState.fromDistribution(dist, ns)
        val r3 = SenderKeyState.fromDistribution(dist, ns)

        val msg = s.encrypt("Hallo Gruppe 💗".toByteArray(), ns)
        assertEquals("Hallo Gruppe 💗", String(r1.decrypt(msg, ns)))
        assertEquals("Hallo Gruppe 💗", String(r2.decrypt(msg, ns)))
        assertEquals("Hallo Gruppe 💗", String(r3.decrypt(msg, ns)))
    }

    @Test
    fun `Out-of-order - Nachricht 3 kommt vor 1`() {
        val (s, dist) = sender()
        val r = SenderKeyState.fromDistribution(dist, ns)
        val m1 = s.encrypt("eins".toByteArray(), ns)
        val m2 = s.encrypt("zwei".toByteArray(), ns)
        val m3 = s.encrypt("drei".toByteArray(), ns)

        assertEquals("drei", String(r.decrypt(m3, ns)))
        assertEquals("eins", String(r.decrypt(m1, ns)))
        assertEquals("zwei", String(r.decrypt(m2, ns)))
    }

    @Test
    fun `manipulierter Ciphertext wird abgelehnt`() {
        val (s, dist) = sender()
        val r = SenderKeyState.fromDistribution(dist, ns)
        val msg = s.encrypt("echt".toByteArray(), ns)
        val ct = msg.ciphertext.copyOf()
        ct[ct.size / 2] = (ct[ct.size / 2].toInt() xor 0x01).toByte()
        try {
            r.decrypt(msg.copy(ciphertext = ct), ns)
            fail("Manipulation hätte auffallen müssen")
        } catch (e: SenderKeyException) {
            assertTrue(e.message!!.contains("Signatur") || e.message!!.contains("Entschlüsselung"))
        }
    }

    @Test
    fun `Faelschung - Mitglied ohne Signing-Key kann nicht im Namen anderer schreiben`() {
        val (alice, distA) = sender()
        // Bob ist Mitglied: er hat Alices Chain-Key (aus der SKDM), aber NICHT ihren private signing key
        val bob = SenderKeyState.fromDistribution(distA, ns)
        assertFalse("Bob darf nicht als Alice senden können", bob.isOwn)
        try {
            bob.encrypt("ich bin Alice".toByteArray(), ns)
            fail("Fälschung hätte unmöglich sein müssen")
        } catch (e: SenderKeyException) {
            assertTrue(e.message!!.contains("eigener Sender-Key"))
        }

        // Bob baut sich einen eigenen Signing-Key und signiert damit → Signatur passt nicht zu Alices Key
        val fakeKp = Crypto.newSigningKeyPair()
        val fakeSig = Crypto.sign(fakeKp.private, SenderKeyState.aad(distA.keyId, 0, ns) + ByteArray(12) + byteArrayOf(1, 2, 3))
        val forged = SenderKeyMessage(distA.keyId, 0, ByteArray(12), byteArrayOf(1, 2, 3), fakeSig)
        try {
            SenderKeyState.fromDistribution(distA, ns).decrypt(forged, ns)
            fail("gefälschte Signatur hätte auffallen müssen")
        } catch (e: SenderKeyException) {
            assertTrue(e.message!!.contains("Signatur"))
        }
        assertNotNull(alice)
    }

    @Test
    fun `Header-Manipulation - Iteration aendern bricht die Signatur`() {
        val (s, dist) = sender()
        val r = SenderKeyState.fromDistribution(dist, ns)
        val msg = s.encrypt("position".toByteArray(), ns)
        val shifted = msg.copy(iteration = msg.iteration + 5)
        try {
            r.decrypt(shifted, ns)
            fail("verschobene Iteration hätte auffallen müssen")
        } catch (e: SenderKeyException) {
            assertTrue(true)
        }
        // Original geht weiterhin
        assertEquals("position", String(r.decrypt(msg, ns)))
    }

    @Test
    fun `Replay - dieselbe Nachricht zweimal wird abgelehnt`() {
        val (s, dist) = sender()
        val r = SenderKeyState.fromDistribution(dist, ns)
        val msg = s.encrypt("nur einmal".toByteArray(), ns)
        assertEquals("nur einmal", String(r.decrypt(msg, ns)))
        try {
            r.decrypt(msg, ns)
            fail("Replay hätte abgelehnt werden müssen")
        } catch (e: SenderKeyException) {
            assertTrue(e.message!!.contains("zu alt") || e.message!!.contains("doppelt"))
        }
    }

    @Test
    fun `fremder Chat - gleiche Sender-Keys in anderem Namespace oeffnen nichts`() {
        val (s, dist) = sender()
        val msg = s.encrypt("nur für Gruppe 42".toByteArray(), ns)
        val other = "chat-andere-Gruppe".toByteArray()
        try {
            SenderKeyState.fromDistribution(dist, other).decrypt(msg, other)
            fail("anderer Namespace darf nicht entschlüsseln")
        } catch (e: SenderKeyException) {
            assertTrue(true)
        }
    }

    @Test
    fun `Persistenz - serialize und deserialize verlieren nichts`() {
        val (s, dist) = sender()
        val m1 = s.encrypt("vor dem Neustart".toByteArray(), ns)
        val r = SenderKeyState.fromDistribution(dist, ns)

        val s2 = SenderKeyState.deserialize(s.serialize())
        val r2 = SenderKeyState.deserialize(r.serialize())
        assertNotNull(s2)
        assertNotNull(r2)

        assertEquals("vor dem Neustart", String(r2!!.decrypt(m1, ns)))
        val m2 = s2!!.encrypt("nach dem Neustart".toByteArray(), ns)
        assertEquals("nach dem Neustart", String(r2.decrypt(m2, ns)))
    }

    @Test
    fun `Kette - 100 Nachrichten, jeder Key ist neu`() {
        val (s, dist) = sender()
        val r = SenderKeyState.fromDistribution(dist, ns)
        val seen = HashSet<String>()
        for (i in 0 until 100) {
            val before = Crypto.b64(s.chainKey)
            val m = s.encrypt("n$i".toByteArray(), ns)
            seen += before
            assertEquals("n$i", String(r.decrypt(m, ns)))
        }
        assertEquals("jede Nachricht muss einen frischen Chain-Key verbrauchen", 100, seen.size)
    }

    @Test
    fun `SKDM - Rundreise ueber encode parse`() {
        val (_, dist) = sender()
        val wire = dist.encode()
        val back = SenderKeyDistribution.parse(wire)
        assertNotNull(back)
        assertEquals(dist.keyId, back!!.keyId)
        assertTrue(dist.chainKey.contentEquals(back.chainKey))
        assertTrue(dist.signingKey.contentEquals(back.signingKey))
        assertEquals(dist.iteration, back.iteration)
        assertNull(SenderKeyDistribution.parse("kaputt"))
        assertNull(SenderKeyDistribution.parse("skdm1|a|b"))
    }

    @Test
    fun `Nachricht - encode parse und unbekannter Key werden erkannt`() {
        val (s, dist) = sender()
        val msg = s.encrypt("wire".toByteArray(), ns)
        val back = SenderKeyMessage.parse(msg.encode())
        assertNotNull(back)
        assertEquals(msg.iteration, back!!.iteration)
        assertEquals("wire", String(SenderKeyState.fromDistribution(dist, ns).decrypt(back, ns)))

        // Nachricht eines anderen Senders (andere keyId) an falschen State
        val (_, distOther) = sender()
        val r = SenderKeyState.fromDistribution(distOther, ns)
        try {
            r.decrypt(msg, ns)
            fail("fremde keyId hätte auffallen müssen")
        } catch (e: SenderKeyException) {
            assertTrue(e.message!!.contains("Key-ID"))
        }
    }

    @Test
    fun `zwei Sender in einer Gruppe stoeren sich nicht`() {
        val (a, distA) = sender()
        val (b, distB) = sender()
        assertNotEquals(distA.keyId, distB.keyId)

        val aToB = SenderKeyState.fromDistribution(distA, ns)
        val bToA = SenderKeyState.fromDistribution(distB, ns)

        val ma = a.encrypt("von A".toByteArray(), ns)
        val mb = b.encrypt("von B".toByteArray(), ns)
        assertEquals("von A", String(aToB.decrypt(ma, ns)))
        assertEquals("von B", String(bToA.decrypt(mb, ns)))
    }
}
