/* TAYLORMADE/CREATIVE — shared site behavior
   film-leader intro · nav · scroll reveals · film facades · footer year */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- film-leader countdown (once per session, index only) ---------- */
  const leader = $("#leader");
  const hero = $(".hero");
  function armHero() { if (hero) hero.classList.add("armed"); }

  // storage can throw under "block all cookies" — never let that kill the page
  let leaderSeen = true;
  try {
    leaderSeen = !!sessionStorage.getItem("tm-leader");
    sessionStorage.setItem("tm-leader", "1");
  } catch (_) { leaderSeen = true; }

  if (leader && !reduced && !leaderSeen) {
    const num = $("#leaderNum");
    const sweep = $("#leaderSweep");
    const flash = $("#leaderFlash");
    const stills = [
      "assets/img/toni-guy-editorial.jpg",
      "assets/img/fashion-30.jpg",
      "assets/img/jordan-iv.jpg",
      "assets/img/goldwell-1.jpg",
      "assets/img/beauty-sunglasses.jpg",
      "assets/img/sports-portrait.jpg",
    ];
    stills.forEach((s) => { const i = new Image(); i.src = s; });

    let n = 3;
    const beat = 620; // ms per count
    const tick = () => {
      if (n === 0) { finish(); return; }
      num.textContent = n;
      sweep.style.transition = "none";
      sweep.style.strokeDashoffset = "289";
      requestAnimationFrame(() => requestAnimationFrame(() => {
        sweep.style.transition = `stroke-dashoffset ${beat}ms linear`;
        sweep.style.strokeDashoffset = "0";
      }));
      const img = stills[(3 - n) % stills.length];
      flash.style.backgroundImage = `url(${img})`;
      flash.classList.add("on");
      setTimeout(() => flash.classList.remove("on"), beat * 0.55);
      n--;
      setTimeout(tick, beat);
    };
    const finish = () => { leader.classList.add("done"); armHero(); };
    leader.addEventListener("click", finish, { once: true });
    setTimeout(tick, 220);
    setTimeout(finish, beat * 4 + 700); // hard stop, never traps the page
  } else {
    if (leader) leader.classList.add("done");
    armHero();
  }

  /* ---------- nav ---------- */
  const nav = $(".nav");
  const burger = $("#burger");
  // one place opens/closes the full-screen menu: class, aria state, and the
  // page behind it made inert so Tab can't wander under the overlay
  const setMenu = (open) => {
    if (!nav || !burger) return;
    nav.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", String(open));
    [...document.body.children].forEach((el) => { if (el !== nav) el.inert = open; });
    if (!open) closeDrops();
  };
  if (burger) {
    burger.setAttribute("aria-expanded", "false");
    burger.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
    // widening past the burger breakpoint must never leave the page inert
    matchMedia("(min-width: 1100px)").addEventListener("change", (e) => { if (e.matches) setMenu(false); });
  }
  $$(".nav-links a").forEach((a) => a.addEventListener("click", () => setMenu(false)));

  /* Photography dropdown: a disclosure button. Click/tap toggles everywhere;
     a real mouse on the desktop bar also opens it on hover. */
  const canHover = () => matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1100px)").matches;
  $$(".nav-drop").forEach((drop) => {
    const btn = drop.querySelector(".nav-drop-btn");
    const items = () => [...drop.querySelectorAll(".nav-drop-panel a")];
    let leaveT, hoverOpenedAt = 0;
    const setOpen = (open) => {
      drop.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
    };
    btn.addEventListener("click", () => {
      // a mouse user who hovered it open and then clicks means "yes, this menu",
      // not "close it again"
      if (drop.classList.contains("open") && Date.now() - hoverOpenedAt < 1500) { hoverOpenedAt = 0; return; }
      setOpen(!drop.classList.contains("open"));
    });
    drop.addEventListener("keydown", (e) => {
      const list = items(), i = list.indexOf(document.activeElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (document.activeElement === btn) { setOpen(true); list[0]?.focus(); }
        else if (i >= 0) list[(i + 1) % list.length].focus();
      }
      if (e.key === "ArrowUp" && i >= 0) { e.preventDefault(); i === 0 ? btn.focus() : list[i - 1].focus(); }
    });
    drop.addEventListener("mouseenter", () => {
      if (!canHover()) return;
      clearTimeout(leaveT);
      if (!drop.classList.contains("open")) hoverOpenedAt = Date.now();
      setOpen(true);
    });
    drop.addEventListener("mouseleave", () => { if (canHover()) leaveT = setTimeout(() => setOpen(false), 180); });
    // in the desktop bar (mouse or touch), tabbing out of the menu closes it
    drop.addEventListener("focusout", (e) => {
      if (matchMedia("(min-width: 1100px)").matches && !drop.contains(e.relatedTarget)) setOpen(false);
    });
    document.addEventListener("click", (e) => { if (!drop.contains(e.target)) setOpen(false); });
    drop.querySelectorAll(".nav-drop-panel a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
  });
  const closeDrops = () => $$(".nav-drop.open").forEach((d) => {
    d.classList.remove("open");
    d.querySelector(".nav-drop-btn")?.setAttribute("aria-expanded", "false");
  });
  // Esc, wherever focus is: first closes an open Photography list (even one
  // opened by hover), then the full-screen menu
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = $$(".nav-drop.open");
    if (open.length) {
      open.forEach((d) => {
        const b = d.querySelector(".nav-drop-btn");
        const hadFocus = d.contains(document.activeElement);
        d.classList.remove("open");
        b?.setAttribute("aria-expanded", "false");
        if (hadFocus) b?.focus();
      });
      return;
    }
    if (nav?.classList.contains("open")) { setMenu(false); burger?.focus(); }
  });

  let lastY = 0;
  addEventListener("scroll", () => {
    const y = scrollY;
    if (nav && !nav.classList.contains("open")) {
      const hide = y > 140 && y > lastY;
      nav.classList.toggle("is-hidden", hide);
      if (hide) closeDrops();   // never leave a panel floating under a hidden bar
    }
    lastY = y;
  }, { passive: true });

  /* ---------- scroll reveals ---------- */
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  $$(".reveal").forEach((el) => io.observe(el));

  /* ---------- film facades: swap to YouTube iframe on click ---------- */
  $$(".film[data-yt]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.yt;
      el.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0"
        title="${el.dataset.title || "Video player"}" loading="lazy"
        allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    }, { once: true });
    // role="button" needs real keyboard activation
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); }
    });
  });

  /* ---------- hero reel: respect data-saver + reduced motion ---------- */
  const hv = $("#heroVid");
  if (hv && (navigator.connection?.saveData || reduced)) hv.remove();

  /* ---------- newsletter signup (footer) ---------- */
  const newsForm = $("#newsForm");
  if (newsForm && window.TM?.rpc) {
    newsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#newsEmail").value.trim();
      const msg = $("#newsMsg");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = "ENTER A VALID EMAIL"; return; }
      msg.textContent = "…";
      try {
        await window.TM.rpc("bk_subscribe", { p_email: email, p_source: "website" });
        msg.textContent = "YOU'RE IN — TALK SOON";
        newsForm.querySelector("input").value = "";
      } catch (_) {
        msg.textContent = "DIDN'T GO THROUGH — TRY AGAIN";
      }
    });
  }

  /* ---------- year ---------- */
  const y = $("#year"); if (y) y.textContent = new Date().getFullYear();
})();
