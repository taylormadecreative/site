/* TAYLORMADE/CREATIVE · home
   Magic UI ports (Scroll Progress, Text Animate, Blur Fade, Marquee, Safari + iPhone
   screen scroll, Text Reveal), the featured-film billboard, the theater, the film
   shelves, the web chapter's site switcher, the reels, GSAP card stacking for the four
   chapters, and the reviews carousel.
   Shared nav, film facades, newsletter and year stay in site.js. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const saveData = !!navigator.connection?.saveData;
  const track = (name, params) => { try { window.gtag?.("event", name, params); } catch (_) {} };

  root.classList.add("hm-ready");

  /* ---------- Magic UI Scroll Progress ---------- */
  const bar = $(".hm-progress span");
  let progTick = false;
  const setProg = () => {
    progTick = false;
    const h = root.scrollHeight - innerHeight;
    bar?.style.setProperty("--p", h > 0 ? Math.min(1, Math.max(0, scrollY / h)).toFixed(4) : "0");
  };
  addEventListener("scroll", () => { if (!progTick) { progTick = true; requestAnimationFrame(setProg); } }, { passive: true });
  addEventListener("resize", setProg, { passive: true });
  setProg();

  /* ---------- Magic UI Text Animate (blurInUp, by word) + Blur Fade ---------- */
  $$("[data-words]").forEach((el) => {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = "";
    words.forEach((w, i) => {
      const s = document.createElement("span");
      s.className = "w"; s.style.setProperty("--i", i); s.textContent = w;
      el.append(s);
      if (i < words.length - 1) el.append(" ");
    });
  });
  // stagger siblings that fade together
  $$("[data-fade]").forEach((el) => {
    const sibs = [...el.parentElement.children].filter((c) => c.hasAttribute("data-fade"));
    if (!el.style.getPropertyValue("--i")) el.style.setProperty("--i", sibs.indexOf(el));
  });
  const fadeIO = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); fadeIO.unobserve(e.target); } });
  }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
  $$("[data-fade], [data-words]").forEach((el) => fadeIO.observe(el));

  /* ---------- Magic UI Marquee: repeat the group so the row never shows a seam ---------- */
  $$("[data-mq]").forEach((row) => {
    const g = $(".mq__g", row);
    if (!g) return;
    for (let k = 0; k < 2; k++) {
      const c = g.cloneNode(true);
      c.setAttribute("aria-hidden", "true"); c.dataset.dup = "";
      row.append(c);
    }
    row.addEventListener("focusin", () => row.classList.add("is-held"));
    row.addEventListener("focusout", () => row.classList.remove("is-held"));
    // rest while off screen
    new IntersectionObserver(([e]) => row.classList.toggle("is-held", !e.isIntersecting)).observe(row);
  });
  $$("[data-mq-toggle]").forEach((btn) => {
    const row = $("[data-mq]", btn.closest("section"));
    btn.addEventListener("click", () => {
      const stop = !row.classList.contains("is-stopped");
      row.classList.toggle("is-stopped", stop);
      const what = btn.dataset.mqName || "client names";
      btn.textContent = stop ? "Play" : "Pause";
      btn.setAttribute("aria-label", `${stop ? "Play" : "Pause"} the moving ${what}`);
    });
  });

  /* ---------- CORPORATE · two columns of team headshots drift past the lead portrait ---------- */
  const corp = $("[data-corp]");
  if (corp) {
    // each column carries a second copy of itself, so the drift loops without a seam
    $$(".hm-corp__g", corp).forEach((g) => [...g.children].forEach((li) => {
      const c = li.cloneNode(true);
      c.setAttribute("aria-hidden", "true");
      const im = $("img", c); if (im) im.alt = "";
      g.append(c);
    }));
    new IntersectionObserver(([e]) => corp.classList.toggle("is-held", !e.isIntersecting)).observe(corp);
    const tb = $("[data-corp-toggle]");
    tb?.addEventListener("click", () => {
      const stop = !corp.classList.contains("is-stopped");
      corp.classList.toggle("is-stopped", stop);
      tb.textContent = stop ? "Play" : "Pause";
      tb.setAttribute("aria-label", `${stop ? "Play" : "Pause"} the moving headshots`);
    });
  }

  /* ---------- screens that scroll inside their device frame ---------- */
  // distance the tall screenshot can travel inside its screen
  const travel = (img) => {
    const screen = img.parentElement;
    return Math.max(0, img.getBoundingClientRect().height - screen.getBoundingClientRect().height);
  };
  const scrollTo = (img, frac, ms) => {
    if (!img || reduced) return;
    const d = travel(img) * frac;
    img.style.setProperty("--dur", `${ms}ms`);
    img.style.setProperty("--y", `${-d}px`);
  };
  const scrollHome = (img) => { if (!img) return; img.style.setProperty("--dur", "900ms"); img.style.setProperty("--y", "0px"); };

  /* ---------- reels: muted, inline, on every screen; phones get the small file ---------- */
  const small = matchMedia("(max-width: 999px)");
  const canAuto = () => !saveData && !reduced;
  const srcFor = (v) => (small.matches && v.dataset.srcSm) || v.dataset.src;
  const playReel = (v, user = false) => {
    if (!v || (!user && (!canAuto() || v.dataset.userPaused))) return;
    if (!v.getAttribute("src")) { v.src = srcFor(v); v.load(); }
    v.play().catch(() => {});
  };
  const pauseReel = (v) => { if (v && !v.paused) v.pause(); };
  // one button plays or pauses every clip in its box; a visitor's pause sticks
  $$("[data-reel-toggle]").forEach((btn) => {
    const vids = $$("video", btn.closest(".hm-reelbox"));
    const label = () => { btn.textContent = vids.some((v) => !v.paused) ? "Pause reel" : "Play reel"; };
    vids.forEach((v) => { v.addEventListener("play", label); v.addEventListener("pause", label); });
    btn.addEventListener("click", () => {
      const on = vids.some((v) => !v.paused);
      vids.forEach((v) => {
        if (on) { v.dataset.userPaused = "1"; v.pause(); }
        else { delete v.dataset.userPaused; playReel(v, true); }
      });
    });
    label();
  });

  const FILMS = (() => { try { return JSON.parse($("#hm-films").textContent); } catch (_) { return {}; } })();

  /* ---------- HERO BILLBOARD · featured films, one at a time (Apple TV top shelf) ----------
     The poster paints first and the clip fades in once it is actually playing. Clips advance
     when they end; a poster with no clip (data saver, autoplay blocked) holds for STILL ms.
     Picking a film stops the rotation for good and loops that film. */
  const bb = $("#billboard");
  const bbHold = { add() {}, del() {} };
  if (bb) {
    const slides = $$(".hm-bb__slide", bb);
    const pills = $$(".hm-pill", bb);
    const info = $("[data-bb-info]", bb);
    const kEl = $("[data-bb-k]", bb), tEl = $("[data-bb-t]", bb), playA = $("[data-bb-play]", bb), durEl = $("[data-bb-dur]", bb);
    const pauseBtn = $("[data-bb-pause]", bb);
    const STILL = 7000, CYCLES = 2;
    let cur = 0, auto = !reduced, paused = reduced, wantClips = canAuto(), gen = 0, laps = 0;
    const stopH = new Set();   // offscreen, tab hidden, theater open: everything stops
    const rotH = new Set();    // pointer over it, keyboard inside: the film keeps playing, the rotation waits
    let acc = 0, t0 = performance.now();
    const vid = (i) => $("video", slides[i]);
    const img = (i) => $("img", slides[i]);
    const clockOn = () => !paused && !stopH.size && !rotH.size;
    const clock = () => acc + (clockOn() ? performance.now() - t0 : 0);
    const resetClock = () => { acc = 0; t0 = performance.now(); };
    const freeze = () => { acc = clock(); t0 = performance.now(); };

    const stopSlide = (i) => {
      const v = vid(i);
      slides[i].classList.remove("is-playing");
      if (v && !v.paused) v.pause();
      if (v && v.readyState) { try { v.currentTime = 0; } catch (_) {} }
    };
    const startCurrent = () => {
      const v = vid(cur);
      if (!v) return;
      v.loop = !auto;
      if (!wantClips || paused || stopH.size) return;
      if (!v.getAttribute("src")) {
        const need = $(".hm-bb__screen", bb).clientWidth * (devicePixelRatio || 1);
        const fast = !navigator.connection?.effectiveType || navigator.connection.effectiveType === "4g";
        v.src = small.matches ? v.dataset.sm : (need > 1500 && fast && v.dataset.xl) || v.dataset.lg;
        v.load();
      }
      v.play().catch((err) => {
        v.dataset.blocked = "1";
        if (err && err.name === "NotAllowedError") wantClips = false;
      });
    };
    const warm = (i) => {
      const im = img(i);
      if (!im || im.dataset.warm) return;
      im.dataset.warm = "1";
      const pre = new Image(); pre.sizes = im.sizes; pre.srcset = im.srcset; pre.src = im.src;
    };
    const paintInfo = (slug) => {
      const f = FILMS[slug];
      if (!f) return;
      kEl.textContent = `Our work · ${f.k}`; tEl.textContent = f.t;
      if (durEl) durEl.textContent = f.dur;
      playA.href = `https://www.youtube.com/watch?v=${f.yt}`; playA.dataset.film = slug;
      if (!reduced) { info.classList.remove("is-swap"); void info.offsetWidth; info.classList.add("is-swap"); }
    };

    function go(i, user = false) {
      if (user && auto) {
        auto = false; bb.classList.add("is-picked"); info.setAttribute("aria-live", "polite");
        vid(cur) && (vid(cur).loop = true);
      }
      if (i === cur) { if (user) startCurrent(); return; }
      const my = ++gen, to = slides[i];
      bb.classList.add("is-rotated");
      // whatever is on screen now stays until the newest pick is ready; anything else goes
      const vis = slides.findIndex((s) => s.classList.contains("is-on"));
      slides.forEach((s, k) => { if (k !== vis && k !== i) { stopSlide(k); s.classList.remove("is-on", "is-in"); s.hidden = true; } });
      pills.forEach((p, k) => { p.style.setProperty("--p", "0"); p.tabIndex = k === i ? 0 : -1; k === i ? p.setAttribute("aria-current", "true") : p.removeAttribute("aria-current"); });
      cur = i; resetClock();
      to.hidden = false;
      const im = img(i);
      const ready = im.complete && im.naturalWidth ? Promise.resolve() : (im.decode ? im.decode() : Promise.resolve());
      ready.catch(() => {}).then(() => {
        if (my !== gen) return;
        slides.forEach((s, k) => { if (k !== i) s.classList.remove("is-on"); });
        to.classList.add("is-on");
        paintInfo(to.dataset.film);
        if (!reduced) { to.classList.remove("is-in"); void to.offsetWidth; to.classList.add("is-in"); }
        startCurrent();
        setTimeout(() => {
          if (my !== gen) return;
          slides.forEach((s, k) => { if (k !== i) { stopSlide(k); s.hidden = true; s.classList.remove("is-in"); } });
        }, 900);
      });
      warm((i + 1) % slides.length);
    }
    const next = () => {
      const n = (cur + 1) % slides.length;
      if (n === 0 && ++laps >= CYCLES) { auto = false; }   // after two full passes the first film stays and loops
      go(n);
      if (!auto) vid(cur) && (vid(cur).loop = true);
    };

    slides.forEach((s, i) => {
      const v = vid(i);
      if (!v) return;
      v.addEventListener("playing", () => { s.classList.add("is-playing"); delete v.dataset.blocked; });
      v.addEventListener("ended", () => {
        if (i !== cur) return;
        if (auto && clockOn()) next();
        else { v.currentTime = 0; v.play().catch(() => {}); }
      });
    });

    // one loop drives the progress line: the clip's own time when it plays, the clock when it doesn't
    const tick = () => {
      const v = vid(cur);
      const clip = v && !v.paused && v.duration && !v.dataset.blocked;
      const p = clip ? v.currentTime / v.duration : Math.min(1, clock() / STILL);
      pills[cur]?.style.setProperty("--p", p.toFixed(4));
      if (!clip && auto && clockOn() && clock() >= (wantClips && !v?.dataset.blocked ? STILL * 2.2 : STILL)) next();
      if (!stopH.has("offscreen") && !stopH.has("tabhidden")) requestAnimationFrame(tick);
      else ticking = false;
    };
    let ticking = false;
    const runTick = () => { if (!ticking) { ticking = true; requestAnimationFrame(tick); } };

    const setPausedUI = () => {
      pauseBtn.innerHTML = paused
        ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10.5-6.5z"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
      pauseBtn.setAttribute("aria-label", paused ? "Play the featured films" : "Pause the featured films");
    };
    const stop = (why) => { if (stopH.has(why)) return; freeze(); stopH.add(why); const v = vid(cur); if (v && !v.paused) v.pause(); };
    const resume = (why) => { if (!stopH.delete(why)) return; t0 = performance.now(); if (!stopH.size) { startCurrent(); runTick(); warm((cur + 1) % slides.length); } };
    const rot = (why, on) => { freeze(); on ? rotH.add(why) : rotH.delete(why); t0 = performance.now(); };
    bbHold.add = stop; bbHold.del = resume;
    bb.closest(".hm-ch")?.addEventListener("hm-cover", (e) => (e.detail ? stop("covered") : resume("covered")));

    pills.forEach((p, i) => { p.tabIndex = i === 0 ? 0 : -1; p.addEventListener("click", () => { go(i, true); track("home_billboard", { film: slides[i].dataset.film }); }); });
    $(".hm-bb__pills", bb).addEventListener("keydown", (e) => {
      const n = pills.length;
      const k = { ArrowRight: (cur + 1) % n, ArrowLeft: (cur - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
      if (k === undefined) return;
      e.preventDefault();
      go(k, true);
      pills[k].focus();
    });
    pauseBtn.addEventListener("click", () => {
      freeze(); paused = !paused; t0 = performance.now();
      if (paused) { const v = vid(cur); if (v && !v.paused) v.pause(); }
      else { wantClips = true; startCurrent(); runTick(); }
      setPausedUI();
    });
    if (fine) {
      bb.addEventListener("pointerenter", () => rot("hover", true));
      bb.addEventListener("pointerleave", () => rot("hover", false));
    }
    bb.addEventListener("focusin", (e) => { if (e.target.matches(":focus-visible")) rot("focus", true); });
    bb.addEventListener("focusout", (e) => { if (!bb.contains(e.relatedTarget)) rot("focus", false); });
    // swipe between films on touch
    let sx = 0, sy = 0, swiping = false;
    const screen = $(".hm-bb__screen", bb);
    screen.style.touchAction = "pan-y";
    screen.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; swiping = true; sx = e.clientX; sy = e.clientY; });
    screen.addEventListener("pointerup", (e) => {
      if (!swiping) return; swiping = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) go((cur + (dx < 0 ? 1 : -1) + slides.length) % slides.length, true);
    });
    screen.addEventListener("pointercancel", () => { swiping = false; });
    screen.addEventListener("click", () => playA.click());
    let touchT = 0;
    bb.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      clearTimeout(touchT); rot("touch", true);
    });
    bb.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") return;
      clearTimeout(touchT); touchT = setTimeout(() => rot("touch", false), 6000);
    });

    new IntersectionObserver(([e]) => (e.isIntersecting ? resume("offscreen") : stop("offscreen")), { threshold: 0.2 }).observe(bb);
    document.addEventListener("visibilitychange", () => (document.hidden ? stop("tabhidden") : resume("tabhidden")));
    setPausedUI();
    if (reduced) bb.classList.add("is-picked");
    // start after the page has painted, so the poster is the first (and largest) paint
    const begin = () => { startCurrent(); runTick(); };
    if (document.readyState === "complete") begin(); else addEventListener("load", begin, { once: true });
  }

  /* ---------- HERO REEL · the highlight reel loops muted; the shutter opens on it ---------- */
  const reelBox = $("#reel");
  if (reelBox) {
    const v = $("video", reelBox), slide = $(".hm-bb__slide", reelBox), rs = $(".hm-bb__screen", reelBox);
    const btns = $$("[data-reel-pause]"), open = $("a[data-film]", reelBox);
    const shutter = $(".hm-shutter", reelBox);
    const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
    const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
    let held = !canAuto(), seen = true, theater = false;
    const fast = () => !navigator.connection?.effectiveType || navigator.connection.effectiveType === "4g";
    const dpr = devicePixelRatio || 1;
    const pick = () => {
      // phones: sharper on retina when the connection can carry it; desktop: sized for the full-screen first frame when pinned
      if (small.matches) return (dpr >= 2 && fast() && !saveData && v.dataset.md) || v.dataset.sm;
      const w = $("#top")?.classList.contains("is-pin") ? innerWidth : rs.clientWidth;
      return (w * dpr > 1500 && fast() && v.dataset.xl) || v.dataset.lg;
    };
    const play = () => {
      if (held || !seen || theater || document.hidden) return;
      if (!v.getAttribute("src")) { v.src = pick(); v.load(); }
      v.play().catch(() => {});
    };
    const ui = () => {
      const off = v.paused;
      btns.forEach((b) => { b.innerHTML = off ? ICON_PLAY : ICON_PAUSE; b.setAttribute("aria-label", off ? "Play the reel" : "Pause the reel"); });
    };
    v.addEventListener("playing", () => slide.classList.add("is-playing"));
    v.addEventListener("play", ui); v.addEventListener("pause", ui);
    btns.forEach((b) => b.addEventListener("click", () => { if (v.paused) { held = false; play(); } else { held = true; v.pause(); } }));
    rs.addEventListener("click", () => open?.click());
    new IntersectionObserver(([e]) => { seen = e.isIntersecting; seen ? play() : v.pause(); }, { threshold: 0.1 }).observe(rs);
    document.addEventListener("visibilitychange", () => (document.hidden ? v.pause() : play()));
    document.addEventListener("hm-theater", (e) => { theater = e.detail; theater ? v.pause() : play(); });
    ui();
    // the shutter is a one-time intro: gone when it finishes, skipped in a background tab, never stuck
    const dropShutter = () => shutter?.remove();
    if (shutter) {
      if (document.hidden || reduced) dropShutter();
      else { shutter.lastElementChild?.addEventListener("animationend", dropShutter, { once: true }); setTimeout(dropShutter, 3200); }
    }
    if (document.readyState === "complete") play(); else addEventListener("load", play, { once: true });
  }

  /* ---------- THEATER · every film plays in the page, with sound ---------- */
  const th = $("#theater");
  if (th && th.showModal) {
    const scr = $("[data-th-screen]", th);
    const thK = $("[data-th-k]", th), thT = $("[data-th-t]", th), thD = $("[data-th-d]", th);
    const closeBtn = $("[data-th-close]", th);
    let from = null;
    const open = (slug, opener) => {
      const f = FILMS[slug];
      if (!f) return false;
      from = opener;
      th.classList.toggle("is-v", f.ar === "9/16");
      thK.textContent = f.m; thT.textContent = f.t; thD.textContent = f.d;
      let player;
      if (f.v) {
        player = document.createElement("video");
        player.controls = true; player.playsInline = true; player.preload = "auto";
        if (f.poster) player.poster = f.poster;
        player.src = `${f.v}-${f.hd && innerWidth >= 1000 ? 1080 : 720}.mp4`;
        player.setAttribute("aria-label", `${f.t}, ${f.m}`);
      } else {
        player = document.createElement("iframe");
        player.src = `https://www.youtube-nocookie.com/embed/${f.yt}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
        player.title = `${f.t}, ${f.m}`;
        player.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
        player.allowFullscreen = true;
      }
      scr.replaceChildren(player);
      root.classList.add("hm-locked");
      th.showModal();
      th.scrollTop = 0;
      // started inside the click, so it plays with sound (iPhone included)
      if (player.play) player.play().catch(() => {});
      closeBtn.focus();
      try { history.pushState({ hmTheater: slug }, ""); } catch (_) {}
      bbHold.add("theater");
      document.dispatchEvent(new CustomEvent("hm-theater", { detail: true }));
      // nothing else plays under the film
      $$(".hm-reelbox video").forEach((v) => { if (!v.paused) { v.dataset.thPaused = "1"; v.pause(); } });
      $$(".hm-tile video").forEach(pauseReel);
      $$(".hm-tile.is-previewing").forEach((t) => t.classList.remove("is-previewing"));
      track("home_film_play", { film: slug });
      return true;
    };
    let closing = false;
    if (history.state?.hmTheater) history.replaceState(null, "");
    th.addEventListener("close", () => {
      $("video", scr)?.pause();
      scr.replaceChildren();
      if (history.state?.hmTheater) { closing = true; history.back(); }
      root.classList.remove("hm-locked");
      bbHold.del("theater");
      document.dispatchEvent(new CustomEvent("hm-theater", { detail: false }));
      $$(".hm-reelbox video[data-th-paused]").forEach((v) => { delete v.dataset.thPaused; v.play().catch(() => {}); });
      from?.focus({ preventScroll: true });
    });
    closeBtn.addEventListener("click", () => th.close());
    // the phone's back gesture closes the film instead of leaving the page
    addEventListener("popstate", () => {
      if (closing) { closing = false; return; }
      if (th.open) th.close();
    });
    // a click on the dark around the film closes it
    th.addEventListener("click", (e) => { if (e.target === th || e.target.classList.contains("hm-theater__in")) th.close(); });
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-film]");
      if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (open(a.dataset.film, a)) e.preventDefault();
    });
  }

  /* ---------- SHELVES · arrows page through a row; tiles lift toward the pointer and preview ---------- */
  $$("[data-shelf]").forEach((sh) => {
    const row = $(".hm-shelf__row", sh), prev = $("[data-shelf-prev]", sh), next = $("[data-shelf-next]", sh);
    const upd = () => {
      const max = row.scrollWidth - row.clientWidth - 2;
      prev.disabled = row.scrollLeft <= 2;
      next.disabled = row.scrollLeft >= max;
    };
    const page = (dir) => row.scrollBy({ left: dir * row.clientWidth * 0.8, behavior: reduced ? "auto" : "smooth" });
    prev.addEventListener("click", () => page(-1));
    next.addEventListener("click", () => page(1));
    let st = false;
    row.addEventListener("scroll", () => { if (!st) { st = true; requestAnimationFrame(() => { st = false; upd(); }); } }, { passive: true });
    addEventListener("resize", upd, { passive: true });
    upd();
  });
  if (fine) {
    $$(".hm-tile").forEach((tile) => {
      const art = $(".hm-tile__art", tile);
      let wait = 0, v = null;
      tile.addEventListener("pointermove", (e) => {
        tile.classList.add("is-tracking");
        const r = art.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        art.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
        art.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
        if (!reduced) {
          art.style.setProperty("--ry", `${((x - 0.5) * 7).toFixed(2)}deg`);
          art.style.setProperty("--rx", `${((0.5 - y) * 7).toFixed(2)}deg`);
        }
      });
      tile.addEventListener("pointerenter", () => {
        const f = FILMS[tile.dataset.film];
        if (!f || !f.pv || saveData || reduced) return;
        wait = setTimeout(() => {
          if (!v) {
            v = document.createElement("video");
            v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto";
            v.setAttribute("aria-hidden", "true"); v.tabIndex = -1;
            v.addEventListener("playing", () => tile.classList.add("is-previewing"));
            v.src = f.pv;
            art.append(v);
          }
          v.play().catch(() => {});
        }, 420);
      });
      tile.addEventListener("pointerleave", () => {
        clearTimeout(wait);
        tile.classList.remove("is-previewing", "is-tracking");
        if (v && !v.paused) v.pause();
        art.style.removeProperty("--rx"); art.style.removeProperty("--ry");
      });
    });
  }

  /* ---------- WEB CHAPTER · every site in an Apple-style gallery ----------
     Each site scrolls down in the browser and on the phone together, then the next one slides in.
     Hover holds it (and scrolls the whole site), a dot, a swipe or a click on the peeking site picks
     one and pauses the autoplay; the button plays or pauses it. */
  const gal = $("[data-gal]");
  if (gal) {
    const rail = $(".hm-gal__track", gal), slides = $$(".hm-gal__slide", gal), dots = $$(".hm-gal__dot", gal);
    const playBtn = $("[data-gal-pause]", gal);
    const PASS = 6800, BEAT = 1500;
    const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
    const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
    let cur = 0, playing = !reduced, acc = 0, t0 = performance.now(), ticking = false, programmatic = 0;
    const holds = new Set(["offscreen"]);
    const shots = (sl) => $$(".mu-scroll", sl);
    const running = () => playing && !holds.size;
    const pass = (sl) => { if (!reduced && !sl.dataset.still) shots(sl).forEach((im) => scrollTo(im, 0.6, PASS - 500)); };
    const back = (sl) => shots(sl).forEach(scrollHome);
    const elapsed = () => acc + (running() ? performance.now() - t0 : 0);
    const restart = () => { acc = 0; t0 = performance.now(); back(slides[cur]); if (running()) setTimeout(() => running() && pass(slides[cur]), 450); };
    const ui = () => {
      gal.classList.toggle("is-paused", !playing);
      playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      playBtn.setAttribute("aria-label", playing ? "Pause the websites" : "Play the websites");
    };
    const stepX = () => (slides[1] ? slides[1].offsetLeft - slides[0].offsetLeft : rail.clientWidth);
    function go(i, { user = false, scroll = true } = {}) {
      i = (i + slides.length) % slides.length;
      if (user && playing) { playing = false; ui(); }
      if (i !== cur) back(slides[cur]);
      cur = i;
      slides.forEach((sl, k) => { sl.classList.toggle("is-on", k === i); $("a", sl).tabIndex = k === i ? 0 : -1; });
      dots.forEach((d, k) => { d.style.setProperty("--p", "0"); d.tabIndex = k === i ? 0 : -1; k === i ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current"); });
      if (scroll) {
        programmatic = performance.now();
        const far = Math.abs(rail.scrollLeft - stepX() * i) > stepX() * 1.5;
        if (far && !reduced) {
          // from the last site back to the first: a short dip, not a rewind past every site
          rail.classList.add("is-wrapping");
          setTimeout(() => { programmatic = performance.now(); rail.scrollTo({ left: stepX() * i, behavior: "auto" }); rail.classList.remove("is-wrapping"); }, 300);
        } else rail.scrollTo({ left: stepX() * i, behavior: reduced ? "auto" : "smooth" });
      }
      restart();
      tick();
    }
    function tick() {
      if (ticking) return;
      ticking = true;
      const f = () => {
        const p = Math.min(1, elapsed() / (PASS + BEAT));
        dots[cur].style.setProperty("--p", p.toFixed(4));
        if (running() && p >= 1) { go(cur + 1); }
        if (!holds.has("offscreen") && !document.hidden) requestAnimationFrame(f); else ticking = false;
      };
      requestAnimationFrame(f);
    }
    const hold = (why) => { if (holds.has(why)) return; acc = elapsed(); holds.add(why); };
    const release = (why) => {
      if (!holds.delete(why)) return;
      t0 = performance.now();
      if (!holds.size) { if (why === "offscreen" && acc === 0) restart(); tick(); }
    };
    dots.forEach((d, k) => d.addEventListener("click", () => { go(k, { user: true }); track_("dot", k); }));
    $(".hm-gal__dots", gal).addEventListener("keydown", (e) => {
      const k = { ArrowRight: cur + 1, ArrowLeft: cur - 1, Home: 0, End: slides.length - 1 }[e.key];
      if (k === undefined) return;
      e.preventDefault(); go(k, { user: true }); dots[cur].focus();
    });
    const track_ = (how, k) => track("home_site", { site: slides[k].dataset.site, how });
    playBtn.addEventListener("click", () => { playing = !playing; ui(); if (playing) { restart(); tick(); } else { acc = elapsed(); back(slides[cur]); } });
    // the peeking site: a click brings it in instead of leaving the page
    slides.forEach((sl, k) => sl.addEventListener("click", (e) => { if (k !== cur) { e.preventDefault(); go(k, { user: true }); track_("peek", k); } }));
    // a swipe or trackpad scroll settles on a site: that becomes the current one
    let settleT = 0;
    rail.addEventListener("scroll", () => {
      clearTimeout(settleT);
      settleT = setTimeout(() => {
        if (performance.now() - programmatic < 900) return;
        const k = Math.round(rail.scrollLeft / stepX());
        if (k !== cur) { go(k, { user: true, scroll: false }); track_("swipe", k); }
      }, 140);
    }, { passive: true });
    // hover: hold the autoplay; over the browser, scroll the whole site (phone too)
    if (fine) {
      gal.addEventListener("pointerenter", () => hold("hover"));
      gal.addEventListener("pointerleave", () => { release("hover"); });
      slides.forEach((sl, k) => {
        const link = $(".hm-sites__browser", sl);
        link.addEventListener("pointerenter", () => {
          if (k !== cur || sl.dataset.still) return;
          const d = travel($(".mu-scroll", link));
          shots(sl).forEach((im) => scrollTo(im, 1, Math.min(14000, Math.max(2600, d * 2.4))));
        });
        link.addEventListener("pointerleave", () => {
          back(sl);
          // the timer picks up where it was, and so does the site's slow pass
          if (k === cur && !sl.dataset.still) setTimeout(() => { if (running()) shots(sl).forEach((im) => scrollTo(im, 0.6, Math.max(800, PASS - acc))); }, 950);
        });
      });
    }
    gal.addEventListener("focusin", (e) => { if (e.target.matches(":focus-visible")) hold("focus"); });
    gal.addEventListener("focusout", (e) => { if (!gal.contains(e.relatedTarget)) release("focus"); });
    new IntersectionObserver(([e]) => (e.isIntersecting ? release("offscreen") : hold("offscreen")), { threshold: 0.35 }).observe(gal);
    document.addEventListener("visibilitychange", () => (document.hidden ? hold("tabhidden") : release("tabhidden")));
    gal.closest(".hm-ch")?.addEventListener("hm-cover", (e) => (e.detail ? hold("covered") : release("covered")));
    ui();
  }

  /* ---------- VIDEO CHAPTER · the reel and the phone play while on screen, on every device ---------- */
  const box = $(".hm-reelbox");
  if (box) {
    const vids = $$("video", box);
    let seen = false;
    const sync = () => vids.forEach((v) => (seen && !box.dataset.covered ? playReel(v) : pauseReel(v)));
    new IntersectionObserver(([e]) => { seen = e.isIntersecting; sync(); }, { threshold: 0.35 }).observe(box);
    box.addEventListener("hm-cover", sync);
  }

  /* ---------- THE FOUR · GSAP card stacking (desktop, tall enough screens) ---------- */
  const deck = $(".hm-deck");
  const chapters = $$(".hm-ch", deck || document);
  const coveredAt = new Map();
  const jump = (y) => window.scrollTo({ top: y, behavior: "instant" });
  // Tab into a card that the next card is covering: scroll back to where it is fully uncovered
  deck?.addEventListener("focusin", (e) => {
    if (!deck.classList.contains("is-stack")) return;
    const ch = e.target.closest(".hm-ch");
    if (!ch) return;
    requestAnimationFrame(() => {
      const r = e.target.getBoundingClientRect();
      const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
      const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
      const hit = document.elementFromPoint(x, y);
      if (hit && ch.contains(hit) && r.top >= 0 && r.bottom <= innerHeight) return;
      const st = coveredAt.get(ch);
      if (st && scrollY > st.start) jump(Math.max(0, st.start - 1));
      requestAnimationFrame(() => {
        const r2 = e.target.getBoundingClientRect();
        if (r2.top < 96) jump(scrollY + r2.top - 120);
        else if (r2.bottom > innerHeight) jump(scrollY + r2.bottom - innerHeight + 32);
      });
    });
  });
  // "Work" links land where the film row (bottom of the sticky video card) is fully in view, before the next card covers it
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href="#films"]');
    const st = coveredAt.get($("#ch-video"));
    if (!a || !st || !deck?.classList.contains("is-stack") || e.button || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    window.scrollTo({ top: Math.max(0, st.start - 2), behavior: reduced ? "auto" : "smooth" });
    history.replaceState(history.state, "", "#films");
  });
  const stackOn = () => {
    if (!deck || reduced || !window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1000px) and (min-height: 700px)", () => {
      deck.classList.add("is-stack");
      // a card taller than the screen sticks only once its bottom reaches the bottom edge
      const setTops = () => chapters.forEach((ch) => ch.style.setProperty("--top", `${Math.min(0, innerHeight - ch.offsetHeight)}px`));
      setTops();
      ScrollTrigger.addEventListener("refreshInit", setTops);
      chapters.forEach((ch, i) => {
        const next = chapters[i + 1];
        if (!next) return;
        const tw = gsap.to(ch, { scale: 0.93, ease: "none", scrollTrigger: { trigger: next, start: "top bottom", end: "top top", scrub: true } });
        coveredAt.set(ch, tw.scrollTrigger);
      });
      // a sticky chapter stays "in view" under the next card: whatever moves in it stops once it is covered
      const tell = (ch, on) => ch.dispatchEvent(new CustomEvent("hm-cover", { detail: on }));
      const coverSTs = chapters.slice(0, -1).map((ch, i) => ScrollTrigger.create({
        trigger: chapters[i + 1], start: "top 15%", onEnter: () => tell(ch, true), onLeaveBack: () => tell(ch, false),
      }));
      return () => {
        coverSTs.forEach((st, i) => { st.kill(); tell(chapters[i], false); });
        ScrollTrigger.removeEventListener("refreshInit", setTops);
        deck.classList.remove("is-stack");
        chapters.forEach((ch) => { ch.style.removeProperty("--top"); ch.style.removeProperty("transform"); });
      };
    });
    // images that load late change card heights
    if (document.readyState === "complete") ScrollTrigger.refresh();
    else addEventListener("load", () => ScrollTrigger.refresh(), { once: true });
  };
  // GSAP (cdnjs, pinned + SRI) loads only on screens where the stacking runs
  const stackMQ = matchMedia("(min-width: 1000px) and (min-height: 700px)");
  const CDN = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/";
  const addScript = (file, integrity) => new Promise((ok, fail) => {
    const el = document.createElement("script");
    el.src = CDN + file; el.integrity = integrity; el.crossOrigin = "anonymous"; el.referrerPolicy = "no-referrer";
    el.onload = ok; el.onerror = fail;
    document.head.append(el);
  });
  let gsapReq = null;
  const needGsap = () => {
    if (reduced || !deck || gsapReq || !stackMQ.matches) return;
    gsapReq = addScript("gsap.min.js", "sha512-7eHRwcbYkK4d9g/6tD/mhkf++eoTHwpNM9woBxtPUBWm67zeAfFC+HrdoE2GanKeocly/VxeLvIqwvCdk7qScg==")
      .then(() => addScript("ScrollTrigger.min.js", "sha512-onMTRKJBKz8M1TnqqDuGBlowlH0ohFzMXYRNebz+yOcc5TQr/zAKsthzhuv0hiyUKEiQEQXEynnXCvNTOk50dg=="))
      .then(stackOn)
      .catch(() => {});
  };
  needGsap();
  stackMQ.addEventListener("change", needGsap);

  /* ---------- MANIFESTO · Magic UI Text Reveal (scroll-scrubbed word by word) ---------- */
  const rv = $("[data-reveal]");
  if (rv) {
    const p = $(".hm-reveal__text", rv);
    const words = p.textContent.trim().split(/\s+/);
    p.textContent = "";
    const spans = words.map((w, i) => {
      const s = document.createElement("span");
      s.className = "rw"; s.textContent = w;
      p.append(s);
      if (i < words.length - 1) p.append(" ");
      return s;
    });
    if (!reduced) {
      rv.classList.add("is-live");
      let on = false, rTick = false;
      const paint = () => {
        rTick = false;
        const r = rv.getBoundingClientRect();
        const span = r.height - innerHeight;
        const prog = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) / 0.7 : 1;
        const n = spans.length;
        spans.forEach((s, i) => {
          const o = Math.min(1, Math.max(0, prog * n - i));
          s.style.setProperty("--o", (0.16 + o * 0.84).toFixed(3));
        });
      };
      addEventListener("scroll", () => { if (on && !rTick) { rTick = true; requestAnimationFrame(paint); } }, { passive: true });
      addEventListener("resize", paint, { passive: true });
      new IntersectionObserver(([e]) => { on = e.isIntersecting; if (on) paint(); }).observe(rv);
      paint();
    }
  }

  /* ---------- REVIEWS · testimonial carousel ---------- */
  const car = $("[data-rv]");
  if (car) {
    const slides = $$(".hm-rv__slide", car);
    const count = $("[data-rv-i]");
    let k = 0;
    const go = (n) => {
      k = (n + slides.length) % slides.length;
      slides.forEach((s, j) => { s.classList.toggle("is-on", j === k); s.inert = j !== k; });
      if (count) count.textContent = String(k + 1);
    };
    car.setAttribute("aria-live", "polite");
    $("[data-rv-prev]")?.addEventListener("click", () => go(k - 1));
    $("[data-rv-next]")?.addEventListener("click", () => go(k + 1));
    let sx = 0;
    car.addEventListener("pointerdown", (e) => { sx = e.clientX; });
    car.addEventListener("pointerup", (e) => { const dx = e.clientX - sx; if (e.pointerType !== "mouse" && Math.abs(dx) > 44) go(k + (dx < 0 ? 1 : -1)); });
    go(0);
  }
})();
