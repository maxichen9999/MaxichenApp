package de.maxichen.app.crypto

/* =====================================================================
   👥 V4.6 — SENDER KEYS (Gruppen-E2E, Signal-Protokoll)
   ---------------------------------------------------------------------
   Warum nicht einfach „Ratchet pro Paar"? Bei 8 Leuten wären das 28
   Sessions und 28× Ciphertext pro Nachricht. Signal löst das so:

   • jede Person erzeugt EINEN eigenen Sender-Key
       - Chain-Key (32 B)   → daraus werden die Message-Keys gekettet
       - Signing-Key (P-256) → signiert jede Nachricht
   • dieser Sender-Key wird EINMAL pro Gruppe verteilt (Sender Key
     Distribution Message, SKDM) — verschlüsselt über die bestehenden
     1:1-Doppel-Ratchet-Sessions (X3DH), nicht im Klartext
   • danach kostet eine Gruppen-Nachricht genau einen Ciphertext + eine
     Signatur, egal wie viele Mitglieder

   Schutz gegen Mitglieder-Angriff:
   der Chain-Key ist allen bekannt — die **Signatur** ist es nicht.
   Wer fälscht, fliegt bei jedem Empfänger auf (Signatur wird VOR der
   Entschlüsselung geprüft).
   ===================================================================== */

import java.io.ByteArrayOutputStream

class SenderKeyException(message: String) : Exception(message)

/** Was verteilt wird (SKDM) — enthält den Chain-Key, deshalb nur verschlüsselt transportieren. */
data class SenderKeyDistribution(
    val keyId: String,
    val chainKey: ByteArray,
    val signingKey: ByteArray,   // X.509-Pubkey (ECDSA P-256)
    val iteration: Int,
) {
    fun encode(): String = listOf(
        "skdm1", keyId, Crypto.b64(chainKey), Crypto.b64(signingKey), iteration.toString(),
    ).joinToString("|")

    companion object {
        fun parse(s: String): SenderKeyDistribution? {
            val p = s.split("|")
            if (p.size != 5 || p[0] != "skdm1") return null
            return try {
                SenderKeyDistribution(p[1], Crypto.unb64(p[2]), Crypto.unb64(p[3]), p[4].toInt())
            } catch (t: Throwable) {
                null
            }
        }
    }
}

/** Eine verschlüsselte Gruppen-Nachricht eines Absenders. */
data class SenderKeyMessage(
    val keyId: String,
    val iteration: Int,
    val iv: ByteArray,
    val ciphertext: ByteArray,
    val signature: ByteArray,
) {
    /** skm1|keyId|iteration|iv|ct|sig */
    fun encode(): String = listOf(
        "skm1", keyId, iteration.toString(),
        Crypto.b64(iv), Crypto.b64(ciphertext), Crypto.b64(signature),
    ).joinToString("|")

    companion object {
        fun parse(s: String): SenderKeyMessage? {
            val p = s.split("|")
            if (p.size != 6 || p[0] != "skm1") return null
            return try {
                SenderKeyMessage(p[1], p[2].toInt(), Crypto.unb64(p[3]), Crypto.unb64(p[4]), Crypto.unb64(p[5]))
            } catch (t: Throwable) {
                null
            }
        }
    }
}

/**
 * Zustand eines Senders (eigene Kette oder die eines empfangenen Senders).
 * Enthält bewusst KEINEN privaten Signing-Key, wenn es ein fremder Sender ist.
 */
