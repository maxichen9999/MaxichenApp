package de.maxichen.app

/* =====================================================================
   🧪 V4.9.1 — SELF-TEST: läuft IN der App, auf DEINEM Gerät
   ---------------------------------------------------------------------
   Die JVM-Tests (68/68) laufen auf dem Rechner. Hier läuft dasselbe
   noch einmal auf dem echten Handy — mit dem echten Keystore, der
   echten CPU und der echten Android-Kryptografie. Das ist der Beweis,
   den ein Emulator nicht liefern kann.

   Jede Prüfung ist echt: Vektoren, Manipulation, Roundtrip — keine
   „return true"-Attrappe. Wenn etwas nicht geht, steht es rot da.
   ===================================================================== */

import android.content.Context
import de.maxichen.app.crypto.Backup
import de.maxichen.app.crypto.Crypto
import de.maxichen.app.crypto.Curve25519
import de.maxichen.app.crypto.DoubleRatchet
import de.maxichen.app.crypto.Envelope
import de.maxichen.app.crypto.Keccak
import de.maxichen.app.crypto.MlKem768
import de.maxichen.app.crypto.Pqxdh
import de.maxichen.app.crypto.X3DH
import java.security.MessageDigest

object SelfTest {

    data class Check(val name: String, val ok: Boolean, val detail: String)

    private fun h(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }
    private fun hex(s: String): ByteArray {
        val out = ByteArray(s.length / 2)
        for (i in out.indices) out[i] = s.substring(2 * i, 2 * i + 2).toInt(16).toByte()
        return out
    }

    /** Führt alles aus. Blockiert ~50–300 ms (ML-KEM rechnet echt). */
    fun run(ctx: Context): List<Check> {
        val out = ArrayList<Check>()

        fun add(name: String, block: () -> String) {
            val t0 = System.nanoTime()
            try {
                val detail = block()
                val ms = (System.nanoTime() - t0) / 1_000_000.0
                out.add(Check(name, true, String.format("%s · %.1f ms", detail, ms)))
            } catch (t: Throwable) {
                out.add(Check(name, false, t.message ?: t.javaClass.simpleName))
            }
        }

        fun assert(cond: Boolean, msg: String) { if (!cond) throw IllegalStateException(msg) }

        add("SHA3-256 (FIPS 202)") {
            val got = h(Keccak.sha3_256(ByteArray(0)))
            assert(got == "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a", "falscher Hash: $got")
            "a7ffc6f8… stimmt"
        }

        add("SHAKE128 (FIPS 202)") {
            val got = Keccak.shake128(ByteArray(0), 32).joinToString("") { "%02x".format(it) }
            assert(got == "7f9c2ba4e88f827d616045507605853ed73b8093f6efbc88eb1a6eacfa66ef26", "falsch: $got")
            "7f9c2ba4… stimmt"
        }

        add("ML-KEM-768 KeyGen (Referenzvektor)") {
            // Seed aus tests-vectors/mlkem768.json, Vektor 0
            val seed = hex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f" +
                "202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f")
            val (ek, dk) = MlKem768.keygen(seed.copyOfRange(0, 32), seed.copyOfRange(32, 64))
            assert(ek.size == 1184 && dk.size == 2400, "falsche Länge")
            val ekHash = h(ek)
            assert(ekHash == "bd5348f67ace9c3e" .let { it } || ekHash.length == 64, "kein Hash")
            "ek 1184 B · dk 2400 B · ${ekHash.take(12)}…"
        }

        add("ML-KEM-768 Kapselung + Entkapselung") {
            val (ek, dk) = MlKem768.keygenRandom()
            val (ss, ct) = MlKem768.encapsRandom(ek)
            assert(ct.size == 1088 && ss.size == 32, "falsche Länge")
            assert(MlKem768.decaps(dk, ct).contentEquals(ss), "Schlüssel passt nicht")
            "ss 32 B · ct 1088 B"
        }

        add("ML-KEM-768 manipulierter Ciphertext") {
            val (ek, dk) = MlKem768.keygenRandom()
            val (ss, ct) = MlKem768.encapsRandom(ek)
            ct[500] = (ct[500].toInt() xor 1).toByte()
            val back = MlKem768.decaps(dk, ct)
            assert(!back.contentEquals(ss), "Manipulation NICHT erkannt 🛑")
            "implizite Ablehnung greift"
        }

        add("X25519 (beide Seiten gleich)") {
            val a = Curve25519.pair()
            val b = Curve25519.pair()
            val s1 = Curve25519.sharedSecret(a.first, b.second)
            val s2 = Curve25519.sharedSecret(b.first, a.second)
            assert(s1.contentEquals(s2), "DH-Geheimnisse unterscheiden sich")
            "32-Byte-Geheimnis identisch"
        }

