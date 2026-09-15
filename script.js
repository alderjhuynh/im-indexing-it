(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const heroInner = document.querySelector('.hero__inner');
  const canvas = document.getElementById('bgCanvas');
  const edgeRight = document.getElementById('edgeRight');
  const marquee = document.getElementById('marquee');

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const bgCircles = (() => {
    const rand = mulberry32(2024);
    const list = [];
    const COUNT = 30;
    for (let i = 0; i < COUNT; i++) {
      list.push({
        xFrac: 0.05 + rand() * 0.9,
        yFrac: 0.06 + rand() * 0.88,
        rBase: 3 + rand() * rand() * 70,
        filled: rand() < 0.12,
        alpha: 0.1 + rand() * 0.45,
        speed: 0.15 + rand() * 0.7,
        phase: rand() * Math.PI * 2,
        lineW: 1 + rand() * 2,
      });
    }
    return list;
  })();

  let ctx2d = null;
  function resizeCanvas() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, rect.width * dpr);
    canvas.height = Math.max(1, rect.height * dpr);
    ctx2d = canvas.getContext('2d');
  }

  function drawAmbient(t) {
    if (!ctx2d) return;
    const w = canvas.width, h = canvas.height;
    ctx2d.clearRect(0, 0, w, h);
    ctx2d.strokeStyle = 'rgba(242,241,236,0.5)';
    ctx2d.fillStyle = 'rgba(242,241,236,1)';

    const scale = w / 1000;
    const breath = 0.9 + Math.sin(t * 0.25) * 0.12;

    for (const c of bgCircles) {
      const cx = w * c.xFrac, cy = h * c.yFrac;
      const wobble = Math.sin(t * c.speed + c.phase) * 0.2 + 1;
      const rad = Math.max(1, c.rBase * scale * wobble * breath);
      ctx2d.globalAlpha = c.alpha;
      if (c.filled) {
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx2d.fill();
      } else {
        ctx2d.lineWidth = c.lineW;
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx2d.stroke();
      }
    }
    ctx2d.globalAlpha = 1;

    const acx = w * 0.86, acy = h * 0.18;
    const rings = 22;
    for (let i = 0; i < rings; i++) {
      const rad = (w * 0.012) + i * (w * 0.012);
      const speed = 0.06 + (i % 4) * 0.03;
      const start = t * speed + i * 0.8;
      const len = 0.5 + 0.35 * Math.sin(i * 1.15 + t * 0.25);
      ctx2d.globalAlpha = 0.18 + 0.4 * (i / rings);
      ctx2d.lineWidth = 10;
      ctx2d.beginPath();
      ctx2d.arc(acx, acy, rad, start, start + len);
      ctx2d.stroke();
    }
    ctx2d.globalAlpha = 1;
    ctx2d.lineWidth = 1;

    ctx2d.strokeStyle = 'rgba(242,241,236,0.35)';
    ctx2d.lineWidth = Math.max(1, w * 0.0015);
    ctx2d.beginPath();
    ctx2d.moveTo(w * 0.42, 0);
    ctx2d.lineTo(w * 1.0, h * 0.58);
    ctx2d.stroke();
  }

  function ambientLoop() {
    if (canvas) drawAmbient(performance.now() / 1000);
    requestAnimationFrame(ambientLoop);
  }

  let edgeUnitHeight = 1;
  let marqueeUnitWidth = 1;

  function buildLoopedText(el, unit, vertical) {
    if (!el) return 1;
    el.textContent = unit;
    const roughUnitSize = Math.max(1, vertical ? el.scrollHeight : el.scrollWidth);
    const trackSize = vertical ? el.parentElement.clientHeight : el.parentElement.clientWidth;
    const reps = Math.max(4, Math.ceil((trackSize * 2) / roughUnitSize) + 1);
    el.textContent = unit.repeat(reps);
    const totalSize = Math.max(1, vertical ? el.scrollHeight : el.scrollWidth);
    return totalSize / reps;
  }

  function rebuildLoops() {
    edgeUnitHeight = buildLoopedText(edgeRight, '\u2014 \u2014 \u2014   ', true);
    marqueeUnitWidth = buildLoopedText(marquee, 'composer \u2014 coder \u2014 worldbuilder \u2014 girlfriend-haver \u2014   ', false);
  }

  let marqueeOffset = 0;
  let edgeOffset = 0;

  function motionLoop() {
    if (!reduceMotion) {
      marqueeOffset -= 0.5;
      const w = marqueeUnitWidth || 1;
      if (-marqueeOffset > w) marqueeOffset += w;
      if (marquee) marquee.style.transform = `translateX(${marqueeOffset}px)`;

      edgeOffset -= 0.4;
      const h = edgeUnitHeight || 1;
      if (-edgeOffset > h) edgeOffset += h;
      if (edgeRight) edgeRight.style.transform = `translateY(${edgeOffset}px)`;
    }
    requestAnimationFrame(motionLoop);
  }

  function handleResize() {
    resizeCanvas();
    rebuildLoops();
  }
  window.addEventListener('resize', handleResize);
  resizeCanvas();
  rebuildLoops();
  requestAnimationFrame(ambientLoop);
  requestAnimationFrame(motionLoop);

  const clockEl = document.getElementById('clock');
  function updateClock() {
    if (!clockEl) return;
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    clockEl.textContent = `${h}:${m}`;
  }
  updateClock();
  setInterval(updateClock, 15000);

  let ticking = false;
  function updateHero() {
    ticking = false;
    if (!heroInner || reduceMotion) return;
    const vh = window.innerHeight;
    const progress = Math.min(Math.max(window.scrollY / (vh * 0.9), 0), 1);
    heroInner.style.opacity = String(1 - progress);
    heroInner.style.transform = `translateY(${progress * -40}px)`;
  }
  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(updateHero);
      ticking = true;
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  updateHero();

  const revealTargets = document.querySelectorAll(
    '.about__grid, .section-lede, .link-list, .socials'
  );
  revealTargets.forEach(el => el.classList.add('reveal'));

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
  revealTargets.forEach(el => io.observe(el));

  const navLinks = document.querySelectorAll('.nav__link');
  const sections = ['home', 'about', 'domains', 'links', 'contact']
    .map(id => document.getElementById(id))
    .filter(Boolean);

  const sectionIO = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(link => {
          link.classList.toggle('is-active', link.dataset.section === id);
        });
      }
    });
  }, { threshold: 0.5 });
  sections.forEach(sec => sectionIO.observe(sec));

  const navToggle = document.getElementById('navToggle');
  const navLinksWrap = document.getElementById('navLinks');
  if (navToggle && navLinksWrap) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinksWrap.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    navLinksWrap.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navLinksWrap.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  const nothingLink = document.getElementById('nothingElse');
  const nothingOverlay = document.getElementById('nothingOverlay');
  const nothingClose = document.getElementById('nothingOverlayClose');

  if (nothingLink && nothingOverlay && nothingClose) {
    const openOverlay = () => {
      nothingOverlay.hidden = false;
      requestAnimationFrame(() => nothingOverlay.classList.add('is-open'));
    };
    const closeOverlay = () => {
      nothingOverlay.classList.remove('is-open');
      setTimeout(() => { nothingOverlay.hidden = true; }, 300);
      nothingLink.focus();
    };

    nothingLink.addEventListener('click', (e) => {
      e.preventDefault();
      openOverlay();
      nothingClose.focus();
    });
    nothingClose.addEventListener('click', closeOverlay);
    nothingOverlay.addEventListener('click', (e) => {
      if (e.target === nothingOverlay) closeOverlay();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !nothingOverlay.hidden) closeOverlay();
    });
  }

  const previewBtn = document.getElementById('previewSignal');
  const listenOverlay = document.getElementById('listenOverlay');
  const listenClose = document.getElementById('listenOverlayClose');
  const listenFrame = document.getElementById('listenFrame');
  const LISTEN_SRC = 'https://music.auraea.fyi';

  if (previewBtn && listenOverlay && listenClose && listenFrame) {
    const openListen = () => {
      listenFrame.src = LISTEN_SRC;
      listenOverlay.hidden = false;
      requestAnimationFrame(() => listenOverlay.classList.add('is-open'));
      listenClose.focus();
    };
    const closeListen = () => {
      listenOverlay.classList.remove('is-open');
      setTimeout(() => {
        listenOverlay.hidden = true;
        listenFrame.src = 'about:blank';
      }, 300);
      previewBtn.focus();
    };

    previewBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openListen();
    });
    listenClose.addEventListener('click', closeListen);
    listenOverlay.addEventListener('click', (e) => {
      if (e.target === listenOverlay) closeListen();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !listenOverlay.hidden) closeListen();
    });
  }

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const finePrint = document.getElementById('finePrint');
  const finePrintText = document.getElementById('finePrintText');
  if (finePrint && finePrintText) {
    const originalMarkup = finePrintText.innerHTML;
    let isFlashing = false;

    const runFlagFlash = () => {
      if (isFlashing) return;
      isFlashing = true;
      finePrint.classList.add('is-flashing');

      setTimeout(() => {
        finePrintText.innerHTML = originalMarkup;
        finePrint.classList.remove('is-flashing');
      }, 2100);

      setTimeout(() => { isFlashing = false; }, 2600);
    };

    finePrint.addEventListener('click', (e) => {
      if (e.target.closest('#copyrightMark')) runFlagFlash();
    });
    finePrint.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('#copyrightMark')) {
        e.preventDefault();
        runFlagFlash();
      }
    });
  }
})();
