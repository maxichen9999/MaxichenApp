package de.maxichen.app.crypto

/* =====================================================================
   🔁 DOUBLE RATCHET (Signal-Protokoll, V4.5)
   ---------------------------------------------------------------------
   Was hier wirklich passiert:
   • X25519-DH-Ratchet: bei jeder Antwort wird ein NEUES Schlüsselpaar
     erzeugt → ein gestohlener Schlüssel öffnet nur alte Nachrichten
   • Root-Chain → Send-Chain → Message-Keys (HKDF-SHA256)
   • Nachrichten-Keys werden nach Gebrauch gelöscht
   • Out-of-order: verpasste Keys werden begrenzt zwischengespeichert
     (max. 2000, älteste fliegen raus)
   • AES-256-GCM mit Header als AAD → Header-Manipulation fliegt auf
   • Prekey-Init (X3DH-Lite): IK · SPK · OPK → gemeinsames SK
   ===================================================================== */

import java.io.ByteArrayOutputStream

private fun intBytes(v: Int): ByteArray = byteArrayOf(
    (v ushr 24).toByte(), (v ushr 16).toByte(), (v ushr 8).toByte(), v.toByte(),
)

data class RatchetHeader(val dh: ByteArray, val pn: Int, val n: Int) {
    fun encode(): ByteArray {
        val out = ByteArrayOutputStream()
        out.write(dh)
        out.write(intBytes(pn))
        out.write(intBytes(n))
        return out.toByteArray()
    }

    override fun equals(other: Any?): Boolean =
        other is RatchetHeader && dh.contentEquals(other.dh) && pn == other.pn && n == other.n

    override fun hashCode(): Int = dh.contentHashCode() * 31 + pn * 17 + n
}

data class PreKeyInit(
    val identityKey: ByteArray,      // IK_A (X25519 pub)
    val ephemeralKey: ByteArray,     // EK_A (X25519 pub)
    val signingKey: ByteArray,       // EC-P256 pub (X.509) von A
    val signedPrekeyId: String,
    val oneTimePrekeyId: String,
    /** V4.9: ML-KEM-768-Ciphertext (1088 B) — nur bei PQXDH gesetzt. */
    val pqCiphertext: ByteArray? = null,
)

data class Envelope(
    val header: RatchetHeader,
    val iv: ByteArray,
    val ciphertext: ByteArray,
    val init: PreKeyInit? = null,
) {
    /** kompaktes Format: dh|pn|n|iv|ct|[init] */
    fun serialize(): String {
        val parts = mutableListOf(
            Crypto.b64(header.dh), header.pn.toString(), header.n.toString(),
            Crypto.b64(iv), Crypto.b64(ciphertext),
        )
        if (init != null) {
            parts += Crypto.b64(init.identityKey)
            parts += Crypto.b64(init.ephemeralKey)
            parts += Crypto.b64(init.signingKey)
            parts += init.signedPrekeyId
            parts += init.oneTimePrekeyId
            // V4.9: nur anhängen, wenn vorhanden -> alte Envelopes bleiben lesbar
            init.pqCiphertext?.let { parts += Crypto.b64(it) }
        }
        return parts.joinToString("|")
    }

    companion object {
        fun parse(s: String): Envelope? {
            val p = s.split("|")
            if (p.size < 5) return null
            return try {
                Envelope(
                    RatchetHeader(Crypto.unb64(p[0]), p[1].toInt(), p[2].toInt()),
                    Crypto.unb64(p[3]),
                    Crypto.unb64(p[4]),
                    if (p.size >= 10) PreKeyInit(
                        Crypto.unb64(p[5]), Crypto.unb64(p[6]), Crypto.unb64(p[7]), p[8], p[9],
                        if (p.size >= 11 && p[10].isNotEmpty()) Crypto.unb64(p[10]) else null,
                    ) else null,
                )
            } catch (t: Throwable) {
                null
            }
        }
    }
}

class RatchetException(message: String) : Exception(message)

