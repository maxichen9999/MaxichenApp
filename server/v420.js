/* =====================================================================
 *  📥 v420.js — V4.20 „Verteilen": echte Download-Auslieferung
 * ---------------------------------------------------------------------
 *  Vorgeschichte (gemessen, nicht geraten):
 *  · /Downloads (groß) funktioniert SCHON — Express ist per Default
 *    case-insensitiv. Geprüft: /downloads /Downloads /DOWNLOADS → alle 200.
 *  · /api/downloads/latest existierte NICHT → 404.
 *  · client/downloads.html zeigt Version 4.15 mit von Hand eingetragenen
 *    Hashes. Die stimmten zwar, aber niemand hindert sie daran zu lügen.
 *
 *  Diese Datei macht daraus echte Daten:
 *  · Hashes und Größen werden aus den DATEIEN berechnet (mit mtime-Cache),
 *    nicht eingetippt. Ändert sich eine Datei, ändert sich die Antwort.
 *  · Range-Requests (Resume bei 28 MB APK über Mobilfunk).
 *  · Rate-Limit auf der Metadaten-Route.
 *  · Ehrliche Flags: `available:false` + Grund, statt totem Button.
 *
 *  Was ich NICHT gebaut habe: „Downloads nur für eingeloggte Nutzer".
 *  Das klingt sicher, ist aber Unsinn: wer die App noch nicht hat, kann
 *  sich nicht einloggen — und die App ist der einzige Weg, es zu tun.
 *  Der Schutz liegt in den Prüfsummen (siehe unten), nicht im Login.
 * ===================================================================== */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* Dateiname → Plattform-Beschreibung. `available` wird zur Laufzeit aus
 * dem Dateisystem bestimmt, nicht hier behauptet. */
const TARGETS = [
  {
    id: 'android',
    title: 'Android',
    ico: '🤖',
    file: 'maxichen-v4.15.apk',
    match: /\.apk$/i,
    min: 'Android 8+',
    note: 'Echt gebaut, 186 Kotlin-Tests, installierbar.',
  },
  {
    id: 'windows',
    title: 'Windows',
    ico: '🪟',
    file: 'maxichat-windows-4.15.exe',
    match: /\.exe$/i,
    min: 'Windows 10/11',
    note: 'Fenster um die Web-App (WebView2). Nicht signiert.',
  },
  {
    id: 'ios',
    title: 'iOS',
    ico: '🍎',
    file: 'maxichen-ios-4.15.zip',
    match: /\.(ipa|zip)$/i,
    min: 'iOS 15+',
    note: 'Swift-Paket — KEINE installierbare App. Ohne Mac kein IPA.',
    availableOverride: false,
    reason: 'Ohne Mac kein Build, ohne Apple-Signatur kein Start. Das ZIP ist der Krypto-Kern, keine App.',
  },
  {
    id: 'sources',
    title: 'Quellcode',
    ico: '📦',
    file: 'sources-v4.15.zip',
    match: /sources.*\.zip$/i,
    min: '—',
    note: 'Alles was zum Selbstbauen nötig ist.',
  },
];

