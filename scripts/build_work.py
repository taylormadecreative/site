#!/usr/bin/env python3
"""Builds the case studies: work/index.html and one page per client.

    python3 scripts/build_work.py        # write the pages
    python3 scripts/site_chrome.py       # then fill in the shared nav + footer (run twice, then --check)

Everything a page says lives in CASES below. Rules for editing it:
  - Only facts that are true and already agreed to be public. No results, dates or
    numbers that the client or Nelson has not confirmed.
  - A quote goes in "quote" as {"text", "name", "role"} only after the client has
    approved the exact words in writing. Until then leave it None and the page shows
    no quote at all.
  - Tabitha Brown: written consent covers showing the site, naming her and crediting
    the website design. Anything beyond that needs a new written OK first.

The head (fonts, icon, analytics) and the footer shell are copied from start/index.html
so they can never drift from the rest of the site.
"""
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://www.taylormadecreative.net/"
VER = "20261117a"   # css/work.css and js/work.js
V = {}                # shared css/js versions, read from the homepage in main()

FILMS = {
    "tga": {"t": "The recruiting film", "m": "Brand film · 0:53", "dur": "0:53", "yt": "ai6gyONaabA",
            "d": "The academy’s admissions and education directors on camera, with the students at work.",
            "v": "assets/video/full/tga", "poster": "assets/img/films/tga-1280.webp", "hd": True,
            "alt": "TONI&GUY Academy brand film"},
    "tgplano": {"t": "The Plano ISD commercial", "m": "Commercial · 1:00", "dur": "1:00", "yt": "uF3kDgPagss",
                "d": "A one-minute spot inviting Plano ISD students to apply to the academy’s program.",
                "v": "assets/video/full/tgplano", "poster": "assets/img/films/tgplano-1280.webp", "hd": True,
                "alt": "TONI&GUY Academy commercial for Plano ISD"},
    "oribe": {"t": "Oribe", "m": "Product commercial · 0:24", "dur": "0:24", "yt": "of87wf29ueg",
              "d": "Oribe styling products on a model and in slow-motion product shots, ending on “Shop now at TONI&GUY.”",
              "v": "assets/video/full/oribe", "poster": "assets/img/films/oribe-1280.webp", "hd": True,
              "alt": "Oribe product commercial"},
    "brow": {"t": "Lesson 01: Brow Lift & Crow’s Feet", "m": "Neurotoxin · 1:04", "dur": "1:04",
             "v": "assets/video/training/brow", "poster": "assets/img/training/brow-1280.jpg", "hd": True,
             "vtt": "assets/video/training/brow.vtt", "alt": "Training lesson 1, Brow Lift and Crow’s Feet"},
    "frontalis": {"t": "Lesson 02: Frontalis", "m": "Neurotoxin · 1:39", "dur": "1:39",
                  "v": "assets/video/training/frontalis", "poster": "assets/img/training/frontalis-1280.jpg", "hd": True,
                  "vtt": "assets/video/training/frontalis.vtt", "alt": "Training lesson 2, Frontalis"},
    "chin": {"t": "Lesson 03: Chin & DAO", "m": "Neurotoxin · 2:16", "dur": "2:16",
             "v": "assets/video/training/chin", "poster": "assets/img/training/chin-1280.jpg", "hd": True,
             "vtt": "assets/video/training/chin.vtt", "alt": "Training lesson 3, Chin and DAO"},
    "fanning": {"t": "Lesson 04: Fanning technique", "m": "Injection technique · 0:35", "dur": "0:35",
                "v": "assets/video/training/fanning", "poster": "assets/img/training/fanning-1280.jpg", "hd": True,
                "alt": "Training lesson 4, the fanning technique"},
    "secret": {"t": "It’s a Secret Med Spa", "m": "Commercial with voiceover · Chicago · 0:19", "dur": "0:19", "yt": "5HZQp4vuAyI",
               "d": "A voiceover spot for a Chicago med spa’s sale: the walk-in, the treatments and the brand.",
               "v": "assets/video/full/secret", "poster": "assets/img/films/secret-1280.webp", "hd": True,
               "alt": "It’s a Secret Med Spa commercial"},
}

