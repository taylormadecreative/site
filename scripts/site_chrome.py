#!/usr/bin/env python3
"""The site's one menu and one footer, written into every page.

The site has no shared partial, so each page carries its own copy of the
<nav class="nav"> block and the footer columns. This script is the partial:
edit the menu here, then run it from the repo root and every page gets the
same markup, with the right relative paths and the current page marked.

    python3 scripts/site_chrome.py            # rewrite every page
    python3 scripts/site_chrome.py --check    # exit 1 if any page is out of date

Each page keeps its own gold button (the nav's .btn-gold) and its own first
footer column (logo + newsletter form). Pages with a bespoke bar
(creator-workshop, success) are left alone.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP = {"creator-workshop/index.html", "success/index.html"}
PORTAL = "https://book.taylormadecreative.net/login.html"
JENEL = "https://jenelstudios.com/"
INSTAGRAM = "https://www.instagram.com/taylormade_creative/"

# ---------- the menu ----------
# Each group: button label, panel id, hub link, a one-line promise, the pages
# (title, short line, optional price), and a piece of real work to show.
GROUPS = [
    {
        "key": "video", "label": "Video", "id": "navVideo",
        "hub": ("video-production/", "Video production"), "all": "All video production",
        "blurb": "Commercials, podcasts, social ads and music videos, directed, lit and cut in-house.",
        "items": [
            ("video-production/commercials/", "Commercials", "Ads and product videos"),
            ("corporate-video/", "Corporate video", "Training and interview videos"),
            ("video-production/podcasts/", "Video podcasts", "Recorded and cut like a show"),
            ("video-production/social-ads/", "Social ads", "Reels, TikTok and Stories"),
            ("video-production/music-videos/", "Music videos", "Concept to final cut"),
            ("social-media/", "Social media", "Monthly reels and carousels"),
        ],
        "feat": ("video-production/#work", "assets/img/nav/video.webp", "Juices &amp; Botanics", "Watch the films"),
        "also": ["video-production/"],
    },
    {
        "key": "web", "label": "Web &amp; apps", "id": "navWeb",
        "hub": ("web-design/", "Web design"), "all": "All web design",
        "blurb": "Hand-coded sites from $1,200, plus Shopify, WordPress, Squarespace, Wix and apps.",
        "items": [
            ("web-design/shopify/", "Shopify", "Stores designed to sell"),
            ("web-design/wordpress/", "WordPress", "Redesigns, posts kept"),
            ("web-design/squarespace/", "Squarespace", "Past the template"),
            ("web-design/wix/", "Wix", "Real type, its own phone layout"),
            ("app-design/", "App design", "iPhone, Apple Watch and Mac"),
            ("ai-creative/", "AI content", "Spokespeople and automation"),
        ],
        "feat": ("web-design/#work", "assets/img/nav/web.webp", "Tabitha Brown", "See the sites"),
        "also": ["web-design/"],
    },
    {
        "key": "photo", "label": "Photography", "id": "navPhoto",
        "hub": ("photography/", "Photography"), "all": "All photography",
        "blurb": "Campaigns and products for brands, plus portraits, in Downtown Dallas or on location.",
        "items": [
            ("branding-photography/", "Branding", "Quote"),
            ("product-photography/", "Product", "Quote"),
            ("digitals/", "Digitals", "$100"),
            ("headshots/", "Headshots", "$150"),
            ("corporate-headshots/", "Team headshots", "From $99 ea"),
            ("birthday/", "Birthday shoots", "From $150"),
            ("senior-photos/", "Senior photos", "From $150"),
        ],
        "prices": True,
        "feat": ("photography/#work", "assets/img/nav/photo.webp", "Product", "See the photos"),
        "also": ["photography/", "headshots/cost/"],
    },
    {
        "key": "studio", "label": "Studio", "id": "navStudio",
        "hub": ("", "Taylormade Creative"), "all": "Home",
        "blurb": "One Dallas studio for film, web, photo and apps, led by Nelson Taylor.",
        "items": [
            ("#about", "About Nelson", "14 years of creative direction"),
            ("#work", "Selected work", "Web, film, photo and apps"),
            ("workshops/", "Workshops", "AI and creative, for teams"),
            ("pricing/", "Prices", "Every posted price"),
            ("faqs/", "FAQs", "Booking, turnaround, delivery"),
            (JENEL, "Studio rental", "Jenel Studios, Downtown Dallas"),
        ],
        "cta": ("book/#project", "Have a project?", "Get a real quote within one business day."),
        "also": ["pricing/", "faqs/", "workshops/"],
    },
]
STORE = ("store/", "Store")
STORE_SECTION = ["store/", "podcast-app/", "privacy/camera/", "privacy/podcast/"]

# ---------- the footer: the same map, as columns ----------
FOOTER = [
    ("Video", [
        ("video-production/", "Video production"), ("video-production/commercials/", "Commercials"),
        ("corporate-video/", "Corporate video"), ("video-production/podcasts/", "Video podcasts"),
        ("video-production/social-ads/", "Social ads"), ("video-production/music-videos/", "Music videos"),
        ("social-media/", "Social media"),
    ]),
    ("Web &amp; apps", [
        ("web-design/", "Web design"), ("web-design/shopify/", "Shopify"), ("web-design/wordpress/", "WordPress"),
        ("web-design/squarespace/", "Squarespace"), ("web-design/wix/", "Wix"), ("app-design/", "App design"),
        ("ai-creative/", "AI content"),
    ]),
    ("Photography", [
        ("photography/", "All photography"), ("branding-photography/", "Branding"), ("product-photography/", "Product"),
        ("digitals/", "Digitals"), ("headshots/", "Headshots"), ("corporate-headshots/", "Team headshots"),
        ("birthday/", "Birthday shoots"), ("senior-photos/", "Senior photos"),
    ]),
    ("Studio", [
        ("#about", "About Nelson"), ("#work", "Selected work"), ("workshops/", "Workshops"), ("store/", "Store"),
        ("pricing/", "Prices"), ("faqs/", "FAQs"), ("book/", "Book a shoot"), (PORTAL, "Client portal"),
        (JENEL, "Studio rental: Jenel Studios"), (INSTAGRAM, "Instagram"),
    ]),
]

CHEV = '<svg viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>'
EXT = ' <span class="nav-ext" aria-hidden="true">↗</span>'


def is_ext(href):
    return href.startswith("http")


def link(prefix, href):
    """Relative URL from the page; '#x' means the homepage anchor."""
    if is_ext(href):
        return href
    if href == "":
        return prefix or "./"
    if href.startswith("#"):
        return (prefix or "./") + href if prefix else href
    return prefix + href


def page_url(rel):
    return rel[: -len("index.html")] if rel.endswith("index.html") else rel


def group_of(url):
    for g in GROUPS:
        urls = ({g["hub"][0]} - {""}) | {i[0] for i in g["items"]} | set(g.get("also", []))
        if url in urls:
            return g["key"]
    if url in STORE_SECTION:
        return "store"
    return None


def cur(href, url):
    return ' aria-current="page"' if href == url else ""


def prefix_of(rel, url):
    # 404.html is served at any missing path, so its links are root-absolute
    return "/" if rel == "404.html" else "../" * url.count("/")


def nav_html(rel, cta, indent):
    url = page_url(rel)
    prefix = prefix_of(rel, url)
    sec = group_of(url)
    home = prefix or "./"
    o = []
    o.append('<nav class="nav" aria-label="Main">')
    o.append(f'  <a class="nav-logo" href="{home}"{cur("", url)}>TAYLORMADE<span class="slash">/</span>CREATIVE<span class="tag">DFW</span></a>')
    o.append('  <button class="nav-burger" type="button" aria-label="Menu" aria-controls="navLinks" id="burger"><span></span><span></span></button>')
    o.append('  <div class="nav-links" id="navLinks">')
    for g in GROUPS:
        on = " is-section" if sec == g["key"] else ""
        o.append(f'    <div class="nav-drop" data-drop="{g["key"]}">')
        o.append(f'      <button class="nav-drop-btn{on}" type="button" aria-expanded="false" aria-controls="{g["id"]}">{g["label"]} {CHEV}</button>')
        o.append(f'      <div class="nav-drop-panel" id="{g["id"]}">')
        o.append('        <div class="nav-mega">')
        hub_href, hub_t = g["hub"]
        o.append('          <div class="nav-mega__intro">')
        o.append(f'            <a class="nav-mega__hub" href="{link(prefix, hub_href)}"{cur(hub_href, url)}><span class="nav-mega__k">{g["label"]}</span><span class="nav-mega__t">{hub_t} <i aria-hidden="true">→</i></span><span class="nav-mega__all">{g["all"]} <i aria-hidden="true">→</i></span></a>')
        o.append(f'            <p>{g["blurb"]}</p>')
        o.append('          </div>')
        cls = "nav-mega__list nav-mega__list--prices" if g.get("prices") else "nav-mega__list"
        o.append(f'          <ul class="{cls}">')
        for href, t, d in g["items"]:
            ext = EXT if is_ext(href) else ""
            o.append(f'            <li><a href="{link(prefix, href)}"{cur(href, url)}><span class="t">{t}{ext}</span><span class="d">{d}</span></a></li>')
        o.append('          </ul>')
        if g.get("feat"):
            fh, img, cap, act = g["feat"]
            o.append(f'          <a class="nav-mega__feat" href="{link(prefix, fh)}"><span class="nav-mega__img" data-img="{prefix}{img}"></span><span class="nav-mega__cap"><span>{cap}</span><b>{act} <i aria-hidden="true">→</i></b></span></a>')
        if g.get("cta"):
            ch, ck, ct = g["cta"]
            o.append(f'          <a class="nav-mega__cta" href="{link(prefix, ch)}"><span class="nav-mega__k">{ck}</span><span class="nav-mega__ct">{ct}</span><b>Start a project <i aria-hidden="true">→</i></b></a>')
        o.append('        </div>')
        o.append('      </div>')
        o.append('    </div>')
    s_on = " is-section" if sec == "store" else ""
    o.append(f'    <a class="nav-store{s_on}" href="{link(prefix, STORE[0])}"{cur(STORE[0], url)}>{STORE[1]}</a>')
    o.append('    <span class="nav-sep" aria-hidden="true"></span>')
    o.append(f'    <a class="nav-util" href="{PORTAL}">Client portal</a>')
    if cta:
        o.append("    " + cta)
    o.append('  </div>')
    o.append('  <div class="nav-scrim" aria-hidden="true"></div>')
    o.append('</nav>')
    return ("\n" + indent).join(o)


def footer_cols(rel, indent):
    url = page_url(rel)
    prefix = prefix_of(rel, url)
    o = []
    for h, items in FOOTER:
        o.append("<div>")
        o.append(f'  <h2 class="footer-h">{h}</h2>')
        for href, t in items:
            extra = ' rel="noopener" target="_blank"' if href == INSTAGRAM else ""
            o.append(f'  <a href="{link(prefix, href)}"{cur(href, url)}{extra}>{t}</a>')
        o.append("</div>")
    return ("\n" + indent).join(o)


def div_end(s, start):
    """Index just past the </div> closing the <div ...> that opens at start."""
    depth = 0
    for m in re.compile(r"<div\b|</div>").finditer(s, start):
        depth += 1 if m.group(0) == "<div" else -1
        if depth == 0:
            return m.end()
    raise ValueError("unbalanced div")


def rewrite(rel, s):
    if rel == "404.html" and 'class="nav"' not in s:
        s = s.replace("<body>\n", "<body>\n  " + nav_html(rel, '<a class="btn btn-gold" href="/book/#project">Start a project</a>', "  ") + "\n", 1)
    m = re.search(r'^([ \t]*)<nav class="nav"[^>]*>.*?</nav>', s, re.S | re.M)
    if m and 'id="navLinks"' in m.group(0):
        old = m.group(0)
        c = re.search(r'<a class="btn btn-gold"[^>]*>.*?</a>', old, re.S)
        s = s[: m.start()] + m.group(1) + nav_html(rel, c.group(0) if c else "", m.group(1)) + s[m.end():]
    fg = s.find('<div class="footer-grid">')
    if fg >= 0:
        first = s.find("<div", fg + 5)
        after_first = div_end(s, first)
        close = s.rfind("</div>", 0, div_end(s, fg))
        ind = s[s.rfind("\n", 0, first) + 1: first]
        close_line = s.rfind("\n", 0, close) + 1
        s = s[:after_first] + "\n" + ind + footer_cols(rel, ind) + "\n" + s[close_line:]
    return s


def pages():
    for p in sorted(ROOT.rglob("*.html")):
        rel = p.relative_to(ROOT).as_posix()
        if rel in SKIP or rel.startswith(("docs/", "kit/", "supabase/", "scripts/", "assets/")) or "/." in rel:
            continue
        yield p, rel


def main():
    check = "--check" in sys.argv
    stale = []
    for p, rel in pages():
        s = p.read_text()
        if 'class="nav"' not in s and "footer-grid" not in s and rel != "404.html":
            continue
        new = rewrite(rel, s)
        if new != s:
            stale.append(rel)
            if not check:
                p.write_text(new)
    print(("out of date: " if check else "rewrote: ") + (", ".join(stale) or "nothing"))
    sys.exit(1 if check and stale else 0)


if __name__ == "__main__":
    main()
