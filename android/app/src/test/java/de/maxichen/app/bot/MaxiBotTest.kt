package de.maxichen.app.bot

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * V4.11 — MaxiBot. Geprüft wird Verhalten, nicht "läuft ohne Absturz":
 *
 *  · /summarize findet wirklich den inhaltlich wichtigsten Satz
 *  · /rewrite kürzt messbar und macht aus "ich" kein "Sie" (Ton bleibt)
 *  · /remind parst echte Zeitangaben in echte Zeitpunkte
 *  · /translate SAGT AB statt zu raten
 *  · der Bot ist pur: kein Context, kein Zustand, gleicher Input = gleicher Output
 */
class MaxiBotTest {

    private val now = 1_760_000_000_000L      // fester Zeitpunkt, damit Tests nicht altern

    /* ---------------- Grundgerüst ---------------- */

    @Test
    fun `nur Slash-Befehle werden erkannt`() {
        assertTrue(MaxiBot.isCommand("/summarize"))
        assertTrue(MaxiBot.isCommand("/remind in 2h test"))
        assertFalse(MaxiBot.isCommand("hallo bot"))
        assertFalse(MaxiBot.isCommand("/gibtsnicht"))
        assertFalse(MaxiBot.isCommand(""))
    }

    @Test
    fun `unbekannter Befehl verweist auf help`() {
        val r = MaxiBot.handle("/wetter", now)
        assertEquals(MaxiBot.Kind.UNKNOWN, r.kind)
        assertTrue(r.text.contains("/help"))
    }

    /* ---------------- /summarize ---------------- */

    @Test
    fun `summarize findet den wichtigen Satz, nicht den langen`() {
        val lines = listOf(
            "Hey, wie geht's dir heute so, ich hoffe du hattest einen schönen ruhigen Tag mit viel Sonne und Kaffee und allem was du magst, ehrlich gesagt.",
            "Das Deployment ist kaputt.",
            "Wir treffen uns morgen um acht.",
            "Das Deployment ist wieder kaputt.",
            "Wetter war schön.",
            "Deployment Deployment Deployment — es ist wirklich das Deployment.",
        )
        val r = MaxiBot.summarize(lines)
        assertEquals(MaxiBot.Kind.SUMMARY, r.kind)
        assertTrue("muss den Deployment-Satz enthalten", r.text.contains("Deployment"))
        // der inhaltsleere lange Satz darf NICHT der Star sein
        assertFalse(r.text.contains("hoffe du hattest einen schönen"))
    }

    @Test
    fun `summarize behaelt die Original-Reihenfolge`() {
        val lines = listOf(
            "Apfel Banane Apfel Banane Apfel.",
            "Füller Text ohne Bedeutung hier.",
            "Zitrone Zitrone Banane.",
            "Noch ein Satz zum Auffüllen.",
        )
        val r = MaxiBot.summarize(lines, maxSentences = 2)
        val iA = r.text.indexOf("Apfel")
        val iZ = r.text.indexOf("Zitrone")
        assertTrue("Apfel-Satz war zuerst im Original", iA in 0 until iZ)
    }

    @Test
    fun `summarize sagt ehrlich wenn nichts da ist`() {
        val r = MaxiBot.summarize(emptyList())
        assertEquals(MaxiBot.Kind.SUMMARY, r.kind)
        assertTrue(r.text.contains("nichts"))
    }

    @Test
    fun `summarize fasst kurze Chats nicht kuenstlich zusammen`() {
        val r = MaxiBot.summarize(listOf("Hi.", "Hallo."), maxSentences = 3)
        assertTrue(r.text.contains("kurz genug"))
    }

    /* ---------------- /rewrite ---------------- */

    @Test
    fun `rewrite kuerzer entfernt Fuellwoerter messbar`() {
        val original = "Ich wollte halt eigentlich nur irgendwie sagen, dass das quasi echt gut war."
        val out = MaxiBot.rewrite("kürzer $original").text
        assertTrue("muss kürzer werden: '$out'", out.length < original.length)
        assertFalse(out.contains(" halt "))
        assertFalse(out.contains(" irgendwie "))
        assertFalse(out.contains(" quasi "))
        assertTrue("Inhalt bleibt", out.contains("gut"))
    }

    @Test
    fun `rewrite schoener laesst den Ton in Ruhe`() {
        val out = MaxiBot.rewrite("schöner hey kannst du mir helfen").text
        assertTrue("Satz endet mit Punkt", out.endsWith("."))
        assertTrue("'du' bleibt 'du'", out.contains("du"))
        assertFalse("kein Siezen", out.contains("Sie"))
    }

    @Test
    fun `rewrite foermlich siezt wirklich`() {
        val out = MaxiBot.rewrite("förmlich hallo kannst du mir helfen danke").text
        assertTrue(out.contains("Guten Tag"))
        assertTrue("muss siezen: '$out'", out.contains("Sie"))
        assertTrue(out.contains("Vielen Dank"))
    }

    @Test
    fun `rewrite ohne Text erklaert sich`() {
        val r = MaxiBot.rewrite("kürzer")
        assertTrue(r.text.contains("/rewrite"))
    }

    /* ---------------- /remind ---------------- */

