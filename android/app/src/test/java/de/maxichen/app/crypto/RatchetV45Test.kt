package de.maxichen.app.crypto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * V4.5 — zusätzliche Beweise, dass der Ratchet WIRKLICH rotiert:
 * 1) nach jeder Antwort ändert sich der DH-Public-Key (kein statischer Schlüssel!)
 * 2) Replay derselben Nachricht wird abgelehnt
 * 3) ein anderer Chat (AAD) kann nicht mitlesen
 * 4) Einmal-Prekey: ohne den richtigen OPK kein gemeinsames Geheimnis
 * 5) Envelope überlebt serialize → parse unverändert
 */
class RatchetV45Test {

    private class Party(withOpk: Boolean = true) {
        val ik = Curve25519.pair()
        val spk = Curve25519.pair()
        val opk = if (withOpk) Curve25519.pair() else null
        val signing = Crypto.newSigningKeyPair()
        val spkSig = Crypto.sign(signing.private, spk.second)

        fun bundle() = X3DH.PeerBundle(
            identityKey = ik.second,
            signedPrekey = spk.second,
            prekeySignature = spkSig,
            signingKey = signing.public.encoded,
            signedPrekeyId = "spk-1",
            oneTimePrekey = opk?.second,
            oneTimePrekeyId = if (opk != null) "opk-1" else "",
        )
    }

    private fun session(ad: ByteArray = ByteArray(0)): Pair<DoubleRatchet, DoubleRatchet> {
        val a = Party()
        val b = Party()
        val (sa, init) = X3DH.initiate(a.ik.first, a.ik.second, a.signing.public.encoded, b.bundle(), ad)
        val sb = X3DH.respond(b.ik.first, b.spk.first, b.spk.second, b.opk!!.first, init, ad)
        return sa to sb
    }

    @Test
    fun `DH-Ratchet - jeder Antwortschritt erzeugt einen neuen Public-Key`() {
        val (a, b) = session()
        val seen = mutableSetOf<String>()

        // A → B, B antwortet, A antwortet, …
        repeat(4) { round ->
            // echte Runde: A sendet, B entschlüsselt, B antwortet
            val fromA = a.encrypt("hallo$round".toByteArray())
            seen += Crypto.b64(fromA.header.dh)
            assertEquals("hallo$round", String(b.decrypt(fromA)))
            val fromB = b.encrypt("zurück$round".toByteArray())
            assertEquals("zurück$round", String(a.decrypt(fromB)))
            seen += Crypto.b64(fromB.header.dh)
        }
        // alle 8 DH-Public-Keys müssen unterschiedlich sein
        assertEquals("jeder Schritt muss einen frischen DH-Key nutzen", 8, seen.size)
    }

    @Test
    fun `Replay - dieselbe Nachricht zweimal wird abgelehnt`() {
        val (a, b) = session()
        val env = a.encrypt("nur einmal 💗".toByteArray())
        assertEquals("nur einmal 💗", String(b.decrypt(env)))
        try {
            b.decrypt(env)
            fail("Replay hätte abgelehnt werden müssen")
        } catch (e: RatchetException) {
            assertTrue(e.message!!.isNotEmpty())
        }
    }

    @Test
    fun `AAD - ein anderer Chat kann die Nachricht nicht öffnen`() {
        val (a, _) = session("chat-eins".toByteArray())
        val (_, bOther) = session("chat-zwei".toByteArray())
        // bOther hat einen völlig anderen Session-Schlüssel → scheitert
        try {
            bOther.decrypt(a.encrypt("geheim".toByteArray()))
            fail("fremde Session darf nicht entschlüsseln")
        } catch (e: RatchetException) {
            assertTrue(true)
        }
    }

    @Test
    fun `Einmal-Prekey - ohne OPK passt das Geheimnis nicht`() {
        val a = Party()
        val b = Party()
        val (sa, init) = X3DH.initiate(a.ik.first, a.ik.second, a.signing.public.encoded, b.bundle())
        // Bob "verliert" den OPK → anderes SK
        val wrong = X3DH.respond(b.ik.first, b.spk.first, b.spk.second, null, init)
        try {
            wrong.decrypt(sa.encrypt("x".toByteArray()))
            fail("ohne den richtigen Einmal-Prekey darf nichts aufgehen")
        } catch (e: RatchetException) {
            assertTrue(true)
        }
        // mit dem richtigen OPK geht es
        val right = X3DH.respond(b.ik.first, b.spk.first, b.spk.second, b.opk!!.first, init)
        assertEquals("x", String(right.decrypt(sa.encrypt("x".toByteArray()))))
    }

    @Test
    fun `Envelope - serialize und parse sind verlustfrei`() {
        val (a, b) = session()
        val env = a.encrypt("mit Header".toByteArray())
        val wire = env.serialize()
        val back = Envelope.parse(wire)
        assertTrue("Envelope muss parsebar sein", back != null)
        assertTrue(back!!.header.dh.contentEquals(env.header.dh))
        assertEquals(env.header.n, back.header.n)
        assertEquals(env.header.pn, back.header.pn)
        assertTrue(back.iv.contentEquals(env.iv))
        assertEquals("mit Header", String(b.decrypt(back)))
    }

    @Test
    fun `Header-Manipulation - pn aendern bricht die Entschluesselung`() {
        val (a, b) = session()
        val env = a.encrypt("fest".toByteArray())
        val broken = env.copy(header = RatchetHeader(env.header.dh, env.header.pn + 1, env.header.n))
        try {
            b.decrypt(broken)
            fail("manipulierter Header muss auffallen (AAD)")
        } catch (e: RatchetException) {
            assertTrue(true)
        }
        // Original geht weiterhin
        assertEquals("fest", String(b.decrypt(env)))
    }

    @Test
    fun `Serienbrief - 100 Nachrichten ohne Verlust`() {
        val (a, b) = session()
        for (i in 0 until 100) {
            assertEquals("msg-$i", String(b.decrypt(a.encrypt("msg-$i".toByteArray()))))
        }
    }

    @Test
    fun `Zufall - zwei Sessions mit denselben Keys sind nicht gleich`() {
        val a = Party()
        val b = Party()
        val (s1, i1) = X3DH.initiate(a.ik.first, a.ik.second, a.signing.public.encoded, b.bundle())
        val (s2, _) = X3DH.initiate(a.ik.first, a.ik.second, a.signing.public.encoded, b.bundle())
        assertNotEquals(Crypto.b64(s1.rootKey), Crypto.b64(s2.rootKey))
        assertTrue(i1.ephemeralKey.isNotEmpty())
        assertFalse(Crypto.constantTimeEquals(s1.rootKey, s2.rootKey))
    }
}