class DoubleRatchet(
    var rootKey: ByteArray,
    var dhSelfPriv: ByteArray,
    var dhSelfPub: ByteArray,
    var dhRemotePub: ByteArray? = null,
    var sendChainKey: ByteArray? = null,
    var recvChainKey: ByteArray? = null,
    var sendCount: Int = 0,
    var recvCount: Int = 0,
    var prevSendCount: Int = 0,
    val skipped: LinkedHashMap<String, ByteArray> = LinkedHashMap(),
    var associatedData: ByteArray = ByteArray(0),
) {

    companion object {
        fun intBytes(v: Int): ByteArray = byteArrayOf(
            (v ushr 24).toByte(), (v ushr 16).toByte(), (v ushr 8).toByte(), v.toByte(),
        )

        private val INFO_ROOT = "MaxiChat-Ratchet-Root-v1".toByteArray()
        private val INFO_MSG = "MaxiChat-Ratchet-Msg-v1".toByteArray()
        private val INFO_X3DH = "MaxiChat-X3DH-v1".toByteArray()

        /**
         * Alice nach X3DH: die erste Send-Chain entsteht direkt aus
         * KDF_RK(SK, DH(EK_A, SPK_B)) — genau der Wert, den Bob beim ersten
         * Empfang als Empfangs-Chain ableitet.
         */
        fun initSender(
            sk: ByteArray, ephPriv: ByteArray, ephPub: ByteArray, remoteSpkPub: ByteArray,
            associatedData: ByteArray = ByteArray(0),
        ): DoubleRatchet {
            val dh0 = Curve25519.sharedSecret(ephPriv, remoteSpkPub)
            val (rk, ck) = kdfRoot(sk, dh0)
            return DoubleRatchet(
                rootKey = rk,
                dhSelfPriv = ephPriv.copyOf(),
                dhSelfPub = ephPub.copyOf(),
                dhRemotePub = remoteSpkPub.copyOf(),
                sendChainKey = ck,
                associatedData = associatedData,
            )
        }

        /** Bob nach X3DH (empfängt zuerst) */
        fun initReceiver(
            sk: ByteArray, spkPriv: ByteArray, spkPub: ByteArray,
            associatedData: ByteArray = ByteArray(0),
        ): DoubleRatchet = DoubleRatchet(
            rootKey = sk.copyOf(),
            dhSelfPriv = spkPriv.copyOf(),
            dhSelfPub = spkPub.copyOf(),
            dhRemotePub = null,
            associatedData = associatedData,
        )

        fun kdfRoot(root: ByteArray, dhOut: ByteArray): Pair<ByteArray, ByteArray> {
            val out = Crypto.hkdf(dhOut, salt = root, info = INFO_ROOT, length = 64)
            return out.copyOfRange(0, 32) to out.copyOfRange(32, 64)
        }

        fun kdfChain(ck: ByteArray): Pair<ByteArray, ByteArray> {
            val mk = Crypto.hmac(ck, byteArrayOf(0x01))
            val next = Crypto.hmac(ck, byteArrayOf(0x02))
            return mk to next
        }

        fun deriveMessageKey(mk: ByteArray): Pair<ByteArray, ByteArray> {
            val out = Crypto.hkdf(mk, salt = ByteArray(32), info = INFO_MSG, length = 44)
            return out.copyOfRange(0, 32) to out.copyOfRange(32, 44)
        }

        fun deserialize(s: String): DoubleRatchet? {
            val p = s.split("|")
            if (p.size < 11) return null
            return try {
                val skipped = LinkedHashMap<String, ByteArray>()
                if (p[9].isNotEmpty()) {
                    for (pair in p[9].split(",")) {
                        val i = pair.indexOf('=')
                        if (i > 0) skipped[pair.substring(0, i)] = Crypto.unb64(pair.substring(i + 1))
                    }
                }
                DoubleRatchet(
                    rootKey = Crypto.unb64(p[0]),
                    dhSelfPriv = Crypto.unb64(p[1]),
                    dhSelfPub = Crypto.unb64(p[2]),
                    dhRemotePub = p[3].takeIf { it.isNotEmpty() }?.let { Crypto.unb64(it) },
                    sendChainKey = p[4].takeIf { it.isNotEmpty() }?.let { Crypto.unb64(it) },
                    recvChainKey = p[5].takeIf { it.isNotEmpty() }?.let { Crypto.unb64(it) },
                    sendCount = p[6].toInt(),
                    recvCount = p[7].toInt(),
                    prevSendCount = p[8].toInt(),
                    skipped = skipped,
                    associatedData = if (p[10].isEmpty()) ByteArray(0) else Crypto.unb64(p[10]),
                )
            } catch (t: Throwable) {
                null
            }
        }
    }

    /* ---------------- Senden ---------------- */

    fun encrypt(plaintext: ByteArray): Envelope {
        if (sendChainKey == null) {
            val remote = dhRemotePub ?: throw RatchetException("Kein Remote-Key — Session nicht initialisiert")
            // Nur die Sende-Seite weiterdrehen (Empfangs-Kette bleibt unberührt)
            val (newPriv, newPub) = Curve25519.pair()
            val (rk, ck) = kdfRoot(rootKey, Curve25519.sharedSecret(newPriv, remote))
            prevSendCount = sendCount
            sendCount = 0
            rootKey = rk
            sendChainKey = ck
            dhSelfPriv = newPriv
            dhSelfPub = newPub
        }
        val (mk, next) = kdfChain(sendChainKey!!)
        sendChainKey = next
        val (key, iv) = deriveMessageKey(mk)
        val header = RatchetHeader(dhSelfPub, prevSendCount, sendCount)
        sendCount++
        val aad = header.encode() + associatedData
        val ct = Crypto.aesGcmEncrypt(key, iv, plaintext, aad)
        return Envelope(header, iv, ct, null)
    }

    /* ---------------- Empfangen ---------------- */

    /**
     * Entschlüsselt transaktional: schlägt die Authentifizierung fehl, wird der
     * komplette Zustand zurückgesetzt. Sonst würde EIN manipulierter Umschlag
     * die Kette vorspulen und alle echten Nachrichten dahinter unlesbar machen.
     */
    fun decrypt(env: Envelope): ByteArray {
        val backup = Snapshot()
        return try {
            decryptInner(env)
        } catch (t: Throwable) {
            backup.restore()
            throw t
        }
    }

    private inner class Snapshot {
        private val rk = rootKey.copyOf()
        private val selfPriv = dhSelfPriv.copyOf()
        private val selfPub = dhSelfPub.copyOf()
        private val remote = dhRemotePub?.copyOf()
        private val sendCk = sendChainKey?.copyOf()
        private val recvCk = recvChainKey?.copyOf()
        private val sCount = sendCount
        private val rCount = recvCount
        private val pCount = prevSendCount
        private val skip = LinkedHashMap(skipped)

        fun restore() {
            rootKey = rk
            dhSelfPriv = selfPriv
            dhSelfPub = selfPub
            dhRemotePub = remote
            sendChainKey = sendCk
            recvChainKey = recvCk
            sendCount = sCount
            recvCount = rCount
            prevSendCount = pCount
            skipped.clear()
            skipped.putAll(skip)
        }
    }

    private fun decryptInner(env: Envelope): ByteArray {
        val header = env.header

        // 1) verpasste Nachricht dieser Chain?
        val skippedKey = skipped.remove(skippedId(header))
        if (skippedKey != null) {
            return openWith(skippedKey, env)
        }

        // 2) neue Remote-Chain → DH-Ratchet
        val remote = dhRemotePub
        if (remote == null || !remote.contentEquals(header.dh)) {
            if (remote != null) {
                // restliche Keys der alten Chain als „übersprungen" sichern
                var ck = recvChainKey
                var n = recvCount
                while (ck != null && n < header.pn) {
                    val (mk, next) = kdfChain(ck)
                    rememberKey(RatchetHeader(remote, 0, n), mk)
                    ck = next
                    n++
                }
                recvChainKey = ck
                recvCount = n
            }
            dhRatchetStep(header.dh)
        }

        // 3) bis zur Nachricht vorlaufen
        while (recvCount < header.n) {
            val ck = recvChainKey ?: throw RatchetException("Empfangs-Chain fehlt")
            val (mk, next) = kdfChain(ck)
            rememberKey(RatchetHeader(header.dh, 0, recvCount), mk)
            recvChainKey = next
            recvCount++
        }

        if (recvCount != header.n) throw RatchetException("Nachricht zu alt oder doppelt (#${header.n})")

        val ck = recvChainKey ?: throw RatchetException("Empfangs-Chain fehlt")
        val (mk, next) = kdfChain(ck)
        recvChainKey = next
        recvCount++
        return openWith(mk, env)
    }

    private fun openWith(mk: ByteArray, env: Envelope): ByteArray {
        val (key, iv) = deriveMessageKey(mk)
        val aad = env.header.encode() + associatedData
        return try {
            Crypto.aesGcmDecrypt(key, env.iv, env.ciphertext, aad)
        } catch (t: Throwable) {
            throw RatchetException("Entschlüsselung fehlgeschlagen (falscher Schlüssel oder manipuliert)")
        }
    }

    /** Ein voller DH-Ratchet-Schritt: empfangen + neu senden. */
    private fun dhRatchetStep(remotePub: ByteArray) {
        prevSendCount = sendCount
        sendCount = 0
        recvCount = 0
        dhRemotePub = remotePub.copyOf()

        val dh1 = Curve25519.sharedSecret(dhSelfPriv, remotePub)
        val (rk1, ckR) = kdfRoot(rootKey, dh1)
        rootKey = rk1
        recvChainKey = ckR

        val (newPriv, newPub) = Curve25519.pair()
        val dh2 = Curve25519.sharedSecret(newPriv, remotePub)
        val (rk2, ckS) = kdfRoot(rootKey, dh2)
        rootKey = rk2
        sendChainKey = ckS
        dhSelfPriv = newPriv
        dhSelfPub = newPub
    }

    private fun skippedId(h: RatchetHeader): String = Crypto.b64(h.dh) + ":" + h.n

    private fun rememberKey(h: RatchetHeader, mk: ByteArray) {
        skipped[skippedId(h)] = mk
        while (skipped.size > 2000) {
            val first = skipped.keys.firstOrNull() ?: break
            skipped.remove(first)
        }
    }

    /* ---------------- Persistenz (kompakt, ohne org.json) ---------------- */

    fun serialize(): String {
        val skip = skipped.entries.joinToString(",") { it.key + "=" + Crypto.b64(it.value) }
        return listOf(
            Crypto.b64(rootKey),
            Crypto.b64(dhSelfPriv),
            Crypto.b64(dhSelfPub),
            dhRemotePub?.let { Crypto.b64(it) } ?: "",
            sendChainKey?.let { Crypto.b64(it) } ?: "",
            recvChainKey?.let { Crypto.b64(it) } ?: "",
            sendCount.toString(),
            recvCount.toString(),
            prevSendCount.toString(),
            skip,
            Crypto.b64(associatedData),
        ).joinToString("|")
    }

}

