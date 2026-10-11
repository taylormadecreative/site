/* TAYLORMADE/CREATIVE — photography pages (hub, product, branding).
   Presentation only; booking lives in /book/ and the instant-book pages.

   1. the hero viewfinder: frames swap under a studio-strobe pop
   2. flipbooks on the shoot tiles (mouse hover only)
   3. the wall: category filter + "show more"
   4. lightbox for any [data-lb-group] of .shot links
   5. the shade switcher on the product page
   6. the next real headshot opening, from the live calendar

   Every photo is in the markup and painted before any of this runs. Motion is
   transform/opacity/filter, and all of it checks prefers-reduced-motion. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  const EASE = "cubic-bezier(.22, 1, .36, 1)";

  /* ================= 1. VIEWFINDER ================= */
  function viewfinder() {
    const root = $("[data-strobe]");
    if (!root) return;
    const view = $(".ph-view", root);
    const img = $("img", view);
    const flash = $(".ph-flash", view);
    const thumbs = $$(".ph-thumb", root);
    const loupe = $(".ph-loupe", root);
    const count = $(".ph-count", root);
    const cat = $(".ph-cat", root);
    const pauseBtn = $(".ph-pause", root);
    const n = thumbs.length;
    if (!n) return;
    const pad = (x) => String(x).padStart(2, "0");
    const cache = [];
    const load = (k) => {
      if (!cache[k]) { cache[k] = new Image(); cache[k].src = thumbs[k].dataset.full; }
      return cache[k];
    };
    // autoplay runs one lap of the strip, then rests. A tap on the frame, a
    // thumbnail or Pause stops it for good; hover and focus only hold it.
    let i = 0, timer = 0, hold = false, onScreen = true, stopped = reduced, steps = 0;
    let busy = false, queued = -1;

    const place = (k) => {
      const t = thumbs[k];
      loupe.style.width = `${t.offsetWidth + 8}px`;
      loupe.style.transform = `translateX(${t.offsetLeft - 4}px)`;
      thumbs.forEach((b, j) => b.setAttribute("aria-current", j === k ? "true" : "false"));
    };

    async function show(k, pop) {
      if (busy) { queued = k; return; }   // remember the latest ask, show it when free
      busy = true;
      const next = load(k);
      try { await next.decode(); } catch (_) { /* paint it anyway */ }
      const t = thumbs[k];
      const apply = () => {
        img.src = next.src;
        img.alt = t.dataset.alt || "";
        img.style.objectPosition = t.dataset.pos || "50% 50%";
        count.textContent = `${pad(k + 1)} / ${pad(n)}`;
        cat.textContent = t.dataset.cat;
        cat.href = t.dataset.href;
      };
      if (pop && !reduced) {
        // the pop: a fast rise to near-white, the swap at the peak, a slow fall
        flash.animate([{ opacity: 0 }, { opacity: 0.8, offset: 0.12 }, { opacity: 0 }], { duration: 560, easing: "ease-out" });
        setTimeout(apply, 65);
      } else apply();
      i = k;
      place(k);
      setTimeout(() => {
        busy = false;
        if (queued > -1 && queued !== i) { const q = queued; queued = -1; show(q, true); }
        queued = -1;
      }, 300);
    }

    const stop = () => { clearTimeout(timer); timer = 0; };
    const loop = () => {
      stop();
      if (stopped || hold || !onScreen || document.hidden || steps >= n) return;
      load((i + 1) % n);   // only fetch the next frame once it is actually coming
      timer = setTimeout(async () => { steps++; await show((i + 1) % n, true); loop(); }, 3400);
    };
    const halt = () => {
      stopped = true; stop();
      if (pauseBtn) { pauseBtn.textContent = "Play"; pauseBtn.setAttribute("aria-pressed", "true"); }
    };

    thumbs.forEach((b, k) => b.addEventListener("click", () => { halt(); show(k, true); }));
    view.addEventListener("pointerdown", halt);
    if (pauseBtn) {
      if (reduced) pauseBtn.hidden = true;
      pauseBtn.addEventListener("click", () => {
        if (stopped) {
          stopped = false; steps = 0;
          pauseBtn.textContent = "Pause"; pauseBtn.setAttribute("aria-pressed", "false");
          show((i + 1) % n, true); loop();
        } else halt();
      });
    }
    root.addEventListener("pointerenter", () => { if (fine.matches) { hold = true; stop(); } });
    root.addEventListener("pointerleave", () => { hold = false; loop(); });
    root.addEventListener("focusin", () => { hold = true; stop(); });
    root.addEventListener("focusout", (e) => { if (!root.contains(e.relatedTarget)) { hold = false; loop(); } });
    document.addEventListener("visibilitychange", loop);
    new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; loop(); }, { threshold: 0.2 }).observe(view);
    addEventListener("resize", () => place(i), { passive: true });

    place(0);
    // nothing extra downloads until the page itself has finished loading
    if (document.readyState === "complete") loop();
    else addEventListener("load", loop, { once: true });
  }

  /* ================= 2. FLIPBOOKS ================= */
  // Extra frames carry data-src and only download on a real mouse hover, so a
  // phone never pays for frames it can't show.
  function flipbooks() {
    $$("[data-flip]").forEach((tile) => {
      const frames = $$(".flip img", tile);
      if (frames.length < 2) return;
      let k = 0, t = 0;
      const set = (j) => { frames[k].classList.remove("on"); k = j; frames[k].classList.add("on"); };
      const step = () => { set((k + 1) % frames.length); t = setTimeout(step, 620); };
      tile.addEventListener("pointerenter", () => {
        if (reduced || !fine.matches) return;
        frames.forEach((f) => { if (f.dataset.src && !f.getAttribute("src")) f.src = f.dataset.src; });
        clearTimeout(t); t = setTimeout(step, 180);
      });
      tile.addEventListener("pointerleave", () => { clearTimeout(t); set(0); });
    });
  }

  /* ================= 3. THE WALL ================= */
  function wall() {
    const root = $("[data-wall]");
    if (!root) return;
    const chips = $$(".chip", root);
    const shots = $$(".shot", root);
    const more = $(".wall-more", root);
    const moreBtn = more && $("button", more);
    const status = $("[data-wall-status]", root);
    const LIMIT = Number(root.dataset.limit) || 20;
    const grid = $(".masonry", root);
    let cat = "all", shown = LIMIT;   // "Show more" adds one more page each time

    // Each photo drops into the shortest column, in page order. Earlier photos
    // never move when more are added, and reading/tab order runs across rows.
    // Heights come from the width/height attributes, so no image has to load first.
    function layout() {
      if (!grid) return;
      grid.classList.add("is-js");
      const cols = innerWidth >= 1100 ? 4 : innerWidth >= 720 ? 3 : 2;
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 12;
      const colW = (grid.clientWidth - gap * (cols - 1)) / cols;
      const tops = new Array(cols).fill(0);
      shots.forEach((s) => {
        if (s.hidden) return;
        const im = $("img", s);
        const h = colW * ((+im.getAttribute("height") || 1) / (+im.getAttribute("width") || 1));
        const c = tops.indexOf(Math.min(...tops));
        s.style.width = `${colW}px`;
        s.style.left = `${c * (colW + gap)}px`;
        s.style.top = `${tops[c]}px`;
        tops[c] += h + gap;
      });
      grid.style.height = `${Math.max(0, Math.max(...tops) - gap)}px`;
    }
    let raf = 0;
    new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); }).observe(root);

    chips.forEach((c) => {
      const k = c.dataset.cat;
      const n = k === "all" ? shots.length : shots.filter((s) => s.dataset.cat === k).length;
      const small = $("small", c);
      if (small) small.textContent = n;
    });

    function apply(animate) {
      let seen = 0;
      const visible = [];
      shots.forEach((s) => {
        const match = cat === "all" || s.dataset.cat === cat;
        const show = match && (cat !== "all" || seen < shown);
        if (match) seen++;
        const was = !s.hidden;
        s.hidden = !show;
        // hidden only by the "show more" cap: still part of the lightbox set
        s.dataset.over = match && !show ? "1" : "";
        if (show && (!was || animate === "all")) visible.push(s);
      });
      if (more) more.hidden = !(cat === "all" && shown < shots.length);
      chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.cat === cat)));
      layout();
      if (status) {
        const label = cat === "all" ? "photos" : `${$(`.chip[data-cat="${cat}"]`, root).firstChild.textContent.trim().toLowerCase()} photos`;
        status.textContent = `Showing ${shots.filter((s) => !s.hidden).length} ${label}`;
      }
      if (animate && !reduced) {
        visible.slice(0, 16).forEach((s, j) => {
          s.animate(
            [{ opacity: 0, transform: "translateY(12px) scale(.985)" }, { opacity: 1, transform: "none" }],
            { duration: 420, delay: j * 26, easing: EASE, fill: "backwards" },
          );
        });
      }
    }

    chips.forEach((c) => c.addEventListener("click", () => {
      if (c.dataset.cat === cat) return;
      cat = c.dataset.cat;
      apply("all");
    }));
    if (moreBtn) moreBtn.addEventListener("click", () => {
      shown += LIMIT;
      const firstNew = shots.find((s) => s.hidden);
      apply(true);
      firstNew?.focus({ preventScroll: true });
    });
    apply(false);
  }

  /* ================= 4. LIGHTBOX ================= */
  function lightbox() {
    const dlg = $("#lb");
    if (!dlg) return;
    const img = $(".lb-stage img", dlg);
    const cap = $(".lb-cap p", dlg);
    const cta = $(".lb-cap .btn", dlg);
    const count = $(".lb-count", dlg);
    let list = [], at = 0, opener = null;

    // a photo's own booking link wins; otherwise the group's default (set once per page)
    const describe = (a) => {
      const i = $("img", a);
      const g = a.closest("[data-lb-group]") || {};
      const gd = g.dataset || {};
      return {
        src: a.getAttribute("href"), alt: i ? i.alt : "", tag: a.dataset.tag || "",
        book: a.dataset.book || gd.book || "", label: a.dataset.bookLabel || gd.bookLabel || "",
      };
    };
    function render(dir) {
      const d = describe(list[at]);
      img.src = d.src;
      img.alt = d.alt;
      cap.innerHTML = "";
      if (d.tag) { const b = document.createElement("b"); b.textContent = d.tag; cap.append(b); }
      cap.append(document.createTextNode(d.alt));
      count.textContent = `${at + 1} / ${list.length}`;
      if (d.book) { cta.hidden = false; cta.href = d.book; cta.textContent = d.label || "Book this shoot"; }
      else cta.hidden = true;
      if (!reduced) {
        img.animate(
          [{ opacity: 0, transform: `translateX(${dir * 18}px) scale(.985)` }, { opacity: 1, transform: "none" }],
          { duration: 280, easing: EASE },
        );
      }
      [at - 1, at + 1].forEach((j) => { if (list[j]) { const p = new Image(); p.src = list[j].getAttribute("href"); } });
    }
    const go = (step) => {
      if (list.length < 2) return;
      at = (at + step + list.length) % list.length;
      render(step);
    };

    document.addEventListener("click", (e) => {
      const a = e.target.closest("[data-lb-group] a.shot");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      const group = a.closest("[data-lb-group]");
      list = $$("a.shot", group).filter((s) => !s.hidden || s.dataset.over === "1");
      at = list.indexOf(a);
      opener = a;
      render(0);
      dlg.showModal();
      // <dialog> ignores autofocus on some engines; focus the close button by hand
      $(".lb-x", dlg).focus();
    });
    $(".lb-x", dlg).addEventListener("click", () => dlg.close());
    $(".lb-prev", dlg).addEventListener("click", () => go(-1));
    $(".lb-next", dlg).addEventListener("click", () => go(1));
    dlg.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    });
    // a click on the dark backdrop around the photo closes it
    let swiped = false;
    dlg.addEventListener("click", (e) => {
      if (swiped) { swiped = false; return; }
      if (e.target === dlg || e.target.classList.contains("lb-stage")) dlg.close();
    });
    dlg.addEventListener("close", () => { img.removeAttribute("src"); opener?.focus({ preventScroll: true }); });

    // swipe: distance or a quick flick
    const stage = $(".lb-stage", dlg);
    let x0 = null, t0 = 0;
    stage.addEventListener("pointerdown", (e) => { if (e.isPrimary) { x0 = e.clientX; t0 = performance.now(); } });
    stage.addEventListener("pointerup", (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0, v = Math.abs(dx) / (performance.now() - t0);
      x0 = null;
      if (Math.abs(dx) > 60 || (Math.abs(dx) > 20 && v > 0.4)) {
        swiped = true; setTimeout(() => { swiped = false; }, 400);
        go(dx < 0 ? 1 : -1);
      }
    });
    stage.addEventListener("pointercancel", () => { x0 = null; });
  }

  /* ================= 5. SHADE SWITCHER ================= */
  function shades() {
    $$("[data-shade]").forEach((root) => {
      const frames = $$(".shade-stage img", root);
      const btns = $$(".sw", root);
      const name = $(".shade-name", root);
      btns.forEach((b, k) => b.addEventListener("click", () => {
        frames.forEach((f, j) => f.classList.toggle("on", j === k));
        btns.forEach((x, j) => x.setAttribute("aria-pressed", String(j === k)));
        if (name) name.textContent = b.dataset.name;
      }));
    });
  }

  /* ================= 6. NEXT OPENING ================= */
  function nextOpening() {
    const el = $("[data-next-open]");
    if (!el || !window.TM || !window.TM.rpc) return;
    const tz = "America/Chicago";
    const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const from = ymd(new Date());
    const to = ymd(new Date(Date.now() + 21 * 864e5));
    window.TM.rpc("bk_open_slots", { p_service: el.dataset.service, p_from: from, p_to: to })
      .then((res) => {
        const iso = (res.slots || []).find((s) => new Date(s) > new Date());
        if (!iso) return;
        const d = new Date(iso);
        const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(d);
        const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
        $("b", el).textContent = `${day} · ${time} CT`;
        el.hidden = false;
      })
      .catch(() => { /* the line just stays hidden */ });
  }

  viewfinder();
  flipbooks();
  wall();
  lightbox();
  shades();
  nextOpening();
})();
