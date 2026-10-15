/* TAYLORMADE/CREATIVE · web design
   The hero line-up (one live site changing on a laptop, an iPad and an iPhone together),
   the morph (one window becomes a tablet, then a phone, with the scroll), the cases
   (a browser and a phone rise in and play the real site), the bento's live parts and
   the platform tabs. home.js runs the shared fades, word reveals, progress line and
   manifesto; site.js runs the nav, footer and newsletter. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const track = (name, params) => { try { window.gtag?.("event", name, params); } catch (_) {} };
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';

  /* a screen with two image layers: load the next picture on the hidden one, then crossfade */
  function swapLayer(screen, set) {
    const imgs = $$(":scope > img", screen);
    const on = imgs.find((im) => im.classList.contains("is-on")) || imgs[0];
    const next = imgs.find((im) => im !== on);
    if (!next) return Promise.resolve();
    if (set.srcset) next.srcset = set.srcset; else next.removeAttribute("srcset");
    if (set.sizes) next.sizes = set.sizes;
    next.src = set.src;
    const ready = next.decode ? next.decode().catch(() => {}) : Promise.resolve();
    return ready.then(() => {
      next.alt = set.alt || "";
      on.alt = "";
      next.classList.add("is-on");
      on.classList.remove("is-on");
    });
  }
  // tabithabrown.com captures: tab-{d|t|m}-{n}.webp (+ a 720 wide desktop)
  const TAB_NAMES = ["About Me", "Tab + Chance", "Body Mist", "Donna's Recipe", "Books", "Clearance Merch", "Tab Time", "Events"];
  const tabSet = (base, kind, n, sizes) => {
    if (kind === "d") return { src: `${base}tab-d-${n}-720.webp`, srcset: `${base}tab-d-${n}-720.webp 720w, ${base}tab-d-${n}.webp 1280w`, sizes, alt: `Tabitha Brown website: the ${TAB_NAMES[n]} page` };
    if (kind === "m") return { src: `${base}tab-m-${n}.webp`, srcset: `${base}tab-m-${n}-240.webp 240w, ${base}tab-m-${n}.webp 400w`, sizes };
    return { src: `${base}tab-${kind}-${n}.webp` };
  };
  const baseOf = (img) => (img.getAttribute("src") || "").replace(/tab-[dtm]-\d+(-720)?\.webp.*$/, "");

  /* ---------- HERO · the line-up ---------- */
  const stage = $("[data-stage]");
  if (stage) {
    const screens = { d: $('[data-screen="d"]', stage), t: $('[data-screen="t"]', stage), m: $('[data-screen="m"]', stage) };
    const base = baseOf($("img", screens.d));
    const sizes = $("img", screens.d).getAttribute("sizes");
    const mSizes = $("img", screens.m).getAttribute("sizes");
    const pills = $$(".hm-pill", stage);
    const pauseBtn = $("[data-stage-pause]", stage);
    const nameEl = $("[data-stage-name]", stage);
    const DUR = 3800;
    const padOn = matchMedia("(min-width: 700px)");   // the iPad shows from 700px; phones never fetch its pictures
    const kinds = () => (padOn.matches ? ["d", "t", "m"] : ["d", "m"]);
    let cur = 0, playing = !reduced, acc = 0, t0 = 0, ticking = false, busy = false;
    const holds = new Set(["intro", "offscreen"]);
    const running = () => playing && !holds.size;
    const elapsed = () => acc + (running() ? performance.now() - t0 : 0);
    const preload = (n) => kinds().forEach((k) => { const s = tabSet(base, k, n, k === "m" ? mSizes : sizes); const im = new Image(); if (s.srcset) { im.sizes = s.sizes; im.srcset = s.srcset; } im.src = s.src; });
    const ui = () => {
      stage.classList.toggle("is-paused", !playing);
      pauseBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      pauseBtn.setAttribute("aria-label", playing ? "Pause the slideshow" : "Play the slideshow");
      pills.forEach((p, k) => p.style.setProperty("--p", k === cur && !playing ? "1" : k === cur ? p.style.getPropertyValue("--p") || "0" : "0"));
    };
    function go(n, user = false) {
      n = (n + TAB_NAMES.length) % TAB_NAMES.length;
      if (user && playing) { playing = false; }
      if (n === cur && !user) return;
      cur = n;
      pills.forEach((p, k) => { p.style.setProperty("--p", "0"); k === n ? p.setAttribute("aria-current", "true") : p.removeAttribute("aria-current"); });
      nameEl.textContent = TAB_NAMES[n];
      nameEl.classList.remove("is-swap"); void nameEl.offsetWidth; nameEl.classList.add("is-swap");
      // the laptop first, then the iPad, then the phone: a wave across the line-up
      kinds().forEach((k, i) => setTimeout(() => swapLayer(screens[k], tabSet(base, k, n, k === "m" ? mSizes : sizes)), reduced ? 0 : i * 120));
      preload((n + 1) % TAB_NAMES.length);
      acc = 0; t0 = performance.now();
      ui(); tick();
    }
    function tick() {
      if (ticking) return;
      ticking = true;
      const f = () => {
        const p = clamp(elapsed() / DUR);
        pills[cur].style.setProperty("--p", playing ? p.toFixed(4) : "1");
        if (running() && p >= 1) go(cur + 1);
        if (running()) requestAnimationFrame(f); else ticking = false;
      };
      requestAnimationFrame(f);
    }
    const hold = (why) => { if (holds.has(why)) return; acc = elapsed(); holds.add(why); };
    const release = (why) => { if (!holds.delete(why)) return; t0 = performance.now(); if (running()) tick(); };
    pills.forEach((p, k) => p.addEventListener("click", () => { go(k, true); track("web_hero_slide", { slide: TAB_NAMES[k] }); }));
    $(".hm-bb__pills", stage).addEventListener("keydown", (e) => {
      const k = { ArrowRight: cur + 1, ArrowLeft: cur - 1, Home: 0, End: TAB_NAMES.length - 1 }[e.key];
      if (k === undefined) return;
      e.preventDefault(); go(k, true); pills[cur].focus();
    });
    // the screenshots carry Tabitha's own arrows: the laptop screen answers them
    screens.d.addEventListener("click", (e) => {
      const r = screens.d.getBoundingClientRect();
      go(e.clientX < r.left + r.width / 2 ? cur - 1 : cur + 1, true);
      track("web_hero_slide", { slide: TAB_NAMES[cur], how: "screen" });
    });
    // a window widened past 700px: the iPad catches up with the slide on screen
    padOn.addEventListener?.("change", () => { if (padOn.matches) swapLayer(screens.t, tabSet(base, "t", cur)); });
    pauseBtn.addEventListener("click", () => { playing = !playing; if (playing) { acc = 0; t0 = performance.now(); } ui(); if (playing) tick(); });
    new IntersectionObserver(([e]) => (e.isIntersecting ? release("offscreen") : hold("offscreen")), { threshold: 0.25 }).observe(stage);
    document.addEventListener("visibilitychange", () => (document.hidden ? hold("tabhidden") : release("tabhidden")));
    stage.addEventListener("focusin", (e) => { if (e.target.matches(":focus-visible") && !e.target.closest(".wd-stage__ctrl")) hold("focus"); });
    stage.addEventListener("focusout", (e) => { if (!stage.contains(e.relatedTarget)) release("focus"); });
    // the first change waits for the line-up to rise and the screens to come on
    preload(1);
    setTimeout(() => release("intro"), reduced ? 0 : 2600);
    ui();

    // desktop: the iPad and the iPhone ease apart as the page starts to move
    const spread = matchMedia("(min-width: 1000px)");
    if (!reduced) {
      const devs = { pad: $(".wd-dev--pad", stage), mac: $(".wd-dev--mac", stage), phone: $(".wd-dev--phone", stage) };
      let sTick = false;
      const paint = () => {
        sTick = false;
        if (!spread.matches) { Object.values(devs).forEach((d) => d.style.cssText = d.style.cssText.replace(/--s[xys]:[^;]+;?/g, "")); return; }
        const hp = clamp(scrollY / (innerHeight * 0.9));
        const w = stage.clientWidth;
        devs.pad.style.setProperty("--sx", `${(-hp * w * 0.03).toFixed(1)}px`);
        devs.pad.style.setProperty("--sy", `${(hp * 10).toFixed(1)}px`);
        devs.phone.style.setProperty("--sx", `${(hp * w * 0.03).toFixed(1)}px`);
        devs.phone.style.setProperty("--sy", `${(hp * 16).toFixed(1)}px`);
        devs.mac.style.setProperty("--ss", (1 + hp * 0.035).toFixed(4));
      };
      addEventListener("scroll", () => { if (!sTick && scrollY < innerHeight * 1.4) { sTick = true; requestAnimationFrame(paint); } }, { passive: true });
      addEventListener("resize", paint, { passive: true });
    }
  }

  /* ---------- MORPH · one window becomes a tablet, then a phone ---------- */
  const mTrack = $("[data-morph]");
  if (mTrack) {
    const dev = $("[data-morph-dev]", mTrack);
    const mStage = $(".wd-morph__stage", mTrack);
    const steps = $$(".wd-morph__steps li", mTrack);
    const pxEl = $("[data-px]", mTrack);
    const mq = matchMedia("(min-width: 1000px) and (min-height: 600px)");
    let live = false, geo = null, mTick = false, lastStep = -1;
    const BAR = 30;
    const imgs = { d: $(".is-d", dev), t: $(".is-t", dev), m: $(".is-m", dev) };
    const island = $(".wd-morph__island", dev);
    let W0 = 0, H0 = 0;
    // the frame is one fixed box; only its clip and the pictures' transforms change while scrolling (no layout shift)
    const measure = () => {
      W0 = mStage.clientWidth; H0 = Math.max(200, mStage.clientHeight - 40);
      dev.style.setProperty("--W0", `${W0}px`); dev.style.setProperty("--H0", `${H0}px`);
      const sh = H0;
      let wd = Math.min(W0, 1000), hd = wd * 0.625 + BAR;
      if (hd > sh) { hd = sh; wd = (sh - BAR) / 0.625; }
      const bt = 14, ht = Math.min(sh, 780), wt = (ht - 2 * bt) * (834 / 1194) + 2 * bt;
      const bp = 11, hph = Math.min(sh, 700), wp = (hph - 2 * bp) * (390 / 844) + 2 * bp;
      // the phone gets a status bar strip at the top, as Safari on an iPhone does
      geo = { d: { w: wd, h: hd, r: 12, b: 2, bar: BAR, sr: 10, st: 0 }, t: { w: wt, h: ht, r: 34, b: bt, bar: 0, sr: 20, st: 0 }, m: { w: wp, h: hph, r: 54, b: bp, bar: 0, sr: 43, st: (wp - 2 * bp) * 0.134 } };
    };
    const seg = (p, a, b) => ease(clamp((p - a) / (b - a)));
    const apply = (p) => {
      const e1 = seg(p, 0.16, 0.42), e2 = seg(p, 0.56, 0.82);
      const A = geo.d, B = geo.t, C = geo.m;
      const mix = (k) => (e2 > 0 ? lerp(B[k], C[k], e2) : lerp(A[k], B[k], e1));
      const w = mix("w"), h = mix("h"), r = mix("r"), b = mix("b"), bar = mix("bar"), sr = mix("sr"), st = mix("st");
      const ct = (H0 - h) / 2, cl = (W0 - w) / 2;
      const set = (k, v) => dev.style.setProperty(k, v);
      set("--ct", `${ct.toFixed(1)}px`); set("--cb", `${ct.toFixed(1)}px`); set("--cl", `${cl.toFixed(1)}px`); set("--cr", `${cl.toFixed(1)}px`);
      set("--r", `${r.toFixed(1)}px`); set("--b", `${b.toFixed(1)}px`); set("--sr", `${sr.toFixed(1)}px`);
      set("--barO", clamp(1 - e1 * 2.2).toFixed(3));
      // each layout hands over in a short window, so two layouts are never on screen together for long
      const fT = clamp((e1 - 0.42) / 0.16), fM = clamp((e2 - 0.42) / 0.16);
      set("--oD", (1 - fT).toFixed(3)); set("--oT", (fT * (1 - fM)).toFixed(3)); set("--oM", fM.toFixed(3));
      set("--isl", clamp((e2 - 0.55) / 0.3).toFixed(3));
      set("--ix", `${(cl + w / 2 - 46).toFixed(1)}px`); set("--iy", `${(ct + b + 9).toFixed(1)}px`);
      // every layout covers the screen below the browser bar (desktop) or the status bar (phone), pinned to its top
      const x0 = cl + b, y0 = ct + b + bar + st, aw = w - 2 * b, ah = h - 2 * b - bar - st;
      for (const im of Object.values(imgs)) {
        const ratio = (+im.getAttribute("height")) / (+im.getAttribute("width"));
        const sc = Math.max(aw / W0, ah / (W0 * ratio));
        im.style.transform = `translate(${(x0 + (aw - W0 * sc) / 2).toFixed(1)}px, ${y0.toFixed(1)}px) scale(${sc.toFixed(4)})`;
      }
      $(".wd-morph__px", mTrack).style.setProperty("--py", `${(ct + h + 12).toFixed(1)}px`);
      const px = e2 > 0 ? lerp(834, 390, e2) : lerp(1440, 834, e1);
      pxEl.textContent = Math.round(px).toLocaleString("en-US");
      const step = p < 0.29 ? 0 : p < 0.69 ? 1 : 2;
      if (step !== lastStep) { lastStep = step; steps.forEach((li, k) => li.classList.toggle("is-on", k === step)); }
    };
    const progress = () => {
      const r = mTrack.getBoundingClientRect();
      const span = r.height - innerHeight;
      return span > 0 ? clamp(-r.top / span) : 0;
    };
    const paint = () => { mTick = false; if (live) apply(progress()); };
    const setup = () => {
      const want = mq.matches && !reduced;
      if (want !== live) {
        live = want;
        mTrack.classList.toggle("is-live", live);
        if (!live) { dev.removeAttribute("style"); Object.values(imgs).forEach((im) => im.style.removeProperty("transform")); steps.forEach((li, k) => li.classList.toggle("is-on", k === 0)); lastStep = -1; }
      }
      if (live) { measure(); paint(); }
    };
    setup();
    addEventListener("scroll", () => { if (live && !mTick) { mTick = true; requestAnimationFrame(paint); } }, { passive: true });
    addEventListener("resize", setup, { passive: true });
    if (mq.addEventListener) mq.addEventListener("change", setup);
    // the pictures in the frame are lazy: fetch them before the frame scrolls in
    new IntersectionObserver(([e]) => { if (e.isIntersecting) $$("img", dev).forEach((im) => { im.loading = "eager"; }); }, { rootMargin: "120% 0px" }).observe(mTrack);
  }

  /* ---------- CASES · rise in with the scroll, then play the real site ---------- */
  const duos = $$("[data-duo]");
  const duoPlayers = new Map();
  if (duos.length) {
    const near = new Set();
    let dTick = false;
    const paintRise = () => {
      dTick = false;
      const list = [...near], tops = list.map((d) => d.getBoundingClientRect().top);
      list.forEach((d, i) => d.style.setProperty("--e", clamp((innerHeight - tops[i]) / (innerHeight * 0.6)).toFixed(3)));
    };
    if (!reduced) {
      // a case already scrolled past (a jump to #pricing, a reload mid-page) stays fully in place
      const riseIO = new IntersectionObserver((es) => {
        es.forEach((en) => {
          if (en.isIntersecting) near.add(en.target);
          else { near.delete(en.target); en.target.style.setProperty("--e", en.boundingClientRect.top < 0 ? "1" : "0"); }
        });
        // a jump straight to a case (no scrolling after) still brings it in
        if (!dTick) { dTick = true; requestAnimationFrame(paintRise); }
      }, { rootMargin: "10% 0px" });
      duos.forEach((d) => { d.style.setProperty("--e", "0"); riseIO.observe(d); });
      addEventListener("scroll", () => { if (!dTick) { dTick = true; requestAnimationFrame(paintRise); } }, { passive: true });
      addEventListener("resize", paintRise, { passive: true });
      requestAnimationFrame(paintRise);
    }

    // the site plays: down slowly, a beat, back up; the browser and the phone together.
    // Two passes, then it rests (the button plays it again). The pointer over a screen holds it.
    // layout sizes, not the on-screen box: the browser is tilted while it rises in
    const travel = (img) => Math.max(0, img.offsetHeight - img.parentElement.clientHeight);
    const moveTo = (img, y, ms) => { img.style.setProperty("--dur", `${ms}ms`); img.style.setProperty("--y", `${-y}px`); };
    const nowY = (img) => -new DOMMatrix(getComputedStyle(img).transform).m42;
    const PASSES = 2;
    function player(d) {
      const shots = $$(".mu-scroll", d);
      const slides = d.dataset.slides ? d.dataset.slides.split(",").map(Number) : null;
      const btn = $("[data-duo-ctl]", d);
      const name = btn.getAttribute("aria-label").replace(/^Pause the (.*) preview$/, "$1");
      let timer = 0, running = false, mode = "down", si = 0, passes = 0, steps = 0, userPaused = reduced, visible = false;
      const holds = new Set();
      const done = () => passes >= PASSES;
      const playing = () => !userPaused && !done();
      const ui = () => {
        const p = playing();
        btn.innerHTML = p ? ICON_PAUSE : ICON_PLAY;
        btn.setAttribute("aria-label", `${p ? "Pause" : "Play"} the ${name} preview`);
      };
      const halt = (home) => {
        running = false; clearTimeout(timer);
        if (home) { mode = "down"; shots.forEach((im) => moveTo(im, 0, 600)); }
        else shots.forEach((im) => moveTo(im, nowY(im), 0));
      };
      const stepScroll = () => {
        if (!running) return;
        if (mode === "down") {
          const far = Math.max(...shots.map(travel)) * 0.92;
          const left = 1 - clamp(nowY(shots[0]) / Math.max(1, travel(shots[0]) * 0.92));
          const ms = Math.max(400, clamp(far * 3.2, 7000, 14000) * left);
          shots.forEach((im) => moveTo(im, travel(im) * 0.92, ms));
          timer = setTimeout(() => { mode = "up"; stepScroll(); }, ms + 1600);
        } else {
          shots.forEach((im) => moveTo(im, 0, 1700));
          timer = setTimeout(() => { mode = "down"; passes++; if (done()) { running = false; ui(); } else stepScroll(); }, 1700 + 1100);
        }
      };
      const stepSlides = () => {
        timer = setTimeout(() => {
          if (!running) return;
          si = (si + 1) % slides.length; steps++;
          const n = slides[si];
          const [bScreen, pScreen] = $$(".wd-screen", d);
          const bImg = $("img", bScreen);
          const base = baseOf(bImg);
          swapLayer(bScreen, tabSet(base, "d", n, bImg.getAttribute("sizes")));
          setTimeout(() => swapLayer(pScreen, tabSet(base, "m", n, $("img", pScreen).getAttribute("sizes"))), 140);
          if (steps >= slides.length * PASSES) { passes = PASSES; running = false; ui(); return; }
          stepSlides();
        }, 2900);
      };
      const run = () => {
        ui();
        if (running || !visible || holds.size || document.hidden || !playing()) return;
        running = true;
        if (slides) stepSlides(); else timer = setTimeout(stepScroll, 500);
      };
      btn.addEventListener("click", () => {
        if (playing()) { userPaused = true; halt(false); }
        else { userPaused = false; if (done()) { passes = 0; steps = 0; } }
        run();
        track("web_case_preview", { site: name, action: userPaused ? "pause" : "play" });
      });
      if (!slides) $$(".wd-duo__browser, .wd-duo__phone", d).forEach((el) => {
        el.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { holds.add("hover"); if (running) halt(false); } });
        el.addEventListener("pointerleave", () => { if (holds.delete("hover")) run(); });
      });
      ui();
      return {
        setPaused(v) { userPaused = v || reduced; if (userPaused) { if (running) halt(false); } else if (done()) { passes = 0; steps = 0; } run(); },
        enter() { visible = true; run(); },
        leave() { visible = false; halt(true); if (!userPaused) { passes = 0; steps = 0; } ui(); },
        tab() { if (document.hidden) { if (running) halt(false); } else run(); },
      };
    }
    const players = duoPlayers;
    duos.forEach((d) => players.set(d, player(d)));
    const playIO = new IntersectionObserver((es) => es.forEach((en) => {
      const pl = players.get(en.target);
      en.isIntersecting ? pl.enter() : pl.leave();
    }), { threshold: 0.45 });
    duos.forEach((d) => playIO.observe(d));
    // back from another tab: whatever is on screen picks up again
    document.addEventListener("visibilitychange", () => players.forEach((pl) => pl.tab()));
  }

  /* ---------- THE WORK · one stage: pick a site, the devices switch; with a mouse it tours by itself until touched ----------
     The names are tabs; every write-up shares one slot, so a switch never moves the rest of the page. */
  const show = $("[data-show]");
  if (show) {
    const btns = $$('[role="tab"]', show), bodies = $$(".wd-show__body", show), panels = $$("[data-show-panel]", show);
    const STEP = 14000;
    let cur = 0, auto = !reduced && matchMedia("(hover: hover) and (pointer: fine)").matches, t0 = 0, acc = 0, ticking = false;
    const holds = new Set(["offscreen"]);
    const running = () => auto && !holds.size;
    const elapsed = () => acc + (running() ? performance.now() - t0 : 0);
    function go(i, user = false) {
      i = (i + btns.length) % btns.length;
      if (user) { auto = false; show.classList.add("is-held"); }
      if (i === cur) return;
      btns.forEach((b, k) => { const on = k === i; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; b.style.removeProperty("--p"); });
      bodies.forEach((bd, k) => bd.classList.toggle("is-on", k === i));
      panels.forEach((pn, k) => pn.classList.toggle("is-on", k === i));
      cur = i; acc = 0; t0 = performance.now();
      // phones: keep the picked name in view inside its row
      const row = btns[i].parentElement;
      if (row.scrollWidth > row.clientWidth) row.scrollTo({ left: btns[i].offsetLeft - 16, behavior: reduced ? "auto" : "smooth" });
      tick();
    }
    function tick() {
      if (ticking || !running()) return;
      ticking = true;
      const f = () => {
        const p = clamp(elapsed() / STEP);
        btns[cur].style.setProperty("--p", p.toFixed(4));
        if (p >= 1) go(cur + 1);
        if (running()) requestAnimationFrame(f); else ticking = false;
      };
      requestAnimationFrame(f);
    }
    const hold = (why) => { if (holds.has(why)) return; acc = elapsed(); holds.add(why); };
    const release = (why) => { if (!holds.delete(why)) return; t0 = performance.now(); tick(); };
    btns.forEach((b, k) => b.addEventListener("click", () => { go(k, true); track("web_work_pick", { site: $(".wd-show__n", b).textContent }); }));
    $(".wd-show__tabs", show).addEventListener("keydown", (e) => {
      const k = btns.indexOf(document.activeElement);
      if (k < 0) return;
      const n = { ArrowDown: k + 1, ArrowRight: k + 1, ArrowUp: k - 1, ArrowLeft: k - 1, Home: 0, End: btns.length - 1 }[e.key];
      if (n === undefined) return;
      e.preventDefault(); go(n, true); btns[(n + btns.length) % btns.length].focus();
    });
    // the pointer over the list or the devices holds the clock, so nothing moves while someone is reading
    show.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hold("hover"); });
    show.addEventListener("pointerleave", () => release("hover"));
    show.addEventListener("focusin", () => hold("focus"));
    show.addEventListener("focusout", (e) => { if (!show.contains(e.relatedTarget)) release("focus"); });
    new IntersectionObserver(([e]) => (e.isIntersecting ? release("offscreen") : hold("offscreen")), { threshold: 0.35 }).observe(show);
    document.addEventListener("visibilitychange", () => (document.hidden ? hold("tab") : release("tab")));
    if (!auto) show.classList.add("is-held");
    // one button for everything that moves here: the tour and the site playing in the devices
    const pauseBtn = $("[data-show-pause]", show);
    let still = reduced;
    const paintPause = () => {
      pauseBtn.innerHTML = still ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10.5-6.5z"/></svg><span>Play</span>' : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg><span>Pause</span>';
      pauseBtn.setAttribute("aria-label", still ? "Play the previews" : "Pause the previews");
    };
    pauseBtn.addEventListener("click", () => {
      still = !still;
      show.classList.toggle("is-held", still || !auto);
      if (still) hold("user"); else release("user");
      panels.forEach((pn) => { const d = $("[data-duo]", pn); duoPlayers.get(d)?.setPaused(still); });
      paintPause();
      track("web_work_pause", { paused: still });
    });
    paintPause();
    // "Sitting Pretty Rashae's" in a feature caption opens that site here
    const order = btns.map((b) => b.id.replace(/^show-|-btn$/g, ""));
    $$("[data-show-go]").forEach((a) => a.addEventListener("click", (e) => {
      const k = order.indexOf(a.dataset.showGo);
      if (k < 0) return;
      e.preventDefault();
      go(k, true);
      document.getElementById("work").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    }));
  }

  /* ---------- MORE SITES · the arrows page the row ---------- */
  const strip = $("[data-strip-row]");
  if (strip) $$("[data-strip]").forEach((b) => b.addEventListener("click", () => {
    strip.scrollBy({ left: Number(b.dataset.strip) * strip.clientWidth * 0.8, behavior: reduced ? "auto" : "smooth" });
  }));

  /* ---------- BENTO · phones: chips above the swipe row jump to a card and follow the swipe ---------- */
  const bchips = $$(".wd-bchips button");
  const bentoRow = $("[data-bento]");
  if (bchips.length && bentoRow) {
    const card = (k) => $(".wd-b--" + k, bentoRow);
    const mark = (k) => bchips.forEach((c) => c.setAttribute("aria-pressed", c.dataset.b === k ? "true" : "false"));
    bchips.forEach((c) => c.addEventListener("click", () => {
      const el = card(c.dataset.b);
      if (!el) return;
      bentoRow.scrollTo({ left: el.offsetLeft - bentoRow.offsetLeft - parseFloat(getComputedStyle(bentoRow).paddingLeft || 0), behavior: reduced ? "auto" : "smooth" });
      mark(c.dataset.b);
    }));
    const seen = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting && e.intersectionRatio > 0.6) mark([...e.target.classList].find((x) => x.startsWith("wd-b--")).slice(6));
    }), { root: bentoRow, threshold: [0.6] });
    $$(".wd-b", bentoRow).forEach((el) => seen.observe(el));
  }

  /* ---------- BENTO · each part plays once when it comes into view; the pointer on a card plays it again ---------- */
  const bento = $("[data-bento]");
  if (bento && !reduced) {
    new IntersectionObserver(([e]) => bento.classList.toggle("is-play", e.isIntersecting), { threshold: 0.3 }).observe(bento);
    $$(".wd-b", bento).forEach((card) => card.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse" || !bento.classList.contains("is-play") || !card.getAnimations) return;
      card.getAnimations({ subtree: true }).forEach((a) => { if (a.playState === "finished") { a.cancel(); a.play(); } });
    }));
  }

  /* ---------- PLATFORMS · five cards (a tablist); the chosen one's detail opens below ----------
     The hero's "Where's your site now?" chips and links like #platforms-squarespace open the matching card. */
  const plat = $("[data-plat]");
  if (plat) {
    const tabs = $$('[role="tab"]', plat);
    const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
    const ids = tabs.map((t) => t.id.replace(/^tab-/, ""));
    const select = (i, focus = false) => {
      tabs.forEach((t, k) => { const on = k === i; t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1; panels[k].hidden = !on; panels[k].classList.remove("is-in"); });
      void panels[i].offsetWidth; panels[i].classList.add("is-in");
      if (focus) tabs[i].focus();
    };
    tabs.forEach((t, i) => t.addEventListener("click", () => { select(i); track("web_platform_tab", { platform: ids[i] }); }));
    $(".wd-pick", plat).addEventListener("keydown", (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const k = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (k === undefined) return;
      e.preventDefault(); select((k + tabs.length) % tabs.length, true);
    });
    const open = (id, how) => {
      const i = ids.indexOf(id);
      if (i < 0) return false;
      select(i);
      // keyboard users continue from the card they picked; phones land on its detail, desktops on the row of cards
      tabs[i].focus({ preventScroll: true });
      const target = matchMedia("(max-width: 699px)").matches ? panels[i] : $(".wd-pick", plat);
      target.scrollIntoView({ block: "start", behavior: reduced || how === "load" ? "auto" : "smooth" });
      track("web_platform_tab", { platform: id, how });
      return true;
    };
    $$("[data-plat-go]").forEach((a) => a.addEventListener("click", (e) => { if (open(a.dataset.platGo, "hero")) { e.preventDefault(); history.replaceState(null, "", "#platforms-" + a.dataset.platGo); } }));
    const fromHash = () => { const m = location.hash.match(/^#platforms-([a-z]+)$/); if (m) open(m[1], "load"); };
    fromHash();
    addEventListener("hashchange", fromHash);
  }

  /* ---------- PHONES · a quote button stays in reach between the hero and the closing call ---------- */
  const qbar = $("[data-qbar]");
  if (qbar && matchMedia("(max-width: 699px)").matches) {
    qbar.hidden = false;
    const seen = { hero: true, end: false };
    // off screen it is inert, so keyboards and screen readers only meet it while it is showing
    const paint = () => { const on = !seen.hero && !seen.end; qbar.classList.toggle("is-on", on); qbar.inert = !on; };
    new IntersectionObserver(([e]) => { seen.hero = e.isIntersecting; paint(); }).observe($(".wd-hero"));
    const ends = [$(".hm-cta"), $(".footer")].filter(Boolean);
    const vis = new Set();
    const endIO = new IntersectionObserver((es) => { es.forEach((e) => (e.isIntersecting ? vis.add(e.target) : vis.delete(e.target))); seen.end = vis.size > 0; paint(); });
    ends.forEach((el) => endIO.observe(el));
  }
})();
