/* COVER STORY · interactive hub prototype
   Plain JS, no library. Transform, opacity and clip-path only. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const Q = new URLSearchParams(location.search);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const phoneMQ = matchMedia("(max-width: 899.98px)");
  const track = (name, params) => { try { window.gtag && window.gtag("event", name, params); } catch (_) {} };
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (_) { return "1"; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} },
  };


  /* nav height drives the cover */
  const nav = $(".nav");
  const setNavH = () => { if (nav) root.style.setProperty("--nav-h", nav.offsetHeight + "px"); };
  setNavH();

  /* ============================================================
     TYPE: letters one by one, kerning restored per pair,
     fitted by ink (not advance width), left side bearing pulled out
     ============================================================ */
  const ctx = document.createElement("canvas").getContext("2d");
  const KERN_FIX = { /* manual pair adjustments in em, from the 200% QA (pair: em) */
    "PH": 0, "HO": 0, "OT": 0, "OG": 0, "GR": 0, "RA": 0, "AP": 0, "TH": 0, "AT": 0, "LY": 0, "AV": 0, "DO": 0, "RS": 0,
  };
  const fontOf = (el, size) => {
    const cs = getComputedStyle(el);
    return `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  };
  function measure(text, font, ls, ws = 0) {
    ctx.font = font;
    ctx.fontKerning = "normal";
    ctx.letterSpacing = ls + "px";
    ctx.wordSpacing = ws + "px";
    return ctx.measureText(text);
  }
  function setLetters(el) {
    if (el.dataset.set) return;
    const text = el.textContent;
    const ref = 100, font = fontOf(el, ref);
    el.dataset.text = text;
    el.setAttribute("aria-label", text);
    const chars = [...text];
    ctx.font = font; ctx.fontKerning = "normal"; ctx.letterSpacing = "0px";
    const w = (s) => ctx.measureText(s.toUpperCase()).width;
    el.innerHTML = "";
    chars.forEach((c, i) => {
      if (c === " ") { el.appendChild(document.createTextNode(" ")); return; }   /* a real space, so word-spacing applies */
      const span = document.createElement("span");
      span.className = "k";
      span.setAttribute("aria-hidden", "true");
      span.textContent = c;
      span.style.setProperty("--i", i);
      const n = chars[i + 1];
      if (n && c !== " " && n !== " ") {
        const pair = (c + n).toUpperCase();
        const kern = (w(c + n) - w(c) - w(n)) / ref + (KERN_FIX[pair] || 0);
        if (Math.abs(kern) > .0005) span.style.marginRight = kern.toFixed(4) + "em";
      }
      el.appendChild(span);
    });
    el.dataset.set = "1";
  }
  function fit(el) {
    const box = el.getBoundingClientRect().width;
    if (!box) return 0;
    const cs = getComputedStyle(el);
    const ls = parseFloat(cs.letterSpacing) / parseFloat(cs.fontSize) || 0;   // em
    const ws = parseFloat(cs.wordSpacing) / parseFloat(cs.fontSize) || 0;     // em
    const ref = 100;
    const m = measure((el.dataset.text || el.textContent).toUpperCase(), fontOf(el, ref), ls * ref, ws * ref);
    const ink = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;            // ink width at 100px
    let size = (box / ink) * ref;
    const hf = parseFloat(cs.getPropertyValue("--mast-h")), stage = hf > 0 && el.closest(".cv");
    if (stage) size = Math.min(size, (stage.clientHeight * hf) / (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) * ref);
    el.style.fontSize = size.toFixed(2) + "px";
    const first = el.querySelector(".k");                                       // pull the first stem onto the column edge
    if (first) first.style.marginLeft = (m.actualBoundingBoxLeft * size / ref).toFixed(2) + "px";
    return size;
  }
  /* the hanging period and the optical right edge of right-aligned lines */
  const nativeHang = CSS.supports("hanging-punctuation", "last");
  /* Hang only the period: the period's own ink sits past the margin, nothing more
     (the S-to-period gap stays inside the measure). */
  function hang(scope) {
    if (nativeHang) return;                                   /* Safari hangs it natively */
    $$(".hang", scope).forEach((h) => {
      const line = h.parentElement, cs = getComputedStyle(line);
      const fs = parseFloat(cs.fontSize), ref = 100, k = ref / fs;
      const ls = (parseFloat(cs.letterSpacing) || 0) * k, ws = (parseFloat(cs.wordSpacing) || 0) * k;
      const font = fontOf(line, ref);
      const full = measure(line.textContent.toUpperCase(), font, ls, ws);
      const dot = measure(".", font, 0, 0);
      const dotInk = dot.actualBoundingBoxLeft + dot.actualBoundingBoxRight;
      const dotInkLeft = full.actualBoundingBoxRight - dotInk;          /* where the period's ink starts */
      h.style.marginRight = (-(full.width - dotInkLeft) / ref).toFixed(4) + "em";
    });
  }

  /* prices: "$150" is one unbreakable unit everywhere; $ before a 1 is a hair open in Acumin (manual kern, QA'd at 200%) */
  function kernDollar(scope = document) {
    $$(".cl > b, .pg-toc__price, .cv__deck-l, .pg-feature__price, .pg-lb__cap p, .pg-tab__t, .pg-bar__text b, .pill, .cv__alt", scope).forEach((el) => {
      if (el.dataset.dk) return; el.dataset.dk = "1";
      const acumin = /acumin/.test(getComputedStyle(el).fontFamily);
      el.innerHTML = el.innerHTML.replace(/\$(\d[\d,]*)/g, (_, n) => `<span class="pu">${acumin && n[0] === "1" ? '<span class="kd">$</span>' : "$"}${n}</span>`);
    });
  }
  function setType(scope = document) {
    kernDollar(scope);
    $$(".js-mast", scope).forEach((el) => setLetters(el));
    $$(".cv:not([hidden])", scope.closest ? scope : document).forEach((cv) => fitCover(cv));
    $$(".pg-mini__word .js-mast, .pg-back__mast .js-mast:not([data-fit])", scope).forEach((el) => fit(el));
    /* a stacked headline: every line fitted, then all set at the size of the longest line */
    const groups = {};
    $$("[data-fit]", scope).forEach((el) => (groups[el.dataset.fit] ||= []).push(el));
    Object.values(groups).forEach((els) => {
      const sizes = els.map((el) => fit(el)), min = Math.min(...sizes.filter(Boolean));
      els.forEach((el, k) => {
        if (!sizes[k] || !min) return;
        el.style.fontSize = min.toFixed(2) + "px";
        const f = el.querySelector(".k"); if (f) f.style.marginLeft = (parseFloat(f.style.marginLeft || 0) * min / sizes[k]).toFixed(2) + "px";
      });
    });
    hang(scope);
  }
  function fitCover(cv) {
    const m = $(".cv__mast", cv);
    if (!m) return;
    const size = fit(m);
    if (size) cv.style.setProperty("--mf", size.toFixed(2) + "px");
  }

  /* ============================================================
     THE COVER: five covers, a page turn, hover preview, keys, swipe
     ============================================================ */
  const covers = $$(".cv");
  const tabs = $$(".pg-tab");
  const names = covers.map((c) => c.dataset.cover);
  let current = Math.max(0, names.indexOf(Q.get("cover") || names[0]));
  let turning = false;

  function load(i) {
    const cv = covers[i];
    if (!cv || cv.dataset.loaded) return Promise.resolve();
    cv.dataset.loaded = "1";
    $$("template", cv).forEach((t) => t.replaceWith(t.content.cloneNode(true)));   /* plates arrive only on intent */
    return Promise.all($$("img", cv).map((img) => img.decode().catch(() => {})));
  }
  covers[0].dataset.loaded = "1";

  function show(i) {
    covers.forEach((c, k) => {
      const on = k === i;
      c.hidden = !on;
      c.classList.toggle("is-active", on);
      c.inert = !on;
    });
    fitCover(covers[i]);
    hang(covers[i]);
  }
  function selectTab(i) {
    tabs.forEach((t, k) => {
      t.setAttribute("aria-selected", String(k === i));
      t.tabIndex = k === i ? 0 : -1;
    });
  }
  function rise(cv, delay = 0) {
    if (reduced) return;
    cv.classList.remove("is-rising");
    cv.style.setProperty("--d0", delay + "ms");
    $$(".cv__deck-l", cv).forEach((l, k) => l.style.setProperty("--li", k));
    void cv.offsetWidth;
    cv.classList.add("is-rising");
    const n = $$(".js-mast .k", cv).length;
    clearTimeout(cv._rt);
    cv._rt = setTimeout(() => cv.classList.remove("is-rising"), delay + 600 + n * 30 + 500);
  }

  async function go(i, { instant = false, commit = true } = {}) {
    i = (i + covers.length) % covers.length;
    if (commit && ap && ap.on) apStop("choice");                 /* a visitor who picks a cover keeps it */
    if (i === current) { if (commit) setURL(i); if (ap) apArm(true); return; }
    await load(i);
    const from = covers[current], to = covers[i];
    if (instant || reduced) {
      show(i);
      to.classList.remove("is-entering", "is-rising");
    } else {
      if (turning) { covers.forEach((c) => c.classList.remove("is-entering", "is-leaving")); }
      turning = true;
      to.hidden = false; to.inert = false;
      to.style.zIndex = 3; from.style.zIndex = 2;
      fitCover(to); hang(to);
      from.classList.add("is-leaving");
      to.classList.add("is-entering");
      rise(to, 180);
      clearTimeout(go._t);
      go._t = setTimeout(() => {                      /* finish on a timer, never on an animation callback */
        from.classList.remove("is-leaving");
        to.classList.remove("is-entering");
        to.style.zIndex = ""; from.style.zIndex = "";
        show(i);
        turning = false;
      }, 680);
    }
    current = i;
    selectTab(i);
    if (commit) setURL(i);
    preloadNeighbours(i);
    if (ap) apArm(true);
  }
  function setURL(i) {
    const u = new URL(location.href);
    if (i === 0) u.searchParams.delete("cover"); else u.searchParams.set("cover", names[i]);
    history.replaceState(history.state, "", u);
  }
  function preloadNeighbours() { /* covers 2 to 5 load only on intent (hover, focus, swipe toward); nothing is prefetched */ }

  /* tabs: hover (fine pointer) previews the cover instantly in a peek card and warms its assets;
     click commits with the page turn; arrows step */
  const peek = $(".pg-peek"), peekW = peek && $(".pg-peek__w", peek);
  const peekImg = peek && peek.insertBefore(Object.assign(document.createElement("img"), { alt: "", decoding: "async" }), peekW);
  const tabsEl = $(".pg-tabs");
  const fullPreview = Q.get("preview") === "cover";             /* fallback: hover swaps the whole cover */
  tabs.forEach((t) => {
    const i = +t.dataset.i;
    t.addEventListener("click", () => { committed = i; go(i); track("select_cover", { cover: names[i] }); hidePeek(); });
    t.addEventListener("focus", () => load(i));
    if (fine && fullPreview) {
      t.addEventListener("pointerenter", () => load(i).then(() => { if (t.matches(":hover") && i !== current) go(i, { instant: true, commit: false }); }));
    } else if (fine && peek) {
      t.addEventListener("pointerenter", () => {
        load(i);
        if (i === current) { hidePeek(); return; }
        peekImg.src = t.dataset.peek;
        peekW.textContent = $(".pg-tab__t", t).firstChild.textContent.trim();
        const tr = t.getBoundingClientRect(), br = tabsEl.getBoundingClientRect();
        peek.style.setProperty("--px", (tr.left - br.left) + "px");
        peek.classList.add("on");
      });
      t.addEventListener("pointerleave", hidePeek);
    }
  });
  function hidePeek() { if (peek) peek.classList.remove("on"); }
  let committed = current;
  if (fine && fullPreview) $(".pg-tabs__list").addEventListener("pointerleave", () => { if (current !== committed) go(committed, { instant: true, commit: false }); });
  $$(".pg-step[data-step]").forEach((b) => b.addEventListener("click", () => {   /* the play button is a .pg-step too: steps only */
    const i = current + (+b.dataset.step);
    committed = (i + covers.length) % covers.length;
    load(committed);
    go(committed);
  }));
  const coverEl = $("#cover");
  coverEl.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    if (e.target.closest("input, textarea")) return;
    e.preventDefault();
    const i = current + (e.key === "ArrowRight" ? 1 : -1);
    committed = (i + covers.length) % covers.length;
    if (e.target.closest(".pg-tab")) tabs[committed].focus();          /* focus follows the key at once; the page turn catches up */
    go(committed);
  });
  /* swipe on the cover photo (phone) */
  let sx = 0, sy = 0, swiping = false;
  coverEl.addEventListener("touchstart", (e) => {
    if (e.target.closest(".pg-tabs, a, button")) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; swiping = true;
  }, { passive: true });
  coverEl.addEventListener("touchmove", (e) => {
    if (!swiping) return;
    const dx = e.touches[0].clientX - sx;
    if (Math.abs(dx) > 12) load((current + (dx < 0 ? 1 : -1) + covers.length) % covers.length);
  }, { passive: true });
  coverEl.addEventListener("touchend", (e) => {
    if (!swiping) return; swiping = false;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      committed = (current + (dx < 0 ? 1 : -1) + covers.length) % covers.length;
      go(committed);
    }
  });

  /* ============================================================
     AUTOPLAY: the four commercial covers (01 to 04) advance on their own, every 6s.
     Any choice the visitor makes (tab, arrow, swipe, a shared ?cover= link) stops it
     for good; the play button starts it again. Holds (never lost): the tab bar or a
     cover button under the mouse, a finger on the cover, keyboard focus inside the
     cover, the tab hidden, the cover scrolled away, the intro, the lightbox. Reduced
     motion starts paused. The next cover warms halfway through, never at arrival
     (phone budget). Autoplay never rewrites the URL.
     ============================================================ */
  const tabsBox = $("#pgTabs"), playBtn = $("#pgPlay");
  const AP_MS = 6000, AUTO_N = 4;
  var ap = { on: !reduced && Q.get("autoplay") !== "0" && !Q.get("cover"), holds: new Set(), t: 0, w: 0, left: AP_MS, at: 0 };
  tabsBox.style.setProperty("--ap", AP_MS + "ms");
  const nextAuto = () => (current + 1 < AUTO_N ? current + 1 : 0);
  function apRender() {
    tabsBox.classList.toggle("is-auto", ap.on);
    tabsBox.classList.toggle("is-held", ap.on && ap.holds.size > 0);
    playBtn.classList.toggle("is-paused", !ap.on);
    playBtn.setAttribute("aria-label", ap.on ? "Pause the covers" : "Play the covers");
  }
  function apClear() { clearTimeout(ap.t); clearTimeout(ap.w); ap.t = 0; }
  function apArm(fresh) {
    apClear();
    if (fresh) { ap.left = AP_MS; tabsBox.classList.remove("is-auto"); void tabsBox.offsetWidth; }   /* restart the gold fill */
    apRender();
    if (!ap.on || ap.holds.size) return;
    ap.at = performance.now();
    const nx = nextAuto();
    ap.w = setTimeout(() => load(nx), Math.max(0, ap.left - 3000));
    ap.t = setTimeout(() => { ap.t = 0; committed = nx; go(nx, { commit: false }); }, Math.max(400, ap.left));
  }
  function apStop(why) { ap.on = false; apClear(); apRender(); track("cover_autoplay", { on: false, by: why }); }
  function hold(r) {
    if (ap.holds.has(r)) return;
    if (ap.t) { ap.left -= performance.now() - ap.at; apClear(); }
    ap.holds.add(r); apRender();
  }
  function release(r) { if (ap.holds.delete(r)) apArm(false); }
  playBtn.addEventListener("click", () => {
    if (ap.on) return apStop("pause");
    ap.on = true; apArm(true);
    track("cover_autoplay", { on: true });
  });
  coverEl.addEventListener("touchstart", () => hold("touch"), { passive: true });
  ["touchend", "touchcancel"].forEach((ev) => coverEl.addEventListener(ev, () => release("touch"), { passive: true }));
  if (fine) {
    [tabsBox, ...$$("[data-cover-acts]")].forEach((el) => {
      el.addEventListener("pointerenter", () => hold("point"));
      el.addEventListener("pointerleave", () => release("point"));
    });
  }
  coverEl.addEventListener("focusin", (e) => { if (e.target.matches(":focus-visible")) hold("focus"); });
  coverEl.addEventListener("focusout", (e) => { if (!coverEl.contains(e.relatedTarget)) release("focus"); });
  document.addEventListener("visibilitychange", () => (document.hidden ? hold("hidden") : release("hidden")));
  /* ratio, not isIntersecting: a sliver of cover still "intersects" */
  new IntersectionObserver(([e]) => (e.intersectionRatio >= .35 ? release("away") : hold("away")), { threshold: [0, .35] }).observe(coverEl);

  /* ============================================================
     DEPTH PARALLAX
     desktop: pointer moves type and subject in opposite directions (lerped)
     phone: on scroll the subject drifts up a little faster than the type
     ============================================================ */
  if (!reduced) {
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const apply = () => {
      cx += (tx - cx) * .08; cy += (ty - cy) * .08;
      const cv = covers[current];
      cv.style.setProperty("--tx", (cx * 14).toFixed(2) + "px");
      cv.style.setProperty("--ty", (cy * 14).toFixed(2) + "px");
      cv.style.setProperty("--sx", (-cx * 6).toFixed(2) + "px");
      cv.style.setProperty("--sy", (-cy * 6).toFixed(2) + "px");
      raf = (Math.abs(tx - cx) + Math.abs(ty - cy) > .001) ? requestAnimationFrame(apply) : 0;
    };
    if (fine) {
      coverEl.addEventListener("pointermove", (e) => {
        const r = coverEl.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - .5) * 2;
        ty = ((e.clientY - r.top) / r.height - .5) * 2;
        if (!raf) raf = requestAnimationFrame(apply);
      });
      coverEl.addEventListener("pointerleave", () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(apply); });
    }
    let sraf = 0;
    addEventListener("scroll", () => {
      if (!phoneMQ.matches || sraf) return;
      sraf = requestAnimationFrame(() => {
        sraf = 0;
        const h = coverEl.offsetHeight, y = Math.min(scrollY, h);
        const drift = -(y / h) * 24;                                  /* at most 24px, cover only */
        covers[current].style.setProperty("--sy", drift.toFixed(2) + "px");
      });
    }, { passive: true });
  }

  /* ============================================================
     INTRO: the cover flip, first visit per session, timers only
     ============================================================ */
  const intro = $("#intro");
  const wantIntro = intro && !reduced && !document.hidden && !store.get("tm-cover-intro") && !Q.get("cover") && Q.get("intro") !== "0";
  let introDone = !wantIntro;
  function endIntro() {
    if (introDone) return;
    introDone = true;
    intro.hidden = true;
    rise(covers[current], 0);
    release("intro");
  }
  if (wantIntro) {
    hold("intro");
    store.set("tm-cover-intro", "1");
    const frames = $$(".intro__f", intro);
    frames.forEach((f) => { const t = $("template", f); if (t) t.replaceWith(t.content.cloneNode(true)); });
    const ready = frames.map((f) => $("img", f).decode().catch(() => {}));
    intro.hidden = false;
    let k = 0;
    const step = () => {
      if (introDone) return;
      frames.forEach((f, n) => f.classList.toggle("on", n === k));
      k++;
      if (k <= frames.length) setTimeout(step, 140);
      else endIntro();
    };
    Promise.race([Promise.all(ready), new Promise((r) => setTimeout(r, 260))]).then(step);
    setTimeout(endIntro, 1300);                                       /* hard stop, never traps the page */
    intro.addEventListener("click", endIntro, { once: true });
    addEventListener("keydown", endIntro, { once: true });
    document.addEventListener("visibilitychange", () => { if (document.hidden) endIntro(); });
  }

  /* ============================================================
     CONTENTS: the floating cover thumbnail trails the cursor
     ============================================================ */
  const toc = $("#contents"), float = $(".pg-toc__float");
  if (toc && float && fine) {
    const fimg = float.appendChild(Object.assign(document.createElement("img"), { alt: "", decoding: "async" }));
    let fx = 0, fy = 0, px = 0, py = 0, fr = 0, on = false, raf = 0, zone = null, W = 180;
    const ink = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
    const tick = () => {
      px += (fx - px) * .16; py += (fy - py) * .16;
      fr += ((Math.max(-6, Math.min(6, (fx - px) * .08))) - fr) * .2;
      float.style.setProperty("--fx", px.toFixed(1) + "px");
      float.style.setProperty("--fy", py.toFixed(1) + "px");
      float.style.setProperty("--fr", fr.toFixed(2) + "deg");
      raf = on || Math.abs(fx - px) > .5 || Math.abs(fy - py) > .5 ? requestAnimationFrame(tick) : 0;
    };
    const place = (x) => {
      if (!zone) return;
      fx = Math.max(zone.L, Math.min(zone.R - W, x - W / 2));
      fy = Math.max(zone.T, Math.min(zone.B - W * 1.25, zone.cy - (W * 1.25) / 2));
    };
    $$(".pg-toc__row", toc).forEach((row) => {
      row.addEventListener("pointerenter", (e) => {
        /* the float lives in the empty band of its column: right of the longest name or line in the
           group, left of the widest price, and inside the group's rows (never over the label or the note) */
        const tr = toc.getBoundingClientRect(), rr = row.getBoundingClientRect();
        const rows = $$(".pg-toc__row", row.closest(".pg-toc__group"));
        const L = Math.max(...rows.flatMap((r) => [ink($(".pg-toc__name", r)).right, ink($(".pg-toc__desc", r)).right])) + 28 - tr.left;
        const R = Math.min(...rows.map((r) => ink($(".pg-toc__price", r)).left)) - 28 - tr.left;
        if (R - L < 120) { zone = null; float.classList.remove("on"); on = false; return; }   /* no room: the gold rule alone */
        W = Math.min(190, R - L);
        float.style.setProperty("--fw", W + "px");
        zone = { L, R, cy: rr.top + rr.height / 2 - tr.top, T: rows[0].getBoundingClientRect().top - tr.top + 6, B: rows[rows.length - 1].getBoundingClientRect().bottom - tr.top - 6 };
        if (fimg.getAttribute("src") !== row.dataset.thumb) fimg.src = row.dataset.thumb;
        const was = on;
        place(e.clientX - tr.left);
        if (!was) { px = fx; py = fy; }
        float.classList.add("on"); on = true;
        if (!raf) raf = requestAnimationFrame(tick);
      });
      row.addEventListener("pointerleave", () => { float.classList.remove("on"); on = false; });
    });
    toc.addEventListener("pointermove", (e) => place(e.clientX - toc.getBoundingClientRect().left));
  }

  /* ============================================================
     FEATURES: the mini-cover word slides up as the spread scrolls in
     (animation-timeline: view() where supported, IntersectionObserver otherwise)
     ============================================================ */
  if (!CSS.supports("animation-timeline: view()") && !reduced) {
    root.classList.add("no-vt");
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }), { threshold: .35 });
    $$(".pg-mini").forEach((m) => io.observe(m));
  }

  /* THE WORK: images settle from 1.03 to 1 as they enter (always painted) */
  const workIO = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("is-in"); workIO.unobserve(e.target); }
  }), { threshold: .15 });
  $$(".pg-feed__i").forEach((f) => workIO.observe(f));

  /* ============================================================
     MARQUEES · Magic UI Marquee (ported): the content group (.mq__g) is
     repeated (default 3) and every copy slides by its own width plus the gap.
     Copies are hidden from assistive tech and the tab order, and a click on
     a copy opens its original in the lightbox. Hover or focus holds a row.
     ============================================================ */
  /* strip photos load when their row comes within about a screen of view (native lazy loading
     does not hold inside a running marquee, and every row would load on arrival) */
  const fillRun = (run) => $$("img[data-src]", run).forEach((im) => { im.src = im.dataset.src; im.removeAttribute("data-src"); });
  const stripLoad = "IntersectionObserver" in window
    ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { fillRun(e.target); stripLoad.unobserve(e.target); } }), { rootMargin: "900px 0px" })
    : { observe: fillRun, unobserve() {} };
  const MQ_REPEAT = 3;
  $$("[data-run]").forEach((run) => {
    const group = $(".mq__g", run);
    for (let r = 1; r < MQ_REPEAT; r++) {
      const copy = group.cloneNode(true);
      copy.setAttribute("aria-hidden", "true");
      [...copy.children].forEach((el, k) => {
        el.setAttribute("data-dup", ""); el.dataset.orig = k;
        if (el.matches("a")) el.tabIndex = -1;
        $$("a", el).forEach((a) => { a.tabIndex = -1; });
      });
      run.appendChild(copy);
    }
    if (fine) {
      run.addEventListener("pointerenter", () => run.classList.add("is-held"));
      run.addEventListener("pointerleave", () => run.classList.remove("is-held"));
    }
    run.addEventListener("focusin", () => run.classList.add("is-held"));
    stripLoad.observe(run);
    run.addEventListener("focusout", (e) => { if (!run.contains(e.relatedTarget)) run.classList.remove("is-held"); });
  });

  /* ============================================================
     BLUR FADE · Magic UI Blur Fade (ported) for headings and copy as they
     scroll in (photos are never faded), and TEXT ANIMATE (blurInUp by
     character) for the back cover's word. Once each, 50px inside the view.
     ============================================================ */
  $$(".pg-toc__head > *, .pg-work__head > *, .pg-brands__l, .pg-back__copy").forEach((el) => el.classList.add("bf"));
  $$(".pg-feature__story").forEach((st) => [...st.children].filter((c) => !c.classList.contains("pg-strip")).forEach((c, i) => { c.classList.add("bf"); c.style.setProperty("--bfi", i); }));
  $$(".pg-toc__head, .pg-work__head").forEach((h) => [...h.children].forEach((c, i) => c.style.setProperty("--bfi", i)));
  const seen = (el, cls) => el.classList.add(cls);
  if ("IntersectionObserver" in window && !reduced) {
    const io2 = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      seen(e.target, e.target.hasAttribute("data-ta") ? "ta-in" : "bf-in");
      io2.unobserve(e.target);
    }), { rootMargin: "0px 0px -50px 0px" });
    $$(".bf, [data-ta]").forEach((el) => io2.observe(el));
  } else {
    $$(".bf").forEach((el) => seen(el, "bf-in")); $$("[data-ta]").forEach((el) => seen(el, "ta-in"));
  }

  /* ============================================================
     LIGHTBOX: keyboard, swipe, a history entry so back closes it
     ============================================================ */
  const lb = $("#lb");
  let group = [], idx = 0, opener = null, ours = false;
  const lbImg = Object.assign(document.createElement("img"), { className: "pg-lb__img", id: "lbImg", alt: "" });
  $("#lbSlot").replaceWith(lbImg);
  const lbCap = $("#lbCap"), lbDoor = $("#lbDoor"), lbCount = $("#lbCount");
  function paint(dir = 0) {
    const a = group[idx];
    const pic = $("img", a);
    lbImg.src = a.getAttribute("href");
    lbImg.alt = pic ? pic.alt : "";
    lbCap.textContent = a.dataset.cap || "";
    lbDoor.textContent = a.dataset.doorLabel || "Book this shoot";
    lbDoor.href = a.dataset.doorHref || "../book/";
    lbCount.textContent = `${idx + 1} / ${group.length}`;
    if (dir && !reduced) {
      lbImg.style.transition = "none";
      lbImg.style.transform = `translateX(${dir * 24}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => { lbImg.style.transition = ""; lbImg.style.transform = "none"; }));
    }
    [idx - 1, idx + 1].forEach((n) => { const g = group[(n + group.length) % group.length]; if (g) { const im = new Image(); im.src = g.getAttribute("href"); } });
  }
  function openLB(a) {
    group = $$(".shot:not([data-dup])", a.closest("[data-lb-group]"));
    opener = a;
    if (a.hasAttribute("data-dup")) a = group[+a.dataset.orig] || group[0];   /* a copy in a moving row opens its original */
    idx = group.indexOf(a);
    paint();
    lb.showModal();
    root.classList.add("lb-open");
    $(".pg-lb__x", lb).focus();                                       /* dialog ignores autofocus in some engines */
    history.pushState({ lb: 1 }, ""); ours = true;
    hold("lb");
    bar.update();
    track("lightbox_open", { category: a.dataset.cap || "" });
  }
  function closeLB(fromPop) {
    if (!lb.open) return;
    lb.close();
  }
  lb.addEventListener("close", () => {
    root.classList.remove("lb-open");
    release("lb");
    if (ours && history.state && history.state.lb) { ours = false; history.back(); }
    ours = false;
    if (opener) opener.focus();
    bar.update();
  });
  addEventListener("popstate", () => { if (lb.open) { ours = false; lb.close(); } });
  const step = (d) => { idx = (idx + d + group.length) % group.length; paint(d); };
  $(".pg-lb__x", lb).addEventListener("click", () => closeLB());
  $(".pg-lb__prev", lb).addEventListener("click", () => step(-1));
  $(".pg-lb__next", lb).addEventListener("click", () => step(1));
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
  });
  lb.addEventListener("click", (e) => { if (e.target === lb || e.target.classList.contains("pg-lb__stage")) closeLB(); });
  let lx = 0, ly = 0;
  lb.addEventListener("touchstart", (e) => { lx = e.touches[0].clientX; ly = e.touches[0].clientY; }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0], dx = t.clientX - lx, dy = t.clientY - ly;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  });
  $$("[data-lb-group] .shot").forEach((a) => a.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault(); openLB(a);
  }));

  /* ============================================================
     STICKY BAR (phone): section-aware, one gold button on screen
     ============================================================ */
  const DOORS = {
    campaigns: { title: "Commercial campaigns", sub: "Quote back within 1 business day", label: "Start a campaign", href: "../book/?service=product-photography&type=campaign" },
    beauty:    { title: "Beauty and med spas", sub: "Quote back within 1 business day", label: "Get a quote", href: "../book/?service=branding-photoshoot&type=beauty" },
    branding:  { title: "Branding shoots", sub: "Quote back within 1 business day", label: "Get a quote", href: "../book/?service=branding-photoshoot" },
    headshots: { title: "Headshots · $150 flat", sub: "Finals within 48h of your picks", label: "Book headshots", href: "../headshots/#book" },
  };
  const bar = (() => {
    const el = $("#pgBar");
    const title = $("[data-bar-title]", el), sub = $("[data-bar-sub]", el), link = $("[data-bar-link]", el);
    const hiders = $$("[data-bar-hide]").filter((s) => s.id !== "cover");
    const features = $$("article.pg-feature[data-door]");
    let door = el.dataset.defaultDoor, shown = false, raf = 0;
    const setDoor = (k) => {
      if (k === door) return;
      door = k; const d = DOORS[k] || DOORS[el.dataset.defaultDoor];
      const swap = () => { title.textContent = d.title; sub.textContent = d.sub; link.textContent = d.label; link.href = d.href; el.classList.remove("swap"); };
      if (reduced) swap(); else { el.classList.add("swap"); setTimeout(swap, 160); }
    };
    const compute = () => {
      raf = 0;
      const vh = innerHeight;
      const acts = $(".cv.is-active [data-cover-acts]");
      const coverGone = !acts || acts.getBoundingClientRect().bottom <= 0;
      const hidden = hiders.some((h) => {
        const r = h.getBoundingClientRect();
        const vis = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
        return vis >= vh * .25;
      });
      const menuOpen = nav && nav.classList.contains("open");
      const show = phoneMQ.matches && coverGone && !hidden && !menuOpen && !lb.open && vh >= 480;
      const mid = vh / 2;
      const f = features.find((s) => { const r = s.getBoundingClientRect(); return r.top <= mid && r.bottom >= mid; });
      setDoor(f ? f.dataset.door : el.dataset.defaultDoor);
      document.body.classList.toggle("has-bar", phoneMQ.matches);
      if (show === shown) return;
      shown = show;
      el.classList.toggle("on", show);
      el.inert = !show; el.setAttribute("aria-hidden", String(!show));
    };
    const update = () => { if (!raf) raf = requestAnimationFrame(compute); };
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    if (nav) new MutationObserver(update).observe(nav, { attributes: true, attributeFilter: ["class"] });
    link.addEventListener("click", () => track("select_door", { door, placement: "bar" }));
    update();
    return { update, state: () => ({ shown, door }) };
  })();

  /* magnetic gold buttons (desktop, fine pointer): pull up to 6px */
  if (fine && !reduced) {
    $$(".js-mag").forEach((b) => {
      b.addEventListener("pointermove", (e) => {
        const r = b.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        b.style.transform = `translate(${(dx * 6).toFixed(2)}px, ${(dy * 6).toFixed(2)}px)`;
      });
      b.addEventListener("pointerleave", () => { b.style.transform = ""; });
    });
  }
  $$("[data-door]").forEach((a) => { if (a.tagName === "A") a.addEventListener("click", () => {
    const [placement, door] = a.dataset.door.split(":"); track("select_door", { door, placement });
  }); });

  /* live "Next open" line: real availability, silent on failure */
  function nextOpen() {
    const el = $("[data-next-open]");
    if (!el || !window.TM || !window.TM.rpc) return;
    const tz = "America/Chicago";
    const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    window.TM.rpc("bk_open_slots", { p_service: el.dataset.service, p_from: ymd(new Date()), p_to: ymd(new Date(Date.now() + 21 * 864e5)) })
      .then((res) => {
        const iso = (res.slots || []).find((s) => new Date(s) > new Date());
        if (!iso) return;
        const d = new Date(iso);
        const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(d);
        const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
        $("b", el).textContent = `${day} · ${time} CT`;
        el.hidden = false;
      }).catch(() => {});
  }

  /* ============================================================
     BOOT
     ============================================================ */
  const boot = async () => {
    setNavH();
    if (current !== 0) await load(current);
    show(current); selectTab(current);
    setType();
    committed = current;
    if (introDone) rise(covers[current], 80);
    nextOpen();
    preloadNeighbours(current);
    root.classList.add("type-ready");
    apArm(true);
  };
  let rt = 0;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { setNavH(); setType(); }, 120); });
  /* canvas metrics need the actual faces, not the fallback: load each weight we measure before fitting */
  const FACES = ['900 100px "acumin-pro-extra-condensed"', '800 100px "acumin-pro-extra-condensed"', '700 100px "acumin-pro-extra-condensed"'];
  if (document.fonts && document.fonts.load) {
    Promise.race([
      Promise.all(FACES.map((f) => document.fonts.load(f, "PHOTOGRAPHS $150"))).then(() => document.fonts.ready),
      new Promise((r) => setTimeout(r, 3000)),
    ]).then(boot);
  } else addEventListener("load", boot);
  window.__cover = { go: (n) => go(names.indexOf(n)), current: () => names[current], bar: () => bar.state(), ap: () => ({ on: ap.on, holds: [...ap.holds], left: ap.left }) };
})();