/* =====================================================================
   🤝 X3DH — Session-Aufbau
   ===================================================================== */

object X3DH {
    data class PeerBundle(
        val identityKey: ByteArray,
        val signedPrekey: ByteArray,
        val prekeySignature: ByteArray,
        val signingKey: ByteArray,
        val signedPrekeyId: String,
        val oneTimePrekey: ByteArray?,
        val oneTimePrekeyId: String,
    )

    private val INFO = "MaxiChat-X3DH-v1".toByteArray()

    fun sharedSecret(
        ikPriv: ByteArray, ekPriv: ByteArray,
        peer: PeerBundle,
    ): ByteArray {
        val dh1 = Curve25519.sharedSecret(ikPriv, peer.signedPrekey)
        val dh2 = Curve25519.sharedSecret(ekPriv, peer.identityKey)
        val dh3 = Curve25519.sharedSecret(ekPriv, peer.signedPrekey)
        val material = ByteArrayOutputStream().apply {
            write(dh1); write(dh2); write(dh3)
            peer.oneTimePrekey?.let { write(Curve25519.sharedSecret(ekPriv, it)) }
        }.toByteArray()
        return Crypto.hkdf(material, salt = ByteArray(32), info = INFO, length = 32)
    }

    /** Signatur des Signed Prekeys prüfen — sonst könnte der Server einen falschen SPK einschieben. */
    fun verifyPrekey(peer: PeerBundle): Boolean =
        Crypto.verify(peer.signingKey, peer.signedPrekey, peer.prekeySignature)

