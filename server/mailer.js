/* =====================================================================
   ✉️ mailer.js — Verifizierungs-Mails über Strato (V4.13)
   ---------------------------------------------------------------------
   Verschickt die 6-stelligen E-Mail-Codes über das Strato-Postfach
   contact@maxichen.de.

   ⚠️ DAS PASSWORT STEHT NIRGENDS IM CODE ⚠️
   Es kommt ausschließlich aus der Umgebung:
       STRATO_SMTP_PASS=… node server.js
   Ist die Variable nicht gesetzt, geht keine Mail raus — der Server sagt
   das ehrlich (code: 'smtp_not_configured') statt still zu scheitern.

   Warum kein creds.json mit Klartext-Passwort?
   Weil Dateien im Projektordner landen, in Zips wandern, in Backups
   landen und über kurz oder lang in einem Chat auftauchen. Eine
   Umgebungsvariable liegt im Prozess-Speicher und in der Unit-Datei —
   nicht im Repo.

   ---------------------------------------------------------------------
   .env-Datei auf dem Server (nie ins ZIP, nie ins Git):
       STRATO_SMTP_HOST=smtp.strato.de
       STRATO_SMTP_PORT=465
       STRATO_SMTP_USER=contact@maxichen.de
       STRATO_SMTP_PASS=<dein neues Passwort>
       MAIL_FROM_NAME=MaxiChen
       MAIL_SIMULATE=0

   Test ohne echtes Postfach:
       MAIL_SIMULATE=1 node server.js
   → die Mail landet als JSON-Zeile in data/mail-outbox.jsonl
   ===================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const OUTBOX = path.join(DATA_DIR, 'mail-outbox.jsonl');

const CFG = {
  host: process.env.STRATO_SMTP_HOST || 'smtp.strato.de',
  port: Number(process.env.STRATO_SMTP_PORT || 465),
  user: process.env.STRATO_SMTP_USER || 'contact@maxichen.de',
  pass: process.env.STRATO_SMTP_PASS || '',
  fromName: process.env.MAIL_FROM_NAME || 'MaxiChen',
  simulate: process.env.MAIL_SIMULATE === '1',
};

/* Der Betreff, den du wolltest — exakt so. */
const SUBJECT = 'maxichen verifizierungscode';

function isConfigured() {
  return CFG.simulate || (!!CFG.user && !!CFG.pass);
}

/** Text-Teil der Mail. Kurz, klar, ohne Werbung. */
function bodyText(code, minutes) {
  return [
    'Dein MaxiChen Code: ' + code,
    '',
    'Teile diesen Code niemals. MaxiChen fragt dich nie danach.',
    'Gültig für ' + minutes + ' Minuten.',
    '',
    '— Team MaxiChen',
  ].join('\n');
}

/** HTML-Teil — schlicht, weil Mail-Clients CSS gern ignorieren. */
function bodyHtml(code, minutes) {
  return '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px;margin:0 auto;padding:24px;color:#2B1A2E">'
    + '<div style="font-size:20px;font-weight:800;color:#FF5FA8;margin-bottom:14px">MaxiChen 💗</div>'
    + '<p style="font-size:13px;color:#8B7A93;margin:0 0 6px">Dein Verifizierungscode:</p>'
    + '<div style="font-family:ui-monospace,Menlo,monospace;font-size:30px;font-weight:800;letter-spacing:5px;'
    + 'background:#FFF0F6;border-radius:14px;padding:14px 18px;text-align:center;color:#FF5FA8;margin:0 0 16px">' + code + '</div>'
    + '<p style="font-size:12px;color:#8B7A93;line-height:1.6;margin:0 0 14px">'
    + 'Teile diesen Code niemals. MaxiChen fragt dich nie danach.<br>Gültig für ' + minutes + ' Minuten.</p>'
    + '<p style="font-size:12px;color:#2B1A2E;margin:0">— Team MaxiChen</p>'
    + '</div>';
}

/** Mail "verschicken". Gibt {ok, simulated, id} oder wirft. */
async function sendCode(email, code, minutes = 10) {
  const to = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new Error('E-Mail-Adresse ungültig');

  const text = bodyText(code, minutes);
  const html = bodyHtml(code, minutes);

  if (CFG.simulate) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const rec = { at: Date.now(), to, subject: SUBJECT, text, simulated: true };
    fs.appendFileSync(OUTBOX, JSON.stringify(rec) + '\n', { mode: 0o600 });
    return { ok: true, simulated: true, id: 'sim_' + crypto.randomBytes(6).toString('hex') };
  }

  if (!isConfigured()) {
    const e = new Error('SMTP nicht konfiguriert (STRATO_SMTP_PASS fehlt)');
    e.code = 'smtp_not_configured';
    throw e;
  }

  let nodemailer;
  try { nodemailer = require('nodemailer'); }
  catch (e) { throw new Error('nodemailer fehlt (npm i nodemailer)'); }

  const transport = nodemailer.createTransport({
    host: CFG.host,
    port: CFG.port,
    secure: CFG.port === 465,        // 465 = SMTPS, 587 = STARTTLS
    auth: { user: CFG.user, pass: CFG.pass },
    connectionTimeout: 12000,
    greetingTimeout: 8000,
  });

  const info = await transport.sendMail({
    from: '"' + CFG.fromName + '" <' + CFG.user + '>',
    to,
    subject: SUBJECT,
    text,
    html,
  });
  return { ok: true, simulated: false, id: info.messageId || null };
}

/** Prüft die Zugangsdaten, ohne eine Mail zu senden (für /api/health). */
async function check() {
  if (CFG.simulate) return { ok: true, simulated: true, host: CFG.host, user: CFG.user };
  if (!isConfigured()) return { ok: false, reason: 'STRATO_SMTP_PASS fehlt', host: CFG.host, user: CFG.user };
  try {
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({
      host: CFG.host, port: CFG.port, secure: CFG.port === 465,
      auth: { user: CFG.user, pass: CFG.pass }, connectionTimeout: 8000,
    });
    await t.verify();
    return { ok: true, host: CFG.host, user: CFG.user };
  } catch (e) {
    return { ok: false, reason: e.message.slice(0, 120), host: CFG.host, user: CFG.user };
  }
}

module.exports = { sendCode, check, isConfigured, SUBJECT, bodyText, bodyHtml, CFG };
