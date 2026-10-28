package de.maxichen.app.crypto

/* =====================================================================
   🌌 V4.9 — PQXDH: X3DH + ML-KEM  (Post-Quantum-Handshake)
   ---------------------------------------------------------------------
   Warum: ein Angreifer, der heute Traffic mitschneidet, kann ihn später
   mit einem Quantenrechner öffnen („harvest now, decrypt later").
   PQXDH hängt den Sitzungsschlüssel zusätzlich an ein Gitterproblem
   (ML-KEM-768 / FIPS 203), für das kein Quantenangriff bekannt ist.

   Aufbau (Signal-PQXDH, auf MaxiChat gemünzt):

       SK = HKDF-SHA256(
              F ‖ DH1 ‖ DH2 ‖ DH3 ‖ [DH4] ‖ SS ,
              info = "MaxiChat-PQXDH-v1" )

     F   = 32 × 0xFF        (Domain-Trennung für Curve25519)
     DH1 = IK_A · SPK_B     DH2 = EK_A · IK_B     DH3 = EK_A · SPK_B
     DH4 = EK_A · OPK_B     (nur wenn ein Einmal-Prekey existiert)
     SS  = ML-KEM-Kapselung gegen PQPK_B (1088-Byte-Ciphertext reist mit)

   Wichtig: beide Signaturen werden geprüft, BEVOR etwas rausgeht —
   klassisch (ECDSA-P-256 über SPK) und post-quantisch (ECDSA über PQPK).
   Sonst könnte der Server einen eigenen PQ-Schlüssel unterschieden.
   ===================================================================== */

object Pqxdh {
    private val INFO = "MaxiChat-PQXDH-v1".toByteArray()
    private val F_PREFIX = ByteArray(32) { 0xFF.toByte() }

    data class PeerBundle(
        val identityKey: ByteArray,          // IK_B (X25519)
        val signedPrekey: ByteArray,         // SPK_B (X25519, signiert)
        val prekeySignature: ByteArray,      // ECDSA über SPK_B
        val signingKey: ByteArray,           // ECDSA-Pubkey des Partners
        val signedPrekeyId: String,
        val oneTimePrekey: ByteArray?,       // OPK_B (optional)
        val oneTimePrekeyId: String,
        val pqPrekey: ByteArray?,            // PQPK_B (ML-KEM-768, 1184 B)
        val pqSignature: ByteArray?,         // ECDSA über PQPK_B
    ) {
        val supportsPq: Boolean get() = pqPrekey != null && pqPrekey.size == MlKem768.EK_BYTES
    }

    /** Prüft BEIDE Signaturen. Ohne gültige Signatur kein Handshake. */
    fun verifyPrekeys(peer: PeerBundle): Boolean {
        if (peer.signingKey.isEmpty()) return false
        if (!Crypto.verify(peer.signingKey, peer.signedPrekey, peer.prekeySignature)) return false
        // PQ-Teil ist optional (ältere Gegenstelle), aber wenn vorhanden: streng prüfen
        if (peer.pqPrekey != null) {
            val sig = peer.pqSignature ?: return false
            if (!Crypto.verify(peer.signingKey, peer.pqPrekey, sig)) return false
        }
        return true
    }

    private fun kdf(material: ByteArray): ByteArray =
        Crypto.hkdf(F_PREFIX + material, salt = ByteArray(32), info = INFO, length = 32)

    /**
     * Alice: startet die Sitzung. Verlangt einen gültigen PQ-Prekey —
     * wenn die Gegenstelle keinen hat, muss der Aufrufer bewusst auf
     * X3DH zurückfallen (dann ohne PQ-Schutz, aber sichtbar).
     */
    fun initiate(
        myIdentityPriv: ByteArray,
        myIdentityPub: ByteArray,
        mySigningPub: ByteArray,
        peer: PeerBundle,
        associatedData: ByteArray = ByteArray(0),
    ): Pair<DoubleRatchet, PreKeyInit> {
        require(verifyPrekeys(peer)) { "Signatur der Prekeys ist ungültig 🛑" }
        val pq = peer.pqPrekey ?: throw IllegalArgumentException("Gegenstelle hat keinen PQ-Prekey")

        val (ss, ct) = MlKem768.encapsRandom(pq)
        val (ekPriv, ekPub) = Curve25519.pair()

        val material = java.io.ByteArrayOutputStream().apply {
            write(Curve25519.sharedSecret(myIdentityPriv, peer.signedPrekey))   // DH1
            write(Curve25519.sharedSecret(ekPriv, peer.identityKey))            // DH2
            write(Curve25519.sharedSecret(ekPriv, peer.signedPrekey))           // DH3
            peer.oneTimePrekey?.let { write(Curve25519.sharedSecret(ekPriv, it)) } // DH4
            write(ss)
        }.toByteArray()

        val sk = kdf(material)
        val session = DoubleRatchet.initSender(sk, ekPriv, ekPub, peer.signedPrekey, associatedData)
        val init = PreKeyInit(
            identityKey = myIdentityPub,
            ephemeralKey = ekPub,
            signingKey = mySigningPub,
            signedPrekeyId = peer.signedPrekeyId,
            oneTimePrekeyId = peer.oneTimePrekeyId,
            pqCiphertext = ct,
        )
        return session to init
    }

    /** Bob: antwortet auf die erste Nachricht (entkapselt den PQ-Anteil). */
    fun respond(
        myIdentityPriv: ByteArray,
        mySignedPrekeyPriv: ByteArray,
        mySignedPrekeyPub: ByteArray,
        myOneTimePrekeyPriv: ByteArray?,
        myPqPrivate: ByteArray,
        init: PreKeyInit,
        associatedData: ByteArray = ByteArray(0),
    ): DoubleRatchet {
        val ct = init.pqCiphertext ?: throw IllegalArgumentException("PQ-Ciphertext fehlt")
        if (ct.size != MlKem768.CT_BYTES) throw IllegalArgumentException("PQ-Ciphertext hat falsche Länge")
        val ss = MlKem768.decaps(myPqPrivate, ct)

        // gleiche Reihenfolge wie Alice
        val material = java.io.ByteArrayOutputStream().apply {
            write(Curve25519.sharedSecret(mySignedPrekeyPriv, init.identityKey))   // DH1' = SPK_B·IK_A
            write(Curve25519.sharedSecret(myIdentityPriv, init.ephemeralKey))      // DH2' = IK_B·EK_A
            write(Curve25519.sharedSecret(mySignedPrekeyPriv, init.ephemeralKey))  // DH3' = SPK_B·EK_A
            myOneTimePrekeyPriv?.let { write(Curve25519.sharedSecret(it, init.ephemeralKey)) } // DH4'
            write(ss)
        }.toByteArray()

        val sk = kdf(material)
        return DoubleRatchet.initReceiver(sk, mySignedPrekeyPriv, mySignedPrekeyPub, associatedData)
    }
}