function createV420(app, h, ctx) {
  const { CLIENT_DIR, rateLimit } = ctx;
  const DL_DIR = path.join(CLIENT_DIR, 'app');

  /* ---------- Hash-Cache: nur neu rechnen, wenn mtime sich ändert ------ */
  const cache = new Map();   // filename -> { size, sha256, md5, mtime, computedAt }

  function infoOf(fileName) {
    const full = path.join(DL_DIR, fileName);
    let st;
    try { st = fs.statSync(full); } catch (e) { return null; }
    const key = fileName;
    const hit = cache.get(key);
    if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) return hit;
    const sha = crypto.createHash('sha256');
    const md5 = crypto.createHash('md5');
    // Streaming, damit eine 28-MB-APK nicht im RAM landet (die Box hat 1 GB)
    const fd = fs.openSync(full, 'r');
    const buf = Buffer.allocUnsafe(1024 * 256);
    let read = 0;
    try {
      while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
        sha.update(buf.subarray(0, read));
        md5.update(buf.subarray(0, read));
      }
    } finally { fs.closeSync(fd); }
    const rec = {
      size: st.size,
      sha256: sha.digest('hex'),
      md5: md5.digest('hex'),
      mtime: st.mtimeMs,
      computedAt: Date.now(),
    };
    cache.set(key, rec);
    return rec;
  }

  /* ---------- Versionsnummer aus dem Dateinamen (nicht behauptet) ------ */
  function versionOf(fileName) {
    const m = String(fileName).match(/v?(\d+\.\d+(?:\.\d+)?)/);
    return m ? m[1] : null;
  }

  function buildPayload() {
    const items = TARGETS.map((t) => {
      const info = infoOf(t.file);
      const available = t.availableOverride === false ? false : !!info;
      return {
        id: t.id,
        title: t.title,
        ico: t.ico,
        file: t.file,
        url: available ? '/app/' + encodeURIComponent(t.file) : null,
        // Wenn wir etwas NICHT ausliefern, liefern wir auch keine Prüfsumme
        // dafür. Eine Zahl zu einem Download, den es nicht gibt, ist eine
        // Einladung zum Verwirren.
        size: available && info ? info.size : null,
        sizeHuman: available && info ? human(info.size) : null,
        sha256: available && info ? info.sha256 : null,
        md5: available && info ? info.md5 : null,
        version: versionOf(t.file),
        min: t.min,
        note: t.note,
        available,
        reason: available ? null : (t.reason || 'Datei liegt nicht auf diesem Server.'),
      };
    });
    // Höchste Version als „latest"
    const vers = items.map((i) => i.version).filter(Boolean).sort(compareVer);
    return {
      app: 'LoveChat',
      version: vers.length ? vers[vers.length - 1] : null,
      generatedAt: Date.now(),
      items,
      // Ehrliche Gesamtzahl: nur herunterladbare Pakete zählen
      downloadable: items.filter((i) => i.available).length,
      note: 'Größen und Prüfsummen werden bei jeder Änderung neu aus der Datei berechnet.',
    };
  }

  function compareVer(a, b) {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  function human(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  /* ================= ROUTEN ================= */

  app.get('/api/downloads/latest', (req, res) => {
    if (rateLimit && !rateLimit('dl:' + (req.ip || 'x'), 120, 60 * 1000)) {
      return res.status(429).json({ error: 'Zu viele Anfragen — kurz warten 💗' });
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.json(buildPayload());
  });

  /* Einzelprüfung: /api/downloads/verify?file=xy.apk&sha256=…
   * Damit kann die Seite (oder ein Skript) eine heruntergeladene Datei
   * gegen den Server prüfen — ohne die Datei erneut zu übertragen. */
  app.get('/api/downloads/verify', (req, res) => {
    const file = String(req.query.file || '');
    const want = String(req.query.sha256 || '').toLowerCase();
    const t = TARGETS.find((x) => x.file === file);
    if (!t) return res.status(404).json({ error: 'Unbekannte Datei' });
    const info = infoOf(t.file);
    if (!info) return res.status(404).json({ error: 'Datei liegt nicht auf dem Server' });
    // Ohne `sha256`-Parameter wird nichts geprüft — dann sagen wir auch
    // nicht `ok:true`, sondern `verified:false`. (Ein `ok:true` ohne
    // Prüfung ist genau die Art Behauptung, die hier nicht stehen soll.)
    if (!want) {
      return res.json({
        file, sha256: info.sha256, size: info.size,
        verified: false, match: null,
        message: 'Hash geliefert — zum Prüfen ?sha256=<hash> anhängen',
      });
    }
    const match = want === info.sha256;
    res.status(match ? 200 : 409).json({
      file, match, verified: true, expected: info.sha256, got: want, size: info.size,
      message: match ? 'Prüfsumme stimmt ✅' : 'Prüfsumme weicht ab — Datei neu laden 🔴',
    });
  });

  /* Download-Auslieferung mit Range-Support + sauberen Headern.
   * express.static kann das auch — aber hier kontrolliere ich die Header,
   * weil .apk/.exe/.ipa sonst je nach nginx-Mime-Datenbank als text/*
   * rausgehen und der Browser sie anzeigt statt zu speichern. */
  app.get('/app/:file', (req, res) => {
    const file = String(req.params.file || '');
    const t = TARGETS.find((x) => x.file === file);
    if (!t) return res.status(404).send('Unbekannte Datei');
    if (t.availableOverride === false) {
      return res.status(410).json({ error: 'Diese Datei gibt es absichtlich nicht', reason: t.reason });
    }
    const full = path.join(DL_DIR, file);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'Datei fehlt auf dem Server' });
    const st = fs.statSync(full);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', st.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    // Stopft den Download-Ordner nicht mit Range-Müll voll:
    res.sendFile(full, { headers: { 'Content-Type': 'application/octet-stream' } }, (err) => {
      if (err && !res.headersSent) res.status(500).end();
    });
  });

  console.log('📥 V4.20 aktiv — /api/downloads/latest mit echten Hashes');
  return { buildPayload, infoOf, TARGETS, DL_DIR };
}

module.exports = { createV420, TARGETS };
