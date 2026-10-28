#!/usr/bin/env python3
"""
serve-deploy.py — bildet die nginx-Regeln aus DEPLOY.md auf dem eigenen Rechner nach.

Warum es das gibt:
    `deploy/chat/index.html` lädt seine Skripte **absolut** (`/app.js`,
    `/v427.js`, `/fonts/…`).  nginx erledigt das mit
        location /chat/  { alias …/chat/; }
    und den absoluten Pfaden über `location /`.
    Ein nackter `python3 -m http.server` im Ordner `deploy/` liefert dafür
    überall 404 — dann sieht die Seite kaputt aus, obwohl sie es nicht ist.

Regeln (wie in `deploy/nginx-maxichen.de.conf`):
    /downloads/*      → deploy/downloads/*
    /chat/*           → deploy/chat/*
    alles andere      → erst deploy/chat/<pfad>, dann deploy/downloads/<pfad>
    /                 → deploy/downloads/index.html

Start:  python3 tools/serve-deploy.py 8099
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DEPLOY = os.path.join(os.path.dirname(HERE), 'deploy')
CHAT = os.path.join(DEPLOY, 'chat')
DOWN = os.path.join(DEPLOY, 'downloads')


def resolve(path):
    """Welche Datei gehört zu welchem URL-Pfad?"""
    path = path.split('?', 1)[0]
    if path in ('', '/'):
        return os.path.join(DOWN, 'index.html')
    if path.startswith('/downloads/'):
        return os.path.join(DOWN, path[len('/downloads/'):])
    if path.startswith('/chat/'):
        return os.path.join(CHAT, path[len('/chat/'):])
    # absolute Verweise der Chat-Seite (nginx `location /` → chat-Ordner)
    for base in (CHAT, DOWN):
        cand = os.path.join(base, path.lstrip('/'))
        if os.path.isfile(cand):
            return cand
    return os.path.join(CHAT, path.lstrip('/'))


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        return resolve(path)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    srv = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print('🌐 Deploy-Testserver auf http://0.0.0.0:%d  (Wurzel: %s)' % (port, DEPLOY))
    srv.serve_forever()