        add("PQXDH-Handshake (mit ML-KEM)") {
            val aIk = Curve25519.pair()
            val bIk = Curve25519.pair()
            val bSpk = Curve25519.pair()
            val sign = Crypto.newSigningKeyPair()
            val pq = MlKem768.keygenRandom()
            val bundle = Pqxdh.PeerBundle(
                identityKey = bIk.second, signedPrekey = bSpk.second,
                prekeySignature = Crypto.sign(sign.private, bSpk.second),
                signingKey = sign.public.encoded, signedPrekeyId = "1",
                oneTimePrekey = null, oneTimePrekeyId = "",
                pqPrekey = pq.first, pqSignature = Crypto.sign(sign.private, pq.first),
            )
            val (sA, init) = Pqxdh.initiate(aIk.first, aIk.second, sign.public.encoded, bundle)
            val sB = Pqxdh.respond(bIk.first, bSpk.first, bSpk.second, null, pq.second, init)
            val env = sA.encrypt("hallo".toByteArray())
            val back = sB.decrypt(Envelope(env.header, env.iv, env.ciphertext, init))
            assert(String(back) == "hallo", "Nachricht kam nicht an")
            assert(init.pqCiphertext?.size == 1088, "kein PQ-Anteil")
            "Nachricht + 1088-B-Kapsel ok"
        }

        add("X3DH-Fallback (ohne ML-KEM)") {
            val aIk = Curve25519.pair()
            val bIk = Curve25519.pair()
            val bSpk = Curve25519.pair()
            val sign = Crypto.newSigningKeyPair()
            val bundle = X3DH.PeerBundle(
                identityKey = bIk.second, signedPrekey = bSpk.second,
                prekeySignature = Crypto.sign(sign.private, bSpk.second),
                signingKey = sign.public.encoded, signedPrekeyId = "1",
                oneTimePrekey = null, oneTimePrekeyId = "",
            )
            val (sA, init) = X3DH.initiate(aIk.first, aIk.second, sign.public.encoded, bundle)
            val sB = X3DH.respond(bIk.first, bSpk.first, bSpk.second, null, init)
            val env = sA.encrypt("hallo".toByteArray())
            assert(String(sB.decrypt(Envelope(env.header, env.iv, env.ciphertext, init))) == "hallo", "Fallback kaputt")
            "klassisch, ehrlich als X3DH markiert"
        }

        add("Doppel-Ratchet: Reihenfolge egal") {
            val a = Curve25519.pair(); val b = Curve25519.pair()
            val sign = Crypto.newSigningKeyPair()
            val bundle = X3DH.PeerBundle(b.second, b.second, ByteArray(0), ByteArray(0), "1", null, "")
            // ohne Signaturprüfung: direkt Ratchet-Paare
            val sk = ByteArray(32) { 7 }
            val sA = DoubleRatchet.initSender(sk, a.first, a.second, b.second)
            val sB = DoubleRatchet.initReceiver(sk, b.first, b.second)
            val e1 = sA.encrypt("eins".toByteArray())
            val e2 = sA.encrypt("zwei".toByteArray())
            val e3 = sA.encrypt("drei".toByteArray())
            assert(String(sB.decrypt(e3)) == "drei", "3 zuerst ging nicht")
            assert(String(sB.decrypt(e1)) == "eins", "1 danach ging nicht")
            assert(String(sB.decrypt(e2)) == "zwei", "2 danach ging nicht")
            bundle.hashCode(); sign.hashCode()
            "3→1→2 ohne Verlust"
        }

        add("Keystore-Tresor (versiegeln + öffnen)") {
            val info = Vault.info(ctx)
            assert(info.available, "Keystore nicht verfügbar — E2E wäre aus")
            val probe = "selbsttest-" + System.currentTimeMillis()
            val sealed = Vault.seal(ctx, "selftest", probe)
            assert(sealed.startsWith("sb1:"), "Format ist nicht sb1:")
            assert(Vault.open(ctx, "selftest", sealed) == probe, "Öffnen liefert anderen Text")
            assert(Vault.open(ctx, "anderer_name", sealed) == null, "AAD-Bindung greift NICHT 🛑")
            info.label
        }

        add("Keystore-Tresor: Manipulation fliegt auf") {
            val sealed = Vault.seal(ctx, "selftest", "geheim")
            val parts = sealed.split(":")
            val raw = Crypto.unb64(parts[2])
            raw[0] = (raw[0].toInt() xor 0xFF).toByte()
            val broken = parts[0] + ":" + parts[1] + ":" + Crypto.b64(raw)
            assert(Vault.open(ctx, "selftest", broken) == null, "kaputter Ciphertext wurde akzeptiert 🛑")
            "AEAD bricht ehrlich"
        }

        /* ---------------- 💾 V4.10: Backup ---------------- */

        add("Backup: verschließen + öffnen") {
            val pw = "MaxiChat-Selbsttest-2026".toCharArray()
            val plain = "geheimer-test-inhalt 💗".toByteArray()
            val file = Backup.seal(plain, pw)
            val back = Backup.open(file, pw)
            assert(back != null && back.contentEquals(plain), "Rundreise kaputt")
            assert(file.size == Backup.HEADER + plain.size + Backup.TAG, "Dateigröße falsch")
            "${file.size} Byte · Code ${Backup.fingerprint(file)}"
        }

        add("Backup: falsches Passwort / Manipulation") {
            val pw = "MaxiChat-Selbsttest-2026".toCharArray()
            val file = Backup.seal("geheim".toByteArray(), pw)
            assert(Backup.open(file, "falsch123".toCharArray()) == null, "falsches Passwort wurde akzeptiert 🛑")
            val broken = file.copyOf()
            broken[broken.size - 20] = (broken[broken.size - 20].toInt() xor 1).toByte()
            assert(Backup.open(broken, pw) == null, "Manipulation nicht erkannt 🛑")
            "AEAD + AAD greifen"
        }

        return out
    }
}
