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

  if (leader && !reduced && !sessionStorage.getItem("tm-leader")) {
    sessionStorage.setItem("tm-leader", "1");
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
  if (burger) burger.addEventListener("click", () => nav.classList.toggle("open"));
  $$(".nav-links a").forEach((a) => a.addEventListener("click", () => nav.classList.remove("open")));
  let lastY = 0;
  addEventListener("scroll", () => {
    const y = scrollY;
    if (nav && !nav.classList.contains("open")) {
      nav.classList.toggle("is-hidden", y > 140 && y > lastY);
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
  });

  /* ---------- year ---------- */
  const y = $("#year"); if (y) y.textContent = new Date().getFullYear();
})();
