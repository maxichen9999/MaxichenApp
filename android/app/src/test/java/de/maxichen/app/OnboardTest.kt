package de.maxichen.app

/* =====================================================================
   📱 V4.13 — TEST: Anmelde-Logik
   ---------------------------------------------------------------------
   Die Nummer ist der einzige Schlüssel zum Konto. Wenn hier ein Zeichen
   verloren geht, landet der Code bei einem Fremden oder niemand kommt
   mehr rein. Deshalb wird jede Schreibweise einzeln geprüft — und
   zusätzlich gegen die Werte, die der Server (Node) errechnet.
   ===================================================================== */

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OnboardTest {

    /* ================= Nummer ================= */

    @Test
    fun deutscheSchreibweisen_landenAufDerselbenNummer() {
        val soll = "+4915155894714"
        assertEquals(soll, Onboard.normalizePhone("+49 151 55894714"))
        assertEquals(soll, Onboard.normalizePhone("004915155894714"))
        assertEquals(soll, Onboard.normalizePhone("4915155894714"))
        assertEquals(soll, Onboard.normalizePhone("+49 (151) 558-947-14"))
        assertEquals(soll, Onboard.normalizePhone("  +49/151/55894714  "))
        assertEquals(soll, Onboard.normalizePhone("0151 55894714".let { "+49" + it.substring(1) }))
    }

    @Test
    fun fuellzeichenWerdenEntfernt() {
        assertEquals("+4915155894714", Onboard.normalizePhone("+49-151-55894714"))
        assertEquals("+4915155894714", Onboard.normalizePhone("+49.151.55894714"))
        assertEquals("+4915155894714", Onboard.normalizePhone("+49\t151 55894714"))
    }

    @Test
    fun unsinn_istKeineNummer() {
        assertEquals("", Onboard.normalizePhone(""))
        assertEquals("", Onboard.normalizePhone(null))
        assertEquals("", Onboard.normalizePhone("hallo"))
        assertEquals("", Onboard.normalizePhone("12"))          // zu kurz
        assertEquals("", Onboard.normalizePhone("+1" + "1".repeat(16)))  // zu lang
        assertEquals("", Onboard.normalizePhone("+++"))
    }

    @Test
    fun grenzlaengen() {
        assertEquals("+1234567", Onboard.normalizePhone("1234567"))              // 7 = Minimum
        assertEquals("", Onboard.normalizePhone("123456"))                       // 6 = zu kurz
        assertEquals("+123456789012345", Onboard.normalizePhone("123456789012345")) // 15 = Maximum
        assertEquals("", Onboard.normalizePhone("1234567890123456"))             // 16 = zu lang
    }

    /** Gegenprobe: dieselben Werte, die tests/v413test.js auf dem Server prüft. */
    @Test
    fun stimmtMitDemServerUeberein() {
        // Node: normalizePhone('+49 151 55894714') === '+4915155894714'
        assertEquals("+4915155894714", Onboard.normalizePhone("+49 151 55894714"))
        // Node: normalizePhone('004915155894714') === '+4915155894714'
        assertEquals("+4915155894714", Onboard.normalizePhone("004915155894714"))
        // Node: normalizePhone('hallo') === ''
        assertEquals("", Onboard.normalizePhone("hallo"))
    }

    /* ================= Anzeige ================= */

    @Test
    fun schoeneAnzeige() {
        assertEquals("+49 151 558 947 14", Onboard.prettyPhone("+4915155894714"))
        assertEquals("", Onboard.prettyPhone(""))
        assertEquals("+1 234 567", Onboard.prettyPhone("+1234567"))
    }

    /* ================= Codes ================= */

    @Test
    fun codesNurZiffernUndLaenge() {
        assertEquals("123456", Onboard.sanitizeCode("123 456"))
        assertEquals("123456", Onboard.sanitizeCode("12a34b56"))
        assertEquals("123456", Onboard.sanitizeCode("1234567890"))   // abgeschnitten
        assertEquals("", Onboard.sanitizeCode("abcdef"))
        assertEquals("", Onboard.sanitizeCode(null))
    }

    @Test
    fun codeVollstaendig() {
        assertTrue(Onboard.isCompleteCode("123456"))
        assertFalse(Onboard.isCompleteCode("12345"))
        // zu viele Ziffern: die ersten sechs zählen (so verhält sich auch das Eingabefeld)
        assertTrue(Onboard.isCompleteCode("1234567"))
        assertEquals("123456", Onboard.sanitizeCode("1234567"))
        assertFalse(Onboard.isCompleteCode(""))
        assertTrue(Onboard.isCompleteCode("1234", 4))
    }

    @Test
    fun codeHinweise() {
        assertNull(Onboard.codeProblem(""))
        assertEquals("Nur Ziffern", Onboard.codeProblem("12a"))
        assertEquals("Noch 3 Ziffern", Onboard.codeProblem("123"))
        assertNull(Onboard.codeProblem("123456"))
    }

    /* ================= Kontoname ================= */

    @Test
    fun kontoname_wirdGesaeubert() {
        assertEquals("maxi_m", Onboard.sanitizeUsername("Maxi_M"))
        assertEquals("maxim", Onboard.sanitizeUsername("Maxi M!"))
        assertEquals("", Onboard.sanitizeUsername("äöü"))          // Umlaute raus
        assertEquals("a".repeat(20), Onboard.sanitizeUsername("a".repeat(40)))
        assertEquals("maxi910", Onboard.sanitizeUsername("Maxi910"))
    }

    @Test
    fun kontoname_regeln() {
        assertEquals("Mindestens 3 Zeichen", Onboard.usernameProblem("ab"))
        assertNull(Onboard.usernameProblem("abc"))
        assertNull(Onboard.usernameProblem("a".repeat(20)))
        assertEquals("Höchstens 20 Zeichen", Onboard.usernameProblem("a".repeat(21)))
        assertEquals("Nur a–z, 0–9 und _", Onboard.usernameProblem("a b"))
        assertEquals("Nur a–z, 0–9 und _", Onboard.usernameProblem("ÄBC"))
    }

    @Test
    fun anzeigename_regeln() {
        assertEquals("Mindestens 2 Zeichen", Onboard.displayNameProblem(""))
        assertEquals("Mindestens 2 Zeichen", Onboard.displayNameProblem("A"))
        assertNull(Onboard.displayNameProblem("Maxi"))
        assertNull(Onboard.displayNameProblem("Maxichen 💗"))
        assertEquals("Höchstens 30 Zeichen", Onboard.displayNameProblem("x".repeat(31)))
    }

    /* ================= E-Mail ================= */

    @Test
    fun email_pruefung() {
        assertTrue(Onboard.isEmail("maxi@example.com"))
        assertTrue(Onboard.isEmail("a.b+c@sub.example.de"))
        assertFalse(Onboard.isEmail("maxi@example"))
        assertFalse(Onboard.isEmail("@example.com"))
        assertFalse(Onboard.isEmail("maxi example.com"))
        assertFalse(Onboard.isEmail(""))
        assertFalse(Onboard.isEmail(null))
    }

    /* ================= Ablauf ================= */

    @Test
    fun derNaechsteSchritt() {
        assertEquals("phone", Onboard.nextStep(false, false, false))
        assertEquals("profile", Onboard.nextStep(true, false, false))
        assertEquals("email", Onboard.nextStep(true, true, false))
        assertEquals("done", Onboard.nextStep(true, true, true))
        // Nummer bestätigt aber Profil fehlt: Profil gewinnt, egal was danach kommt
        assertEquals("profile", Onboard.nextStep(true, false, true))
    }

    @Test
    fun neuSendenNichtZuSchnell() {
        assertFalse("nach 5 s kein neuer Code", Onboard.resendAllowed(5, 1))
        assertFalse("nach 29 s auch nicht", Onboard.resendAllowed(29, 1))
        assertTrue("nach 30 s ja", Onboard.resendAllowed(30, 1))
        assertFalse("aber nicht ein vierter", Onboard.resendAllowed(999, 3))
        assertTrue(Onboard.resendAllowed(999, 2))
    }

    @Test
    fun absenderUndBetreff_wieVorgegeben() {
        assertEquals("contact@maxichen.de", Onboard.MAIL_FROM)
        assertEquals("maxichen verifizierungscode", Onboard.MAIL_SUBJECT)
        assertEquals("Verifi", Onboard.WHATSAPP_SESSION)
    }
}