class SenderKeyState(
    val keyId: String,
    var chainKey: ByteArray,
    var iteration: Int,
    val signingPub: ByteArray,
    private val signingPriv: java.security.PrivateKey? = null,
    val skipped: LinkedHashMap<Int, ByteArray> = LinkedHashMap(),
) {

    companion object {
        private val INFO_MSG = "MaxiChat-SenderKey-Msg-v1".toByteArray()
        private val INFO_AAD = "MaxiChat-SenderKey-v1".toByteArray()
        private const val MAX_SKIP = 2000

        fun kdfChain(ck: ByteArray): Pair<ByteArray, ByteArray> =
            Crypto.hmac(ck, byteArrayOf(0x01)) to Crypto.hmac(ck, byteArrayOf(0x02))

        fun deriveMessageKey(mk: ByteArray): Pair<ByteArray, ByteArray> {
            val out = Crypto.hkdf(mk, salt = ByteArray(32), info = INFO_MSG, length = 44)
            return out.copyOfRange(0, 32) to out.copyOfRange(32, 44)
        }

        /** AAD = Protokoll-Label ‖ keyId ‖ iteration ‖ chatId → Nachricht ist an Chat + Position gebunden */
        fun aad(keyId: String, iteration: Int, namespace: ByteArray): ByteArray =
            ByteArrayOutputStream().apply {
                write(INFO_AAD)
                write(byteArrayOf(0x1F))
                write(keyId.toByteArray())
                write(byteArrayOf(0x1F))
                write(intBytes(iteration))
                write(byteArrayOf(0x1F))
                write(namespace)
            }.toByteArray()

        fun intBytes(v: Int): ByteArray =
            byteArrayOf((v ushr 24).toByte(), (v ushr 16).toByte(), (v ushr 8).toByte(), v.toByte())

        /** Eigene Sender-Kette anlegen (Signing-Key-Paar inklusive). */
        fun create(): Pair<SenderKeyState, SenderKeyDistribution> {
            val ck = Crypto.randomBytes(32)
            val kp = Crypto.newSigningKeyPair()
            val pub = Crypto.publicToBytes(kp.public)
            val id = Crypto.b64(Crypto.randomBytes(9))
            val st = SenderKeyState(id, ck, 0, pub, kp.private)
            return st to SenderKeyDistribution(id, st.chainKey.copyOf(), pub, 0)
        }

        /** Empfangene SKDM einbauen (nur Chain-Key + Verify-Key, kein Private Key). */
        fun fromDistribution(d: SenderKeyDistribution, namespace: ByteArray): SenderKeyState =
            SenderKeyState(d.keyId, d.chainKey.copyOf(), d.iteration, d.signingKey)

        fun deserialize(s: String): SenderKeyState? {
            val p = s.split("|")
            if (p.size != 7 || p[0] != "sk1") return null
            return try {
                val skipped = LinkedHashMap<Int, ByteArray>()
                if (p[5].isNotEmpty()) {
                    p[5].split(",").forEach { pair ->
                        val i = pair.indexOf('=')
                        if (i > 0) skipped[pair.substring(0, i).toInt()] = Crypto.unb64(pair.substring(i + 1))
                    }
                }
                SenderKeyState(
                    keyId = p[1],
                    chainKey = Crypto.unb64(p[2]),
                    iteration = p[3].toInt(),
                    signingPub = Crypto.unb64(p[4]),
                    signingPriv = p[6].takeIf { it.isNotEmpty() }?.let { Crypto.privateFromBytes(Crypto.unb64(it)) },
                    skipped = skipped,
                )
            } catch (t: Throwable) {
                null
            }
        }
    }

    val isOwn: Boolean get() = signingPriv != null

    fun serialize(): String {
        val skip = skipped.entries.joinToString(",") { it.key.toString() + "=" + Crypto.b64(it.value) }
        return listOf(
            "sk1", keyId, Crypto.b64(chainKey), iteration.toString(), Crypto.b64(signingPub),
            skip, signingPriv?.let { Crypto.b64(Crypto.privateToBytes(it)) } ?: "",
        ).joinToString("|")
    }

    /* ------------------------- Senden ------------------------- */

    fun encrypt(plaintext: ByteArray, namespace: ByteArray): SenderKeyMessage {
        val priv = signingPriv ?: throw SenderKeyException("Kein eigener Sender-Key — Senden nicht möglich")
        val (mk, next) = kdfChain(chainKey)
        val (key, iv) = deriveMessageKey(mk)
        val aad = aad(keyId, iteration, namespace)
        val ct = Crypto.aesGcmEncrypt(key, iv, plaintext, aad)
        // signiert wird Kopf + Ciphertext: Manipulation an Iteration/Chat fällt auf
        val toSign = aad + iv + ct
        val sig = Crypto.sign(priv, toSign)
        val msg = SenderKeyMessage(keyId, iteration, iv, ct, sig)
        chainKey = next
        iteration++
        return msg
    }

    /* ------------------------- Empfangen ------------------------- */

    fun decrypt(msg: SenderKeyMessage, namespace: ByteArray): ByteArray {
        if (msg.keyId != keyId) throw SenderKeyException("Falsche Sender-Key-ID")
        val aad = aad(keyId, msg.iteration, namespace)

        // 1) Signatur ZUERST — sonst könnte jedes Mitglied im Namen anderer schreiben
        val toVerify = aad + msg.iv + msg.ciphertext
        if (!Crypto.verify(signingPub, toVerify, msg.signature)) {
            throw SenderKeyException("Signatur ungültig — Nachricht ist gefälscht 🛑")
        }

        // 2) verpasste Nachricht?
        skipped.remove(msg.iteration)?.let { mk ->
            val (key, _) = deriveMessageKey(mk)
            return openOrThrow(key, msg, namespace)
        }

        if (msg.iteration < iteration) throw SenderKeyException("Nachricht zu alt oder doppelt (#${msg.iteration})")
        if (msg.iteration - iteration > MAX_SKIP) throw SenderKeyException("Zu viele verpasste Nachrichten")

        // 3) bis zur Nachricht vorlaufen, verpasste Keys merken
        while (iteration < msg.iteration) {
            val (mk, next) = kdfChain(chainKey)
            skipped[iteration] = mk
            chainKey = next
            iteration++
        }
        while (skipped.size > MAX_SKIP) skipped.remove(skipped.keys.first())

        val (mk, next) = kdfChain(chainKey)
        chainKey = next
        iteration++
        val (key, _) = deriveMessageKey(mk)
        return openOrThrow(key, msg, namespace)
    }

    private fun openOrThrow(key: ByteArray, msg: SenderKeyMessage, namespace: ByteArray): ByteArray = try {
        Crypto.aesGcmDecrypt(key, msg.iv, msg.ciphertext, aad(keyId, msg.iteration, namespace))
    } catch (t: Throwable) {
        throw SenderKeyException("Entschlüsselung fehlgeschlagen (falscher Schlüssel oder manipuliert)")
    }
}
