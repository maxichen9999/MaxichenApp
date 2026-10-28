"""V4.31 — Video + Beweisbilder: Einrichtung, Kanal, Suche, Merken, Sperre, Einspruch, Löschen.

Ein echter Browser (Chromium), echte Konten, echter Server auf :3900.
Die Sperre wird im echten Team-Panel (👑) gesetzt, nicht per API.
"""
import os, re, json, time, pathlib, shutil

os.environ.setdefault('FONTCONFIG_FILE', '/home/user/.cache/fonts/fonts.conf')
os.environ['LD_LIBRARY_PATH'] = '/home/user/.cache/syslibs/usr/lib/x86_64-linux-gnu:' + os.environ.get('LD_LIBRARY_PATH', '')

from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3900'
OUT = pathlib.Path('/home/user/Lovechat/beweis')
VID = pathlib.Path('/tmp/vid431')
OUTBOX = '/home/user/Lovechat/server/data/wa-outbox.jsonl'
T = str(int(time.time()))[-6:]
OWNER = '+4915155894714'
BEN = '+49171' + T + '7'

shutil.rmtree(VID, ignore_errors=True)
VID.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

def reset_limits():
    import urllib.request
    req = urllib.request.Request(BASE + '/api/dev/reset-limits', method='POST',
                                 data=b'{}', headers={'Content-Type': 'application/json',
                                 'x-internal-token': 'testtoken123456789012345678'})
    try:
        urllib.request.urlopen(req)
    except Exception:
        pass


reset_limits()

log = []
def say(t):
    print('  ' + t, flush=True)
    log.append(t)


def code_for(phone):
    jid = re.sub(r'\D', '', phone) + '@s.whatsapp.net'
    for _ in range(80):
        try:
            with open(OUTBOX, encoding='utf-8') as f:
                lines = [l for l in f.read().strip().split('\n') if l.strip()]
            for line in reversed(lines):
                o = json.loads(line)
                if o.get('to') == jid:
                    m = re.search(r'\*(\d{6})\*', str(o.get('text', '')))
                    if m:
                        return m.group(1)
        except FileNotFoundError:
            pass
        time.sleep(0.2)
    raise RuntimeError('kein Code für ' + phone)


def shot(page, name):
    page.screenshot(path=str(OUT / name))
    say('📸 ' + name)


def wait(page, ms):
    page.wait_for_timeout(ms)


def onboard(page, phone, name=None, pause=900):
    """Start → Nummer → Code → (Name) → drin."""
    page.goto(BASE, wait_until='domcontentloaded')
    wait(page, 1600)                                   # Splash
    if page.get_by_role('button', name=re.compile('Zustimmen', re.I)).count() == 0:
        page.evaluate("localStorage.clear()")
        page.goto(BASE, wait_until='domcontentloaded')
        wait(page, 1600)
    page.get_by_role('button', name=re.compile('Zustimmen', re.I)).first.click()
    wait(page, pause)
    page.locator('#waNum').click()
    page.locator('#waNum').fill(phone)
    wait(page, pause)
    page.locator('#waNext').click()
    wait(page, 1500)
    code = code_for(phone)
    boxes = page.locator('#waCodes input')
    for i, ch in enumerate(code):
        boxes.nth(i).fill(ch)
        wait(page, 130)
    wait(page, 500)
    if page.locator('#waVerify').count() and page.locator('#waVerify').is_visible():
        page.locator('#waVerify').click()
    wait(page, 2600)
    if name and page.locator('#waName').count() and page.locator('#waName').is_visible():
        page.locator('#waName').click()
        page.locator('#waName').fill(name)
        wait(page, 700)
        page.locator('#waFinish').click()
        wait(page, 3000)


def hide_overlays(page):
    try:
        page.evaluate("""
          ['lcStarred','lcProfileTab','modPanel','msgMenu','lcSearchPanel'].forEach((id)=>{
            const e=document.getElementById(id); if(e) e.style.display='none'; });
        """)
    except Exception:
        pass


def logout(page):
    hide_overlays(page)
    nav = page.locator('.gnItem[data-gn="profile"]')
    try:
        if nav.count():
            nav.first.click(timeout=5000)
            wait(page, 900)
        if page.locator('#prLogout').count():
            page.locator('#prLogout').click(timeout=5000)
            wait(page, 1200)
    except Exception as e:
        say('   ⚠️ Abmelden hakelig: ' + str(e).split('\n')[0][:90])
        hide_overlays(page)
        page.goto(BASE, wait_until='domcontentloaded')
        wait(page, 1200)


