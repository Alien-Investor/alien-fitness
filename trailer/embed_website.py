#!/usr/bin/env python3
"""embed_website.py <YT_ID_DE> <YT_ID_EN> — setzt den Alien-Pass-Trailer in die App-Karte auf apps.html (nur DE-Video)
und en/apps.html (nur EN-Video). Sprachgetrennt, anders als bei den Buchkarten. Idempotent. `-` = überspringen."""
import sys
from pathlib import Path
SITE = Path.home()/"projekte/alien-investor.github.io"
if len(sys.argv) != 3: sys.exit("Aufruf: embed_website.py <YT_ID_DE|-> <YT_ID_EN|->")
ID = {"de": sys.argv[1], "en": sys.argv[2]}
PAGE = {"de": SITE/"apps.html", "en": SITE/"en/apps.html"}
TITLE = {"de": "App-Trailer: Alien Fitness – Offline-Trainings-Tracker",
         "en": "App trailer: Alien Fitness – offline workout tracker"}
SUB = {"de": '<p class="subtitle">Minimalistischer, vollständig offline Trainings-Tracker</p>',
       "en": '<p class="subtitle">Minimal, fully offline workout tracker</p>'}
def wrapper(lang):
    return ('\n\n        <div style="position:relative; padding-bottom:56.25%; height:0; margin:1em 0 1.4em; border-radius:8px; overflow:hidden; border:1px solid rgba(0,255,204,0.25); background:#000;">'
            f'\n          <iframe style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;" src="https://www.youtube-nocookie.com/embed/{ID[lang]}" title="{TITLE[lang]}" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'
            '\n        </div>')
for lang in ("de", "en"):
    if ID[lang] == "-": continue
    page = PAGE[lang]; s = page.read_text()
    if ID[lang] in s: print(page.relative_to(SITE), "hat den Embed schon"); continue
    assert s.count(SUB[lang]) == 1, f"{page.name}: Untertitel nicht eindeutig"
    page.write_text(s.replace(SUB[lang], SUB[lang] + wrapper(lang))); print(page.relative_to(SITE), "Embed gesetzt")
