/* TAYLORMADE/CREATIVE · home
   Magic UI ports (Scroll Progress, Text Animate, Blur Fade, Marquee, Safari + iPhone
   screen scroll, Text Reveal), the hero stage tabs, the web chapter's site switcher,
   the reel, GSAP card stacking for the four chapters, and the reviews carousel.
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

  // warm a lazy hero image into the cache so its panel wipes in fully painted
  const warm = (img) => { if (img && !img.complete) { const i = new Image(); i.decoding = "async"; i.src = img.currentSrc || img.src; } };

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
      btn.textContent = stop ? "Play" : "Pause";
      btn.setAttribute("aria-label", stop ? "Play the moving client names" : "Pause the moving client names");
    });
  });

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

  /* ---------- HERO STAGE · four tabs, auto-advance until the visitor picks ---------- */
  const hero = $(".hm-hero");
  const stage = $("#stage");
  const tabs = $$(".hm-tab");
  const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
  const DUR = 6500;
  let cur = 0, auto = !reduced, remaining = DUR, t0 = 0, timer = 0, holds = new Set(), gen = 0;

  const heroCta = $("[data-hero-cta]");
  const reelOf = (panel) => $("video", panel);
  // reels autoplay only on big screens with motion allowed; phones get the poster and a Play button
  const bigScreen = matchMedia("(min-width: 1000px)");
  const canAuto = () => bigScreen.matches && !saveData && !reduced;
  const playReel = (v, user = false) => {
    if (!v || (!user && (!canAuto() || v.dataset.userPaused))) return;
    if (!v.getAttribute("src")) { v.src = v.dataset.src; v.load(); }
    v.play().catch(() => {});
  };
  const pauseReel = (v) => { if (v && !v.paused) v.pause(); };
  // every reel has a Play/Pause button; a visitor's pause sticks
  $$("[data-reel-toggle]").forEach((btn) => {
    const v = $("video", btn.closest(".hm-panel, .hm-reelbox"));
    if (!v) return;
    const label = () => { btn.textContent = v.paused ? "Play reel" : "Pause reel"; };
    v.addEventListener("play", label); v.addEventListener("pause", label);
    btn.addEventListener("click", () => {
      if (v.paused) { delete v.dataset.userPaused; playReel(v, true); }
      else { v.dataset.userPaused = "1"; v.pause(); }
    });
    label();
  });

  // what each panel does when it arrives / leaves
  const enter = (panel) => {
    $$("img", panel).forEach(warm);
    if (panel.id === "p-video" && !holds.has("offscreen")) playReel(reelOf(panel));
    if (panel.id === "p-web") {
      const [desk, phone] = $$(".mu-scroll", panel);
      setTimeout(() => { scrollTo(desk, 0.85, 5600); scrollTo(phone, 0.7, 5600); }, 650);
    }
  };
  const leave = (panel) => {
    pauseReel(reelOf(panel));
    $$(".mu-scroll", panel).forEach(scrollHome);
  };

  const clearTimer = () => { clearTimeout(timer); timer = 0; };
  const runTimer = () => {
    clearTimer();
    if (!auto || holds.size) return;
    t0 = performance.now();
    timer = setTimeout(() => show((cur + 1) % panels.length), remaining);
  };
  const hold = (why) => {
    if (holds.has(why)) return;
    if (!holds.size && timer) remaining = Math.max(400, remaining - (performance.now() - t0));
    holds.add(why); clearTimer();
    hero.classList.add("hm-stage-held");
    if (why === "offscreen" || why === "tabhidden") pauseReel(reelOf(panels[cur]));
  };
  const release = (why) => {
    if (!holds.delete(why)) return;
    if (holds.size) return;
    hero.classList.remove("hm-stage-held");
    if (panels[cur].id === "p-video") playReel(reelOf(panels[cur]));
    runTimer();
  };
  const stopAuto = () => {
    if (!auto) return;
    auto = false; clearTimer();
    hero.classList.remove("hm-stage-auto", "hm-stage-held");
  };

  function show(i, { user = false, focus = false } = {}) {
    if (user) stopAuto();
    if (i === cur || !panels[i]) { if (focus) tabs[i]?.focus(); return; }
    // settle any wipe still running: only the panel on screen now survives
    const my = ++gen;
    panels.forEach((p, k) => {
      [p, $(".hm-panel__art", p)].forEach((el) => el?.getAnimations().forEach((a) => a.cancel()));
      p.style.zIndex = "";
      if (k !== cur) p.hidden = true;
    });
    const from = panels[cur], to = panels[i];
    tabs.forEach((t, k) => {
      t.setAttribute("aria-selected", String(k === i));
      t.tabIndex = k === i ? 0 : -1;
    });
    if (focus) tabs[i].focus();
    // once the visitor picks a service, the hero's main button quotes that service
    if (user && heroCta && tabs[i].dataset.cta) heroCta.href = tabs[i].dataset.cta;
    cur = i; remaining = DUR;
    leave(from);
    to.hidden = false;
    enter(to);
    if (reduced) {
      from.hidden = true;
    } else {
      // wipe in from the right (clip-path, strong ease-in-out), outgoing panel settles back
      to.style.zIndex = "2"; from.style.zIndex = "1";
      $(".hm-panel__art", to)?.animate([{ transform: "scale(1.035)" }, { transform: "none" }], { duration: 900, easing: "cubic-bezier(.23,1,.32,1)" });
      from.animate([{ opacity: 1, filter: "blur(0px)" }, { opacity: 0.25, filter: "blur(4px)" }], { duration: 700, easing: "ease" });
      const wipe = to.animate([{ clipPath: "inset(0 0 0 100%)" }, { clipPath: "inset(0 0 0 0%)" }], { duration: 700, easing: "cubic-bezier(.77,0,.175,1)" });
      wipe.onfinish = () => {
        if (my !== gen) return;          // a newer pick already took over
        from.hidden = true;
        from.getAnimations().forEach((a) => a.cancel());
        to.style.zIndex = ""; from.style.zIndex = "";
      };
    }
    runTimer();
  }

  if (stage && tabs.length) {
    if (auto) hero.classList.add("hm-stage-auto");
    hero.style.setProperty("--dur", `${DUR}ms`);
    tabs.forEach((t, k) => t.addEventListener("click", () => {
      show(k, { user: true });
      track("home_tab", { tab: panels[k].id.slice(2) });
    }));
    $(".hm-tabs").addEventListener("keydown", (e) => {
      const n = tabs.length;
      const k = { ArrowRight: (cur + 1) % n, ArrowLeft: (cur - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
      if (k === undefined) return;
      e.preventDefault();
      show(k, { user: true, focus: true });
    });
    // holds: pointer over the stage or tabs, keyboard focus inside the hero, hero off screen, tab hidden
    if (fine) {
      [stage, $(".hm-tabs")].forEach((el) => {
        el.addEventListener("pointerenter", () => hold("hover"));
        el.addEventListener("pointerleave", () => release("hover"));
      });
    }
    hero.addEventListener("focusin", (e) => { if (e.target.matches(":focus-visible")) hold("focus"); });
    hero.addEventListener("focusout", (e) => { if (!hero.contains(e.relatedTarget)) release("focus"); });
    new IntersectionObserver(([e]) => (e.isIntersecting ? release("offscreen") : hold("offscreen")), { threshold: 0.25 }).observe(stage);
    document.addEventListener("visibilitychange", () => (document.hidden ? hold("tabhidden") : release("tabhidden")));
    // phones: the rotation starts with the visitor's first scroll or touch, so the first paint stays the largest one
    if (!bigScreen.matches) {
      hold("untouched");
      const go = () => { release("untouched"); ["scroll", "touchstart", "keydown"].forEach((ev) => removeEventListener(ev, go)); };
      ["scroll", "touchstart", "keydown"].forEach((ev) => addEventListener(ev, go, { passive: true }));
    }

    // swipe between panels on touch
    let sx = 0, sy = 0, swiping = false;
    stage.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; swiping = true; sx = e.clientX; sy = e.clientY; });
    stage.addEventListener("pointerup", (e) => {
      if (!swiping) return; swiping = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        const n = panels.length;
        show(dx < 0 ? (cur + 1) % n : (cur - 1 + n) % n, { user: true });
      }
    });
    stage.addEventListener("pointercancel", () => { swiping = false; });

    // after load: swap the hero's tall screenshots in, warm the other panels, start the clock
    const afterLoad = () => {
      const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 600));
      if (!saveData) idle(() => panels.forEach((p) => $$("img", p).forEach(warm)), { timeout: 1500 });
      runTimer();
    };
    if (document.readyState === "complete") afterLoad(); else addEventListener("load", afterLoad, { once: true });
  }

  /* ---------- WEB CHAPTER · site switcher + hover scroll (Magic UI Safari port) ---------- */
  const sites = $("[data-sites]");
  if (sites) {
    const chips = $$(".hm-chip", sites);
    const link = $("[data-site-link]", sites);
    const img = $("[data-site-img]", sites);
    const urlText = $("[data-site-url]", sites);
    const note = $("[data-site-note]", sites);
    const hint = $(".hm-sites__hint", sites);
    const sizes = img.getAttribute("sizes") || "100vw";
    const hintFor = (chip) => (chip.dataset.still ? "Open the window to see the live site" : fine ? "Hover the window to scroll the site" : "Tap the window to open the live site");
    const filesFor = (chip) => {
      const hi = chip.dataset.src;
      return { src: hi, srcset: `${hi.replace(/\.webp$/, "-720.webp")} 720w, ${hi} 1200w` };
    };
    const preload = (chip) => {
      const f = filesFor(chip), i = new Image();
      i.sizes = sizes; i.srcset = f.srcset; i.src = f.src;
      return i;
    };
    const hoverScroll = () => {
      const d = travel(img);
      if (d > 40) scrollTo(img, 1, Math.min(14000, Math.max(2600, d * 2.4)));
    };
    if (hint) hint.textContent = hintFor(chips.find((c) => c.getAttribute("aria-pressed") === "true") || chips[0]);
    let token = 0;
    let autoPass = () => {};
    // warm a site when the visitor reaches for its chip, so the swap is near instant
    chips.forEach((chip) => ["pointerenter", "focus", "touchstart"].forEach((ev) =>
      chip.addEventListener(ev, () => { if (!chip.dataset.warm) { chip.dataset.warm = "1"; preload(chip); } }, { once: true, passive: true })));

    chips.forEach((chip) => chip.addEventListener("click", () => {
      if (chip.getAttribute("aria-pressed") === "true") return;
      chips.forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      const name = chip.textContent.trim();
      link.href = chip.dataset.href;
      link.setAttribute("aria-label", `Visit ${chip.dataset.url} (opens in a new tab)`);
      urlText.textContent = chip.dataset.url;
      note.textContent = chip.dataset.note;
      if (hint) hint.textContent = hintFor(chip);
      track("home_site", { site: chip.dataset.site });
      const my = ++token;
      const f = filesFor(chip);
      const next = preload(chip);
      // fade only once the next site is decoded: no blank window on a slow connection
      const swap = () => {
        if (my !== token) return;
        link.classList.add("is-swapping");
        setTimeout(() => {
          if (my !== token) return;
          scrollHome(img); img.style.setProperty("--dur", "0ms");
          img.srcset = f.srcset; img.src = f.src;
          img.alt = `${name} website, full homepage`;
          const reveal = () => {
            if (my !== token) return;
            link.classList.remove("is-swapping");
            if (fine && link.matches(":hover")) hoverScroll(); else autoPass();
          };
          (img.decode ? img.decode() : Promise.resolve()).then(reveal, reveal);
        }, reduced ? 0 : 160);
      };
      (next.decode ? next.decode() : Promise.resolve()).then(swap, swap);
    }));

    if (fine) {
      link.addEventListener("pointerenter", hoverScroll);
      link.addEventListener("pointerleave", () => scrollHome(img));
    } else {
      // touch: one slow pass down and back when the window comes into view
      let passT = 0;
      autoPass = () => {
        clearTimeout(passT);
        scrollTo(img, 0.55, 7000);
        passT = setTimeout(() => scrollHome(img), 7600);
      };
      new IntersectionObserver(([e]) => { if (e.isIntersecting) autoPass(); }, { threshold: 0.6 }).observe(link);
    }
  }

  /* ---------- VIDEO CHAPTER · reel plays while on screen (big screens); its button pauses it for good ---------- */
  const box = $(".hm-reelbox");
  if (box) {
    const v = $("video", box);
    new IntersectionObserver(([e]) => (e.isIntersecting ? playReel(v) : pauseReel(v)), { threshold: 0.35 }).observe(v);
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
      return () => {
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