errors = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage'])
    ctx = browser.new_context(
        viewport={'width': 432, 'height': 900}, device_scale_factor=2,
        locale='de-DE', timezone_id='Europe/Berlin',
        record_video_dir=str(VID), record_video_size={'width': 432, 'height': 900},
    )
    page = ctx.new_page()
    page.set_default_timeout(7000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())

    # ---------------------------------------------------------------
    reset_limits()
    say('① Einrichtung: Owner meldet sich zum ersten Mal an')
    onboard(page, OWNER, 'Maxichen', pause=900)
    shot(page, 'v431-1-nach-einrichtung.png')
    body = page.inner_text('body')
    say('   drin: ' + ('ja' if 'Chats' in body else 'UNKLAR'))

    say('② Offizieller Kanal „Lovechen" mit Titelbild')
    page.locator('.gnItem[data-gn="aktuelles"]').first.click()
    wait(page, 2600)
    card = page.locator('#chPinnedOfficial')
    if card.count():
        card.first.click()
        wait(page, 2600)
        vis = page.locator('#chView .chCover img').count() > 0
        say('   Titelbild im Kanal: ' + ('ja' if vis else 'NEIN'))
        shot(page, 'v431-2-kanal-banner.png')
        # Inhaber schreibt einen Beitrag
        if page.locator('#chInput').count():
            page.locator('#chInput').click()
            page.locator('#chInput').type('Willkommen bei LoveChat 💗 Neue Suche + Gemerkt!', delay=40)
            wait(page, 600)
            page.locator('#chSend').click()
            wait(page, 2400)
            shot(page, 'v431-2b-kanal-beitrag.png')
        page.locator('#chBack').click()
        wait(page, 1200)
    else:
        say('   ⚠️ Kanal-Karte nicht gefunden')

    say('③ Chat mit Lovechen: Nachricht senden, Antwort abwarten')
    page.locator('.gnItem[data-gn="chats"]').first.click()
    wait(page, 1200)
    page.locator('#fab').click()
    wait(page, 1200)
    page.locator('.optTile[data-t="private"]').click()
    wait(page, 1200)
    page.locator('#mSearchInput').click()
    page.locator('#mSearchInput').type('Love', delay=80)
    wait(page, 2200)
    row = page.locator('#mSearchRes .mRow')
    if row.count():
        row.first.click()
        wait(page, 2600)
        page.locator('#msgInput').click()
        page.locator('#msgInput').type('Hallo Lovechen 💗 wie geht es dir?', delay=45)
        wait(page, 700)
        page.keyboard.press('Enter')
        wait(page, 3200)
        shot(page, 'v431-3-lovebot.png')

        say('④ Suche im Chat')
        page.locator('#btnChatSearch').click()
        wait(page, 900)
        page.locator('#csbInput').click()
        page.locator('#csbInput').type('Lovechen', delay=75)
        wait(page, 1800)
        cnt = page.locator('#csbCount').inner_text()
        hits = page.locator('.csbHit').count()
        say('   Treffer-Anzeige: ' + cnt + ' · gefundene Zeilen: ' + str(hits))
        shot(page, 'v431-4-suche.png')
        if page.locator('#csbDown').count():
            page.locator('#csbDown').click()
            wait(page, 1200)
        page.locator('#csbClose').click()
        wait(page, 600)

        say('⑤ Nachricht merken (Stern)')
        rows = page.locator('#msgScroll .msgRow')
        if rows.count():
            rows.last.click()
            wait(page, 900)
            star = page.locator('#msgMenu button[data-a="star"]')
            if star.count():
                star.first.click()
                wait(page, 1400)
                shot(page, 'v431-5-gemerkt-toast.png')
    else:
        say('   ⚠️ LoveBot nicht in der Liste')

    say('⑥ Profil → ⭐ Gemerkt')
    page.locator('.gnItem[data-gn="profile"]').first.click()
    wait(page, 1200)
    shot(page, 'v431-6-profil.png')
    st = page.locator('[data-pr="starred"]')
    if st.count():
        st.first.click()
        wait(page, 2000)
        n = page.locator('.stItem').count()
        say('   gemerkte Nachrichten im Bildschirm: ' + str(n))
        shot(page, 'v431-7-gemerkt.png')
        if n:
            page.locator('.stItem').first.click()
            wait(page, 2600)
            shot(page, 'v431-8-gesprungen.png')

    # ---------------------------------------------------------------
    say('⑦ Abmelden → Ben legt sein Konto an')
    logout(page)
    onboard(page, BEN, 'Ben', pause=700)
    shot(page, 'v431-9-ben-drin.png')

    say('⑧ Owner sperrt Ben im Team-Panel')
    logout(page)
    onboard(page, OWNER, None, pause=600)
    wait(page, 1500)
    staff = page.locator('#btnStaff')
    if staff.count():
        staff.first.click()
        wait(page, 1500)
        page.locator('#mpGoUsers').click()
        wait(page, 2200)
        bu = page.locator('.mpUser', has_text='Ben')
        if bu.count():
            bu.first.click()
            wait(page, 1500)
            page.locator('.actTile[data-a="tempban"]').click()
            wait(page, 900)
            page.locator('.opt[data-d="1h"]').click()
            wait(page, 600)
            page.locator('#actReason').click()
            page.locator('#actReason').type('Spam im Chat', delay=55)
            wait(page, 800)
            shot(page, 'v431-10-sperre-setzen.png')
            page.locator('#actRun').click()
            wait(page, 2600)
            shot(page, 'v431-11-gesperrt.png')
        else:
            say('   ⚠️ Ben nicht in der Nutzerliste')
    else:
        say('   ⚠️ kein 👑-Knopf')

    say('⑨ Ben meldet sich an → Sperr-Bildschirm')
    logout(page)
    onboard(page, BEN, None, pause=600)
    wait(page, 2200)
    shot(page, 'v431-12-ban-screen.png')
    body = page.inner_text('body')
    say('   Sperrgrund sichtbar: ' + ('ja' if 'Spam' in body else 'NEIN'))

    say('⑩ Einspruch schreiben')
    if page.locator('#banLogin').count():
        page.locator('#banLogin').fill(BEN)
        page.locator('#banText').fill('Es tut mir leid — ich schreibe nicht mehr so viel. Bitte entsperren.')
        wait(page, 900)
        shot(page, 'v431-13-einspruch.png')
        page.locator('#banSend').click()
        wait(page, 2200)
        shot(page, 'v431-14-einspruch-gesendet.png')

    say('⑪ Owner nimmt den Einspruch an')
    logout(page)
    onboard(page, OWNER, None, pause=600)
    wait(page, 1400)
    page.locator('#btnStaff').first.click()
    wait(page, 1200)
    ap = page.locator('#mpGoAppeals')
    if ap.count():
        ap.click()
        wait(page, 2000)
        shot(page, 'v431-15-einsprueche.png')
        acc = page.locator('#mpBody button[data-d="accept"]')
        if acc.count():
            acc.first.click()
            wait(page, 2600)
            shot(page, 'v431-16-angenommen.png')
        else:
            # Fallback: direkt entsperren
            page.locator('#mpGoUsers').click(); wait(page, 1800)
            bu = page.locator('.mpUser', has_text='Ben')
            if bu.count():
                bu.first.click(); wait(page, 1200)
                page.locator('.actTile[data-a="unban"]').click(); wait(page, 700)
                page.locator('#actRun').click(); wait(page, 2200)

    say('⑫ Ben kommt wieder rein')
    logout(page)
    onboard(page, BEN, None, pause=600)
    wait(page, 2500)
    shot(page, 'v431-17-wieder-drin.png')
    say('   wieder drin: ' + ('ja' if 'Chats' in page.inner_text('body') else 'NEIN'))

    say('⑬ Konto löschen (Dialog, abgebrochen)')
    page.locator('.gnItem[data-gn="profile"]').first.click()
    wait(page, 1200)
    dl = page.locator('[data-pr="delete"]')
    if dl.count():
        dl.first.click()
        wait(page, 1600)
        shot(page, 'v431-18-konto-loeschen.png')
        if page.locator('#delCancel').count():
            page.locator('#delCancel').click()
        wait(page, 900)

    wait(page, 800)
    ctx.close()
    browser.close()

vids = list(VID.glob('*.webm'))
print('\n🎬 Videos:', [v.name for v in vids])
for v in vids:
    dst = OUT / 'v431-video.webm'
    shutil.copy(v, dst)
    print('   →', dst, round(v.stat().st_size / 1e6, 1), 'MB')

print('\nJS-Fehler:', errors if errors else 'keine')
pathlib.Path('/tmp/video431.log').write_text('\n'.join(log), encoding='utf-8')
