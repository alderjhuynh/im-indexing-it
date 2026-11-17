(() => {
  'use strict';
  if (window.Dock) return;

  const ICONS = {
    github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2.500 6.500 12 13l9.500-6.500"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    discord: '<path fill="currentColor" stroke="none" d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>',
  };

  const TABS = [
    {
      id: 'github',
      title: 'GitHub',
      blurb: 'alderjhuynh',
      href: 'https://github.com/alderjhuynh',
      icon: ICONS.github,
      order: 10,
    },
    {
      id: 'login',
      title: 'Login',
      blurb: 'via Discord',
      href: '/api/login',
      icon: ICONS.discord,
      rel: 'external',
      order: 20,
    },

    {
      enabled: false,
      id: 'template',
      title: 'Your title',
      blurb: 'a short line about it',
      href: 'https://example.com',
      icon: ICONS.star,
      order: 99,
    },
  ];

  const GAP_FALLBACK = 12;

  const root = document.createElement('div');
  root.className = 'dock';
  root.setAttribute('role', 'complementary');
  root.setAttribute('aria-label', 'Quick links');
  document.body.appendChild(root);

  const entries = [];
  const byEl = new Map();

  const gap = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-gap')) || GAP_FALLBACK;

  function layout() {
    const g = gap();
    let y = 0;
    for (const t of entries) {
      if (!t.visible) continue;
      if (t.snap) {
        const el = t.el;
        el.style.transition = 'none';
        el.style.setProperty('--ty', y + 'px');
        void el.offsetWidth;
        el.style.transition = '';
        t.snap = false;
      } else {
        t.el.style.setProperty('--ty', y + 'px');
      }
      y += t.el.offsetHeight + g;
    }
  }

  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => layout()) : null;
  window.addEventListener('resize', layout);

  function add(el, opts) {
    if (byEl.has(el)) return;
    const t = { el, order: (opts && opts.order) || 0, visible: false, snap: true };
    entries.push(t);
    entries.sort((a, b) => a.order - b.order);
    byEl.set(el, t);
    el.classList.add('tab', 'is-away');
    el.inert = true;
    root.appendChild(el);
    if (ro) ro.observe(el);
    if (opts && opts.visible) setVisible(el, true);
  }

  function setVisible(el, show) {
    const t = byEl.get(el);
    if (!t || t.visible === !!show) return;
    t.visible = !!show;
    if (show) t.snap = true;
    layout();
    el.classList.toggle('is-away', !show);
    el.inert = !show;
    if (!show) el.classList.remove('is-open', 'is-hold');
  }

  function peekable(el) {
    let timer = 0;
    let swallow = false;
    const open = () => { clearTimeout(timer); el.classList.add('is-open'); };
    const closeSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (!el.matches(':hover')) el.classList.remove('is-open'); }, 280);
    };
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') open(); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') closeSoon(); });

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || el.classList.contains('is-open')) return;
      swallow = true;
      setTimeout(() => { swallow = false; }, 500);
      open();
    }, true);
    el.addEventListener('click', (e) => {
      if (!swallow) return;
      swallow = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' && !el.contains(e.target)) el.classList.remove('is-open');
    });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
      el.classList.remove('is-open');
    });
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function build(cfg) {
    const a = document.createElement('a');
    a.className = 'tab-link';
    a.dataset.tab = cfg.id;
    a.href = cfg.href;
    const external = cfg.external != null ? cfg.external : /^https?:/i.test(cfg.href) && new URL(cfg.href, location.href).origin !== location.origin;
    if (external) { a.target = '_blank'; a.rel = 'noopener noreferrer external'; }
    else if (cfg.rel) a.rel = cfg.rel;
    if (cfg.width) a.style.setProperty('--w', cfg.width + 'px');
    a.innerHTML = `
      <span class="tab-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${cfg.icon || ICONS.link}</svg></span>
      <span class="tab-text"><b>${esc(cfg.title)}</b>${cfg.blurb ? `<small>${esc(cfg.blurb)}</small>` : ''}</span>`;
    return a;
  }

  window.Dock = { add, setVisible, layout, icons: ICONS };

  const live = TABS.filter((c) => c.enabled !== false);
  live.forEach((cfg) => {
    const el = build(cfg);
    add(el, { order: cfg.order == null ? 10 : cfg.order });
    peekable(el);
  });
  live.forEach((cfg, i) => {
    const el = root.querySelector(`[data-tab="${cfg.id}"]`);
    setTimeout(() => setVisible(el, true), 350 + i * 110);
  });

  // Login tab — same flow as the stamp card: /api/card tells us who we are,
  // /api/login starts the Discord OAuth, /api/logout ends the session.
  const loginTab = root.querySelector('[data-tab="login"]');
  if (loginTab) {
    const loginCfg = TABS.find((t) => t.id === 'login') || {};
    const iconEl = loginTab.querySelector('.tab-icon');
    const glyph = iconEl.querySelector('svg');
    const titleEl = loginTab.querySelector('.tab-text b');
    const blurbEl = loginTab.querySelector('.tab-text small');
    const IDLE = { title: loginCfg.title || 'Login', blurb: loginCfg.blurb || 'via Discord' };
    let me = { loggedIn: false };
    let busy = false;

    function render() {
      const on = !!me.loggedIn;
      loginTab.classList.toggle('is-me', on);
      titleEl.textContent = on && me.name ? me.name : IDLE.title;
      blurbEl.textContent = on ? (busy ? 'logging out…' : 'logged in — tap to log out') : IDLE.blurb;
      loginTab.setAttribute('aria-label', on ? 'Log out of Discord' : 'Log in with Discord');

      let img = iconEl.querySelector('img');
      if (on && me.avatar) {
        if (!img) {
          img = document.createElement('img');
          img.alt = '';
          img.referrerPolicy = 'no-referrer';
          iconEl.insertBefore(img, glyph);
        }
        if (img.getAttribute('src') !== me.avatar) img.src = me.avatar;
      } else if (img) {
        img.remove();
      }
    }

    async function check() {
      try {
        const res = await fetch('/api/card', { credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) return;
        me = (await res.json()).me || { loggedIn: false };
        render();
      } catch (_) { /* offline: keep whatever we last knew */ }
    }

    async function logout() {
      if (busy) return;
      busy = true;
      render();
      try {
        await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
        me = { loggedIn: false };
      } catch (_) { /* re-check below to find out the truth */ }
      busy = false;
      render();
      check();
    }

    loginTab.addEventListener('click', (e) => {
      if (!me.loggedIn || busy) return;
      e.preventDefault(); // swallow the /api/login link while signed in
      logout();
    });

    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });

    render();
    check();
  }
})();