    /**
     * Alice: startet die Session.
     * @return Session + Daten für die erste Nachricht (PreKey-Init)
     */
    fun initiate(
        myIdentityPriv: ByteArray,
        myIdentityPub: ByteArray,
        mySigningPub: ByteArray,
        peer: PeerBundle,
        associatedData: ByteArray = ByteArray(0),
    ): Pair<DoubleRatchet, PreKeyInit> {
        require(verifyPrekey(peer)) { "Signatur des Signed Prekeys ist ungültig" }
        val (ekPriv, ekPub) = Curve25519.pair()
        val sk = sharedSecret(myIdentityPriv, ekPriv, peer)
        val session = DoubleRatchet.initSender(sk, ekPriv, ekPub, peer.signedPrekey, associatedData)
        val init = PreKeyInit(
            identityKey = myIdentityPub,
            ephemeralKey = ekPub,
            signingKey = mySigningPub,
            signedPrekeyId = peer.signedPrekeyId,
            oneTimePrekeyId = peer.oneTimePrekeyId,
        )
        return session to init
    }

    /** Bob: antwortet auf die erste Nachricht. */
    fun respond(
        myIdentityPriv: ByteArray,
        mySignedPrekeyPriv: ByteArray,
        mySignedPrekeyPub: ByteArray,
        myOneTimePrekeyPriv: ByteArray?,
        init: PreKeyInit,
        associatedData: ByteArray = ByteArray(0),
    ): DoubleRatchet {
        val peer = PeerBundle(
            identityKey = init.identityKey,
            signedPrekey = mySignedPrekeyPub,
            prekeySignature = ByteArray(0),
            signingKey = ByteArray(0),
            signedPrekeyId = init.signedPrekeyId,
            oneTimePrekey = null,
            oneTimePrekeyId = "",
        )
        // WICHTIG: gleiche Reihenfolge wie bei Alice (sharedSecret):
        // DH1 = IK_A·SPK_B, DH2 = EK_A·IK_B, DH3 = EK_A·SPK_B, DH4 = EK_A·OPK_B
        val dh1 = Curve25519.sharedSecret(mySignedPrekeyPriv, init.identityKey)   // SPK_B·IK_A
        val dh2 = Curve25519.sharedSecret(myIdentityPriv, init.ephemeralKey)      // IK_B·EK_A
        val dh3 = Curve25519.sharedSecret(mySignedPrekeyPriv, init.ephemeralKey)  // SPK_B·EK_A
        val material = ByteArrayOutputStream().apply {
            write(dh1); write(dh2); write(dh3)
            myOneTimePrekeyPriv?.let { write(Curve25519.sharedSecret(it, init.ephemeralKey)) }
        }.toByteArray()
        val sk = Crypto.hkdf(material, salt = ByteArray(32), info = INFO, length = 32)
        return DoubleRatchet.initReceiver(sk, mySignedPrekeyPriv, mySignedPrekeyPub, associatedData)
    }
}
