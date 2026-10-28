package de.maxichen.app.crypto

/* =====================================================================
   🔐 Krypto-Bausteine — HKDF-SHA256 · HMAC · AES-256-GCM · ECDSA P-256
   Nur JCA (javax.crypto / java.security) → läuft auf Android 8–16 und
   in JVM-Unit-Tests identisch.
   ===================================================================== */

import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.PublicKey
import java.security.SecureRandom
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

object Crypto {
    private val rnd = SecureRandom()

    fun randomBytes(n: Int): ByteArray = ByteArray(n).also { rnd.nextBytes(it) }

    fun hmac(key: ByteArray, data: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(data)
    }

    /**
     * HKDF nach RFC 5869 (Extract + Expand), SHA-256.
     */
    fun hkdf(ikm: ByteArray, salt: ByteArray = ByteArray(32), info: ByteArray = ByteArray(0), length: Int = 32): ByteArray {
        val prk = hmac(if (salt.isEmpty()) ByteArray(32) else salt, ikm)
        val out = ByteArray(length)
        var t = ByteArray(0)
        var pos = 0
        var counter = 1
        while (pos < length) {
            t = hmac(prk, t + info + byteArrayOf(counter.toByte()))
            val take = minOf(t.size, length - pos)
            System.arraycopy(t, 0, out, pos, take)
            pos += take
            counter++
        }
        return out
    }

    /* ---------------- AES-256-GCM ---------------- */

    fun aesGcmEncrypt(key: ByteArray, iv: ByteArray, plaintext: ByteArray, aad: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        c.updateAAD(aad)
        return c.doFinal(plaintext)
    }

    fun aesGcmDecrypt(key: ByteArray, iv: ByteArray, ciphertext: ByteArray, aad: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        c.updateAAD(aad)
        return c.doFinal(ciphertext)
    }

    /* ---------------- ECDSA P-256 (für signierte Prekeys) ---------------- */

    fun newSigningKeyPair(): KeyPair {
        val g = KeyPairGenerator.getInstance("EC")
        g.initialize(ECGenParameterSpec("secp256r1"), rnd)
        return g.generateKeyPair()
    }

    fun sign(priv: PrivateKey, data: ByteArray): ByteArray {
        val s = Signature.getInstance("SHA256withECDSA")
        s.initSign(priv)
        s.update(data)
        return s.sign()
    }

    fun verify(pubEncoded: ByteArray, data: ByteArray, signature: ByteArray): Boolean {
        return try {
            val kf = KeyFactory.getInstance("EC")
            val pub: PublicKey = kf.generatePublic(X509EncodedKeySpec(pubEncoded))
            val s = Signature.getInstance("SHA256withECDSA")
            s.initVerify(pub)
            s.update(data)
            s.verify(signature)
        } catch (t: Throwable) {
            false
        }
    }

    fun privateToBytes(k: PrivateKey): ByteArray = k.encoded
    fun publicToBytes(k: PublicKey): ByteArray = k.encoded

    fun privateFromBytes(b: ByteArray): PrivateKey =
        KeyFactory.getInstance("EC").generatePrivate(PKCS8EncodedKeySpec(b))

    /* ---------------- Base64 ---------------- */

    fun b64(b: ByteArray): String = Base64.getEncoder().encodeToString(b)
    fun unb64(s: String): ByteArray = Base64.getDecoder().decode(s)

    fun constantTimeEquals(a: ByteArray, b: ByteArray): Boolean = MessageDigest.isEqual(a, b)
}