CASES = [
    {
        "slug": "toni-and-guy-academy",
        "name": "TONI&GUY Academy",
        "kind": "Recruiting film and commercial",
        "need": "video",
        "lede": "A recruiting brand film and a one-minute commercial for a hair academy, directed, shot and edited in-house.",
        "card": "A recruiting brand film with the academy’s directors on camera, and a one-minute commercial inviting Plano ISD students to apply.",
        "thumb": {"src": "assets/img/films/tga-1280.webp", "small": "assets/img/films/tga-640.webp", "sw": 640, "w": 1280, "h": 720,
                  "alt": "TONI&GUY Academy brand film: the education director talking on camera in front of a wall of hair campaign photos"},
        "facts": [("Client", "TONI&GUY Academy"), ("Work", "Recruiting brand film, commercial"),
                  ("My part", "Direction, camera and edit")],
        "media": {"type": "films", "lead": "tga", "rest": ["tgplano"], "also_h": "Also filmed", "also": ["oribe"]},
        "story": [
            ("The project", "There are two films here. The first is a recruiting film: the academy’s admissions and education directors talk on camera, and the students are shown at work. The second is a one-minute commercial that invites Plano ISD students to apply to the academy’s program."),
            ("My part", "I directed, shot and edited both films in-house. One director on both is why they look and sound like the same school."),
        ],
        "quote": None,
    },
    {
        "slug": "its-a-secret-academy",
        "name": "It’s A Secret Academy",
        "kind": "Training series",
        "need": "corporate",
        "lede": "Four injector-training lessons finished like a course, with graphics that show what the instructor is saying.",
        "card": "Four injector-training lessons turned into a course: anatomy cards, dosing and cautions on screen, chapters and captions.",
        "thumb": {"src": "assets/img/training/brow-1280.jpg", "small": "assets/img/training/brow-480.jpg", "sw": 480, "w": 1280, "h": 720,
                  "alt": "A frame from the Brow Lift and Crow’s Feet training lesson for It’s A Secret Academy"},
        "facts": [("Client", "It’s A Secret Academy, Irving, Texas"), ("Work", "Four-lesson training series"),
                  ("My part", "Edit, motion graphics and captions")],
        "media": {"type": "films", "lead": "brow", "rest": ["frontalis", "chin", "fanning"], "also_h": "Also for the brand", "also": ["secret"]},
        "story": [
            ("The project", "It’s A Secret Academy trains injectors in Irving, Texas. I turned four of its lessons into a course: brow lift and crow’s feet, frontalis, chin and DAO, and the fanning technique."),
            ("My part", "Each muscle lights up on an anatomy card as the instructor names it. Dosing and cautions build on screen in the instructor’s own words. The graphics step aside whenever the injector’s hands need the frame."),
            ("Delivered", "Every lesson ships with chapters, on-screen key points and branded end cards, in 4K. Three of the four lessons also come with a caption file."),
        ],
        "quote": None,
    },
    {
        "slug": "tabitha-brown",
        "name": "Tabitha Brown",
        "kind": "Brand hub website",
        "need": "web",
        "lede": "One home for everything Tabitha Brown does, in eight full-screen chapters. Designed and hand-coded.",
        "card": "One address for the whole brand: eight full-screen chapters in her colors, with booking inquiries built in.",
        "thumb": {"src": "assets/img/web-design/tab-d-0.webp", "small": "assets/img/web-design/tab-d-0-720.webp", "sw": 720, "top": True, "w": 1280, "h": 800,
                  "alt": "Tabitha Brown website: the opening chapter, “Hello There.”"},
        "facts": [("Client", "Tabitha Brown"), ("Work", "Brand hub website"),
                  ("My part", "Design and code"), ("Live at", ("tabithabrown.com", "https://tabithabrown.com/"))],
        "media": {"type": "screens", "host": "tabithabrown.com", "url": "https://tabithabrown.com/", "stem": "assets/img/web-design/tab-d-", "screens": [
            ("Hello There.", "About Me"), ("A Brand Built on Love.", "Tab + Chance"), ("The Body Mist.", "Body mist"),
            ("Healthy. Happy. Hair Care.", "Donna’s Recipe"), ("Written with Intention.", "Books"), ("Wear the joy.", "Merch"),
            ("It’s Tab Time!", "Tab Time"), ("On stage, on demand.", "Events"),
        ]},
        "story": [
            ("The project", "One home for everything Tabitha Brown does: Tab + Chance, her body mist, Donna’s Recipe hair care, her books, Tab Time, merch, events and booking inquiries."),
            ("My part", "I designed the site and wrote the code by hand. It runs as eight full-screen chapters in her colors, and it works on every screen size."),
        ],
        "quote": None,
    },
    {
        "slug": "chariot-exteriors",
        "name": "Chariot Exteriors",
        "kind": "Home services website",
        "need": "web",
        "lede": "A website for a Dallas–Fort Worth home exterior company, built so every page leads to a free quote or a phone call.",
        "card": "Siding, windows, doors and sunrooms. Every page leads to a free quote or a call, with a before-and-after slider.",
        "thumb": {"src": "assets/img/work/chariot-thumb.webp", "small": "assets/img/work/chariot-thumb-720.webp", "sw": 720, "w": 1200, "h": 750,
                  "alt": "Chariot Exteriors website, the top of the homepage"},
        "facts": [("Client", "Chariot Exteriors"), ("Work", "Website"),
                  ("My part", "Design and code"), ("Live at", ("chariotexteriors.com", "https://chariotexteriors.com/"))],
        "media": {"type": "scroll", "host": "chariotexteriors.com", "url": "https://chariotexteriors.com/",
                  "desk": {"src": "assets/img/web-design/chariot-d.webp", "small": "assets/img/web-design/chariot-d-720.webp", "w": 1200, "h": 4500},
                  "phone": {"src": "assets/img/web-design/chariot-m.webp", "small": "assets/img/web-design/chariot-m-240.webp", "w": 480, "h": 6233}},
        "story": [
            ("The project", "Chariot Exteriors installs siding, windows, doors and sunrooms for Dallas–Fort Worth homeowners. The site is built to turn a visit into a free quote request or a phone call."),
            ("My part", "I designed the site and wrote the code by hand. Every page leads to a free quote or a tap-to-call button, and a before-and-after slider lets people drag to see the difference."),
        ],
        "quote": None,
    },
]

PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 4.5v15l12.5-7.5z"/></svg>'
PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>'


def e(s):
    return html.escape(s, quote=True)


def mast(text):
    words = text.split(" ")
    return " ".join(f'<span class="w" style="--i:{i}"><span>{e(w)}</span></span>' for i, w in enumerate(words))


def shell_parts():
    s = (ROOT / "start/index.html").read_text()
    icon = re.search(r'^[ \t]*<link rel="icon"[^\n]*\n', s, re.M).group(0)
    ga = re.search(r"^[ \t]*<!-- GA4.*?</script>\n", s, re.S | re.M).group(0)
    footer = re.search(r'^[ \t]*<footer class="footer">.*?</footer>\n', s, re.S | re.M).group(0)
    assert 'content_group: "Taylormade Creative"' in ga, "start/index.html has an old analytics snippet"
    return icon, ga, footer


def head(p, path, title, desc, og_title, ld, icon, ga, og=None):
    url = SITE + path
    og_img, og_alt = og or ("assets/img/og/home.jpg", "Taylormade Creative: Every frame working for your brand.")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{e(title)}</title>
  <meta name="description" content="{e(desc)}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <link rel="canonical" href="{url}">
  <meta name="theme-color" content="#08080a">
{icon}  <script>document.documentElement.classList.add("js");</script>

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Taylormade Creative">
  <meta property="og:locale" content="en_US">
  <meta property="og:title" content="{e(og_title)}">
  <meta property="og:description" content="{e(desc)}">
  <meta property="og:image" content="{SITE}{og_img}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="{e(og_alt)}">
  <meta property="og:url" content="{url}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{e(og_title)}">
  <meta name="twitter:description" content="{e(desc)}">
  <meta name="twitter:image" content="{SITE}{og_img}">

  <link rel="preconnect" href="https://use.typekit.net" crossorigin>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://use.typekit.net/sbr6kqy.css">
  <link href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400..700&amp;family=Unbounded:wght@900&amp;display=swap" rel="stylesheet">
  <link rel="stylesheet" href="{p}css/site.css?v={V['css/site.css']}">
  <link rel="stylesheet" href="{p}css/home.css?v={V['css/home.css']}">
  <link rel="stylesheet" href="{p}css/work.css?v={VER}">

{ga}
  <script type="application/ld+json">
{json.dumps(ld, indent=2, ensure_ascii=False)}
  </script>
</head>
<body class="hm wk">
  <a class="skip" href="#main">Skip to content</a>
  <div class="hm-progress" aria-hidden="true"><span></span></div>

  <nav class="nav" aria-label="Main">
    <a class="nav-logo" href="{p}">TAYLORMADE<span class="slash">/</span>CREATIVE<span class="tag">DFW</span></a>
    <div class="nav-links" id="navLinks">
      <a class="btn btn-gold" href="{p}start/">Start a project</a>
    </div>
  </nav>
