/* =====================================================================
   🛡️ V4.12 — SICHERHEITS-HEADER für die Web-Version
   ---------------------------------------------------------------------
   Die Web-App war sicher im Sinne von "der Server prüft Rechte" — aber
   nicht im Sinne von "der Browser hat Regeln". Das ändert diese Datei.

   Was gesetzt wird und WARUM (jede Zeile hat einen Grund):

   Content-Security-Policy
     · default-src 'self'      → nichts von fremden Domains nachladen
     · script-src 'self'       → kein <script src="evil.cdn"> und kein
                                 Inline-Script, das per XSS eingeschleust wird
     · object-src 'none'       → keine Flash/Java-Plugins (historische Lücke)
     · base-uri 'self'         → verhindert <base href> Hijacking
     · frame-ancestors 'none'  → niemand kann die Seite einbetten (Clickjacking)
     · form-action 'self'      → Formulare können nicht nach draußen posten
     · upgrade-insecure-requests → http wird zu https

   Strict-Transport-Security
     · 180 Tage, mit includeSubDomains → der Browser merkt sich https

   X-Frame-Options: DENY         (Alt-Fallback für frame-ancestors)

   ⚠️ AUSNAHME für die Entwicklung: Läuft der Server auf einem
   Preview-Host (*.e2b.app), wird frame-ancestors auf diese eine Domain
   geöffnet — sonst könnte man die eigene Seite im Vorschau-Fenster nicht
   ansehen. Auf maxichen.de greift die Regel unverändert (DENY).
   Die Ausnahme ist an den Host gebunden, nicht an einen Schalter, den
   jemand versehentlich produktiv stehen lässt.
   X-Content-Type-Options: nosniff → kein MIME-Sniffing
   Referrer-Policy: no-referrer-when-downgrade
   Permissions-Policy: Kamera/Mikro/Geo nur für uns selbst
   Cross-Origin-Opener-Policy: same-origin → keine fremden Fenster-Referenzen

   ⚠️ EHRLICH: 'unsafe-inline' für Styles ist noch drin, weil die
   bestehende index.html Inline-Styles benutzt. Für Scripts ist es NICHT
   drin — das ist der Teil, der wirklich zählt. Ein Umbau aller Styles in
   eine Datei wäre möglich, aber er würde die Seite riskieren, ohne
   Sicherheitsgewinn bei Skripten.
   ===================================================================== */

const CSP = [
  "default-src 'self'",
  // Scripts NUR von uns — kein Inline-JS, kein CDN
  "script-src 'self'",
  // Styles dürfen inline sein (bestehende Seite), Bilder auch per data:
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // WebSocket für Chat + WebRTC für Anrufe
  "connect-src 'self' ws: wss:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

/// Nur für Vorschau-Hosts: dort darf die Seite in einem iframe laufen.
function isPreviewHost(req) {
  const h = String(req.headers.host || '').toLowerCase();
  return h.endsWith('.e2b.app');   // nur die Vorschau-Domain, nichts anderes
}

function securityHeaders() {
  return (req, res, next) => {
    if (isPreviewHost(req)) {
      // Gleiche Regeln, nur Einbetten erlaubt (Clickjacking-Schutz bleibt für echte Hosts)
      res.setHeader('Content-Security-Policy', CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self' https://*.e2b.app http://localhost:*"));
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    } else {
      res.setHeader('Content-Security-Policy', CSP);
      res.setHeader('X-Frame-Options', 'DENY');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), payment=()');
    // HSTS nur, wenn wirklich über https geliefert wird — sonst sperrt man
    // sich bei lokalen Tests aus. Erkennung über x-forwarded-proto.
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || '').split(',')[0].trim();
    if (proto === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    // API-Antworten nie cachen (Tokens, Nachrichten)
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
    }
    next();
  };
}

module.exports = { securityHeaders, CSP };
