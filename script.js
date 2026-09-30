(() => {
  const THEME_ALIASES = { impact: 'cocoa', desert: 'cream' };
  const VALID_THEMES = new Set(['cocoa', 'cream']);
  let currentTheme = 'cocoa';

  function normalizeTheme(raw){
    if (!raw) return null;
    const n = raw.trim().toLowerCase();
    const aliased = THEME_ALIASES[n] || n;
    return VALID_THEMES.has(aliased) ? aliased : null;
  }

  function getThemeFromURL(){
    try{
      const params = new URLSearchParams(window.location.search);
      return normalizeTheme(params.get('theme'));
    }catch(_){ return null; }
  }

  function getSystemTheme(){
    try{
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'cream' : 'cocoa';
    }catch(_){ return 'cocoa'; }
  }

  function applyTheme(theme){
    const normalized = normalizeTheme(theme) || getSystemTheme();
    document.body.dataset.theme = normalized;
    currentTheme = normalized;
  }

  function initTheme(){
    const urlTheme = getThemeFromURL();
    if (urlTheme){
      applyTheme(urlTheme);
    } else {
      applyTheme(getSystemTheme());
    }
  }
  initTheme();

  try{
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const onSystemChange = () => {
      if (!getThemeFromURL()) applyTheme(getSystemTheme());
    };
    if (mql.addEventListener) mql.addEventListener('change', onSystemChange);
    else if (mql.addListener) mql.addListener(onSystemChange);
  }catch(_){}

  window.addEventListener('popstate', () => {
    const urlTheme = getThemeFromURL();
    if (urlTheme){
      if (urlTheme !== currentTheme) applyTheme(urlTheme);
    } else {
      const sys = getSystemTheme();
      if (sys !== currentTheme) applyTheme(sys);
    }
  });

  const revealTargets = document.querySelectorAll(
    '.about__grid, .section-lede, .link-list'
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

  // In-site audio: preview Signal (music.auraea.fyi) in an overlay iframe
  // so playback stays on this page instead of navigating away.
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