"""


def tail(p, footer):
    f = footer.replace('"../', f'"{p}') if p != "../" else footer
    return f"""
{f}
  <script src="{p}js/config.js" defer></script>
  <script src="{p}js/site.js?v={V['js/site.js']}" defer></script>
  <script src="{p}js/home.js?v={V['js/home.js']}" defer></script>
  <script src="{p}js/work.js?v={VER}" defer></script>
</body>
</html>
"""


def crumbs(items):
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(items)]}


def cta(p, need=None):
    q = f"?need={need}" if need else ""
    amp = "&amp;" if need else "?"
    return f"""
    <section class="wk-cta" aria-labelledby="cta-h">
      <div class="hm-wrap wk-cta__in">
        <h2 class="wk-cta__h" id="cta-h" data-fade>Have a project in mind?</h2>
        <div class="wk-cta__side" data-fade>
          <p>Send a short brief or request a 20-minute call. I read every message myself and reply within one business day.</p>
          <div class="wk-cta__acts">
            <a class="wk-btn" href="{p}start/{q}">Send a brief</a>
            <a class="wk-cta__link" href="{p}start/{q}{amp}mode=call">Request a 20-minute call <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </div>
    </section>"""


def film(p, key, lead=False):
    f = FILMS[key]
    v = p + f["v"]
    track = f'\n            <track kind="captions" srclang="en" label="English" src="{p}{f["vtt"]}">' if f.get("vtt") else ""
    desc = f'\n          <p>{e(f["d"])}</p>' if f.get("d") else ""
    yt = (f'\n          <a class="wk-film__yt" href="https://www.youtube.com/watch?v={f["yt"]}" target="_blank" rel="noopener">'
          f'Watch on YouTube<span class="sr-only"> (opens in a new tab)</span> <span aria-hidden="true">↗</span></a>') if f.get("yt") else ""
    return f"""        <figure class="wk-film{' wk-film--lead' if lead else ''}" data-film="{key}" data-fade>
          <div class="wk-film__screen">
            <video controls playsinline preload="none" poster="{p}{f['poster']}" src="{v}-720.mp4" data-hd="{v}-1080.mp4" width="1920" height="1080" aria-label="{e(f['alt'])}, {e(f['dur'])}">{track}
            </video>
            <button class="wk-play" type="button" aria-label="Play: {e(f['alt'])}"><span class="wk-play__pill">{PLAY}<span><b>Play</b><span>{e(f['dur'])}</span></span></span></button>
          </div>
          <figcaption class="wk-film__cap">
            <b>{e(f['t'])}</b><span>{e(f['m'])}</span>{desc}{yt}
          </figcaption>
        </figure>"""


def media(p, c):
    m = c["media"]
    name = e(c["name"])
    if m["type"] == "films":
        rest = "\n".join(film(p, k) for k in m["rest"])
        also = ""
        if m.get("also"):
            also = f"""
        <h2 class="wk-also" data-fade>{e(m['also_h'])}</h2>
        <div class="wk-films wk-films--also">
{chr(10).join(film(p, k) for k in m['also'])}
        </div>"""
        return f"""
    <section class="wk-media" aria-label="The films">
      <div class="hm-wrap">
{film(p, m['lead'], lead=True)}
        <div class="wk-films wk-films--{len(m['rest'])}">
{rest}
        </div>{also}
      </div>
    </section>"""
    visit = (f'<a class="hm-link" href="{m["url"]}" target="_blank" rel="noopener" aria-label="Visit {m["host"]} (opens in a new tab)">'
             f'Visit {m["host"]} <span aria-hidden="true">↗</span></a>')
    if m["type"] == "screens":
        figs = []
        for i, (line, label) in enumerate(m["screens"]):
            lead = i in (0, len(m["screens"]) - 1)
            sizes = "(min-width: 1000px) 92vw, 100vw" if lead else "(min-width: 760px) 46vw, 100vw"
            figs.append(f"""        <figure class="wk-shot{' wk-shot--lead' if lead else ''}" data-fade>
          <img src="{p}{m['stem']}{i}.webp" srcset="{p}{m['stem']}{i}-720.webp 720w, {p}{m['stem']}{i}.webp 1280w" sizes="{sizes}" width="1280" height="800" {'fetchpriority="high"' if i == 0 else 'loading="lazy"'} decoding="async" alt="{name} website, chapter {i + 1} of {len(m['screens'])}: “{e(line)}”">
          <figcaption><b>{i + 1:02d}</b><span>{e(label)}</span></figcaption>
        </figure>""")
        return f"""
    <section class="wk-media" aria-label="The website">
      <div class="hm-wrap">
        <div class="wk-shots">
{chr(10).join(figs)}
        </div>
        <p class="wk-visit" data-fade>Screens from the live site. {visit}</p>
      </div>
    </section>"""
    d, ph = m["desk"], m["phone"]
    return f"""
    <section class="wk-media" aria-label="The website">
      <div class="hm-wrap">
        <div class="wk-duo" data-preview>
          <figure class="wk-browser" data-fade>
            <div class="wk-browser__bar" aria-hidden="true"><i></i><i></i><i></i><span>{m['host']}</span></div>
            <div class="wk-browser__view" data-preview-view tabindex="0" role="region" aria-label="{name} homepage on a laptop, full length"><img src="{p}{d['src']}" srcset="{p}{d['small']} 720w, {p}{d['src']} 1200w" sizes="(min-width: 1000px) 62vw, 92vw" width="{d['w']}" height="{d['h']}" fetchpriority="high" decoding="async" alt="{name} website on a laptop: the full homepage, top to bottom"></div>
          </figure>
          <figure class="wk-phone" data-fade>
            <div class="wk-phone__view" data-preview-view tabindex="0" role="region" aria-label="{name} homepage on a phone, full length"><img src="{p}{ph['small']}" srcset="{p}{ph['small']} 240w, {p}{ph['src']} 480w" sizes="(min-width: 1000px) 18vw, 44vw" width="{ph['w']}" height="{ph['h']}" loading="lazy" decoding="async" alt="{name} website on a phone: the full homepage, top to bottom"></div>
          </figure>
          <button class="wk-pause" type="button" data-preview-ctl><span class="wk-pause__i" data-i-pause>{PAUSE}</span><span class="wk-pause__i" data-i-play hidden>{PLAY}</span><span data-preview-t>Pause the preview</span></button>
        </div>
        <p class="wk-visit" data-fade>The full homepage, top to bottom. {visit}</p>
      </div>
    </section>"""


def fact_rows(c):
    rows = []
    for k, v in c["facts"]:
        if isinstance(v, tuple):
            v = (f'<a href="{v[1]}" target="_blank" rel="noopener">{e(v[0])}<span class="sr-only"> (opens in a new tab)</span>'
                 f' <span aria-hidden="true">↗</span></a>')
        else:
            v = e(v)
        rows.append(f"            <div><dt>{e(k)}</dt><dd>{v}</dd></div>")
    return "\n".join(rows)


def case_page(c, icon, ga, footer):
    p = "../../"
    path = f"work/{c['slug']}/"
    title = f"{c['name']}: {c['kind']} | Taylormade Creative"
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "WebPage", "@id": SITE + path + "#page", "url": SITE + path,
         "name": f"{c['name']}: {c['kind'].lower()} by Taylormade Creative", "description": c["lede"],
         "isPartOf": {"@id": SITE + "#website"}, "about": {"@id": SITE + "#studio"}, "inLanguage": "en-US"},
        crumbs([("Taylormade Creative", SITE), ("Case studies", SITE + "work/"), (c["name"], SITE + path)]),
    ]}
    story = "\n".join(
        f"""          <div class="wk-story__row" data-fade>
            <h2 class="wk-story__h">{e(h)}</h2>
            <p>{e(t)}</p>
          </div>""" for h, t in c["story"])
    quote = ""
    if c.get("quote"):
        q = c["quote"]
        quote = f"""
    <section class="wk-quote" aria-label="From the client">
      <div class="hm-wrap">
        <figure data-fade>
          <blockquote><p>{e(q['text'])}</p></blockquote>
          <figcaption><b>{e(q['name'])}</b><span>{e(q['role'])}</span></figcaption>
        </figure>
      </div>
    </section>"""
    others = [o for o in CASES if o is not c]
    more = "\n".join(
        f"""          <li><a href="../{o['slug']}/"><b>{e(o['name'])}</b><span>{e(o['kind'])}</span><i aria-hidden="true">→</i></a></li>"""
        for o in others)
    body = f"""
  <main id="main">

    <section class="wk-hero" aria-labelledby="wk-h">
      <div class="wk-hero__in">
        <div class="wk-hero__copy">
          <p class="wk-crumb" data-load style="--i:0"><a href="../">Case studies</a><span aria-hidden="true">/</span><span>{e(c['kind'])}</span></p>
          <h1 class="hm-h1" id="wk-h">
            <span class="hm-mast">{mast(c['name'])}</span>
          </h1>
          <p class="hm-lede" data-load style="--i:1">{e(c['lede'])}</p>
        </div>
        <dl class="wk-facts" data-load style="--i:2">
{fact_rows(c)}
        </dl>
      </div>
    </section>
{media(p, c)}

    <section class="wk-story" aria-label="About the project">
      <div class="hm-wrap">
        <div class="wk-story__list">
{story}
        </div>
      </div>
    </section>
{quote}
    <section class="wk-more" aria-labelledby="more-h">
      <div class="hm-wrap">
        <h2 class="wk-more__h" id="more-h" data-fade>More case studies</h2>
        <ul class="wk-more__list" role="list" data-fade>
{more}
        </ul>
      </div>
    </section>
{cta(p, c['need'])}
  </main>