    @Test
    fun `remind - in 2h ergibt genau zwei Stunden`() {
        val r = MaxiBot.remind("in 2h Kaffee", now)
        assertEquals(MaxiBot.Kind.REMINDER, r.kind)
        assertEquals(now + 2 * 60 * 60_000L, r.atMillis)
        assertTrue(r.text.contains("Kaffee"))
    }

    @Test
    fun `remind - in 1h30m ergibt neunzig Minuten`() {
        assertEquals(90L, MaxiBot.parseDurationMinutes("1h30m"))
        assertEquals(120L, MaxiBot.parseDurationMinutes("2h"))
        assertEquals(30L, MaxiBot.parseDurationMinutes("30m"))
        assertEquals(45L, MaxiBot.parseDurationMinutes("45min"))
        assertEquals(120L, MaxiBot.parseDurationMinutes("2 stunden"))
        assertEquals(20L, MaxiBot.parseDurationMinutes("20"))
    }

    @Test
    fun `remind - morgen 18 Uhr liegt echt am naechsten Tag`() {
        val r = MaxiBot.parseReminder("morgen 18:30 Essen", now)
        assertNotNull(r)
        val rr = r!!
        val cal = java.util.Calendar.getInstance().apply { timeInMillis = rr.atMillis }
        assertEquals(18, cal.get(java.util.Calendar.HOUR_OF_DAY))
        assertEquals(30, cal.get(java.util.Calendar.MINUTE))
        assertTrue("muss in der Zukunft liegen", rr.atMillis > now)
        // genau ein Tag später als heute
        val today = java.util.Calendar.getInstance().apply { timeInMillis = now }
        val diffDays = (cal.get(java.util.Calendar.DAY_OF_YEAR) - today.get(java.util.Calendar.DAY_OF_YEAR))
        assertEquals(1, diffDays)
    }

    @Test
    fun `remind - Uhrzeit ohne Tag springt auf morgen wenn schon vorbei`() {
        val cal = java.util.Calendar.getInstance().apply {
            timeInMillis = now
            set(java.util.Calendar.HOUR_OF_DAY, 23); set(java.util.Calendar.MINUTE, 50)
        }
        val spät = cal.timeInMillis
        val r = MaxiBot.parseReminder("10:00 Fruestueck", spät)
        assertNotNull(r)
        assertTrue("muss nach dem Zeitpunkt liegen", r!!.atMillis > spät)
    }

    @Test
    fun `remind - unsinnige Zeit wird abgelehnt, nicht geraten`() {
        assertEquals(MaxiBot.Kind.REFUSED, MaxiBot.remind("irgendwann mal Kaffee", now).kind)
        assertEquals(MaxiBot.Kind.REFUSED, MaxiBot.remind("in 0h nichts", now).kind)
        assertNull(MaxiBot.parseReminder("25:99 kaputt", now))
        assertNull(MaxiBot.parseReminder("", now))
    }

    /* ---------------- /poll ---------------- */

    @Test
    fun `poll baut Frage und Optionen`() {
        val r = MaxiBot.poll("Pizza oder Sushi? | Pizza | Sushi | Egal")
        assertEquals(MaxiBot.Kind.POLL, r.kind)
        assertEquals(listOf("Pizza", "Sushi", "Egal"), r.options)
        assertTrue(r.text.contains("Pizza oder Sushi?"))
    }

    @Test
    fun `poll lehnt zu wenig Optionen ab`() {
        assertEquals(MaxiBot.Kind.REFUSED, MaxiBot.poll("Nur eine | ja").kind)
        assertEquals(MaxiBot.Kind.REFUSED, MaxiBot.poll("").kind)
    }

    /* ---------------- /translate - die ehrliche Absage ---------------- */

    @Test
    fun `translate sagt ehrlich ab und schlaegt Wege vor`() {
        val r = MaxiBot.handle("/translate hallo", now)
        assertEquals(MaxiBot.Kind.REFUSED, r.kind)
        assertTrue(r.text.contains("kann ich nicht"))
        assertTrue("nennt einen echten Weg", r.text.contains("OPUS-MT") || r.text.contains("Modell"))
        assertFalse("darf keine Fake-Uebersetzung liefern", r.text.contains("hello"))
    }

    /* ---------------- Purheit & Sicherheit ---------------- */

    @Test
    fun `gleicher Input gibt gleichen Output - keine versteckte Zeitabhaengigkeit`() {
        val a = MaxiBot.handle("/summarize", now, listOf("eins zwei drei.", "vier fünf sechs."))
        val b = MaxiBot.handle("/summarize", now, listOf("eins zwei drei.", "vier fünf sechs."))
        assertEquals(a, b)
    }

    @Test
    fun `Bot hat keine Android-Abhaengigkeit - er kann den Vault nicht sehen`() {
        // Die Signatur von handle() nimmt nur String/Long/List<String>.
        // Ein Test, der das prüft, ist mehr wert als ein Kommentar.
        val m = MaxiBot::class.java.methods.first { it.name == "handle" }
        val types = m.parameterTypes.map { it.simpleName }
        assertTrue(types.toString(), types.none { it.contains("Context") || it.contains("Intent") || it.contains("View") })
        assertEquals(listOf("String", "long", "List"), types)
    }

    @Test
    fun `help nennt alle Befehle`() {
        val r = MaxiBot.help()
        listOf("/summarize", "/rewrite", "/remind", "/poll", "/translate").forEach {
            assertTrue("fehlt: $it", r.text.contains(it))
        }
    }
}