"""
    og = (f"assets/img/work/og-{c['slug']}.jpg", c["thumb"]["alt"])
    return path, head(p, path, title, c["lede"], f"{c['name']} | Taylormade Creative", ld, icon, ga, og) + body + tail(p, footer)


def index_page(icon, ga, footer):
    p = "../"
    path = "work/"
    desc = ("Case studies from Taylormade Creative in Dallas: a recruiting film for TONI&GUY Academy, a training series for "
            "It’s A Secret Academy, and websites for Tabitha Brown and Chariot Exteriors.")
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "@id": SITE + path + "#page", "url": SITE + path,
         "name": "Case studies from Taylormade Creative", "description": desc,
         "isPartOf": {"@id": SITE + "#website"}, "about": {"@id": SITE + "#studio"}, "inLanguage": "en-US",
         "mainEntity": {"@type": "ItemList", "itemListElement": [
             {"@type": "ListItem", "position": i + 1, "name": c["name"], "url": f"{SITE}work/{c['slug']}/"}
             for i, c in enumerate(CASES)]}},
        crumbs([("Taylormade Creative", SITE), ("Case studies", SITE + path)]),
    ]}
    rows = []
    for i, c in enumerate(CASES):
        t = c["thumb"]
        rows.append(f"""          <li class="wk-row" data-fade>
            <a href="{c['slug']}/">
              <div class="wk-row__art{' wk-row__art--top' if t.get('top') else ''}"><img src="{p}{t['src']}" srcset="{p}{t['small']} {t['sw']}w, {p}{t['src']} {t['w']}w" sizes="(min-width: 1000px) 52vw, 100vw" width="{t['w']}" height="{t['h']}" {'fetchpriority="high"' if i == 0 else 'loading="lazy"'} decoding="async" alt=""></div>
              <div class="wk-row__copy">
                <span class="wk-row__n" aria-hidden="true">{i + 1:02d}</span>
                <span class="wk-row__k">{e(c['kind'])}</span>
                <h2 class="wk-row__t">{e(c['name'])}</h2>
                <p class="wk-row__d">{e(c['card'])}</p>
                <span class="wk-row__go">Read the case study <i aria-hidden="true">→</i></span>
              </div>
            </a>
          </li>""")
    body = f"""
  <main id="main">

    <section class="wk-hero wk-hero--index" aria-labelledby="wk-h">
      <div class="wk-hero__in">
        <div class="wk-hero__copy">
          <h1 class="hm-h1" id="wk-h">
            <span class="hm-kick" data-load style="--i:0">Case studies</span>
            <span class="hm-mast">{mast('The work, client by client.')}</span>
          </h1>
          <p class="hm-lede" data-load style="--i:1">Client projects in detail: what each one is and my part in it.</p>
        </div>
      </div>
    </section>

    <section class="wk-index" aria-label="Case studies">
      <div class="hm-wrap">
        <ol class="wk-rows" role="list">
{chr(10).join(rows)}
        </ol>
      </div>
    </section>
{cta(p)}
  </main>
"""
    return path, head(p, path, "Case Studies | Taylormade Creative, Dallas", desc, "Case Studies | Taylormade Creative", ld, icon, ga) + body + tail(p, footer)


def main():
    home = (ROOT / "index.html").read_text()
    for f in ("css/site.css", "css/home.css", "js/site.js", "js/home.js"):
        V[f] = re.search(re.escape(f) + r"\?v=([0-9a-z]+)", home).group(1)
    icon, ga, footer = shell_parts()
    out = [index_page(icon, ga, footer)] + [case_page(c, icon, ga, footer) for c in CASES]
    for path, page in out:
        f = ROOT / path / "index.html"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(page)
        print("wrote", f.relative_to(ROOT))


if __name__ == "__main__":
    main()
