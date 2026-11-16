(() => {
  'use strict';
  if (window.Site) return;

  const registry = new Map();
  const loaded = new Set();
  let cleanups = [];
  let navId = 0;

  const key = (u) => u.pathname + u.search;
  let here = key(location);
  let entryId = null;
  const uid = () => Math.random().toString(36).slice(2);

  const Site = {
    page(fn) {
      const s = document.currentScript;
      if (s && s.src) registry.set(s.src, fn);
    },
    go(href) { navigate(new URL(href, location.href).href); },
  };
  window.Site = Site;

  const enabled = /^https?:$/.test(location.protocol) && 'pushState' in history;

  const saveScroll = () => {
    try { sessionStorage.setItem('site-y:' + entryId, String(Math.round(window.scrollY))); } catch (_) { }
  };
  const loadScroll = (id) => {
    try {
      const v = sessionStorage.getItem('site-y:' + id);
      return v == null ? null : +v;
    } catch (_) { return null; }
  };
  const toY = (y) => window.scrollTo({ top: y, left: 0, behavior: 'instant' });

  const mountScripts = (urls) => {
    for (const u of urls) {
      const fn = registry.get(u);
      if (!fn) continue;
      try {
        const c = fn();
        if (typeof c === 'function') cleanups.push(c);
      } catch (err) { console.error(err); }
    }
  };
  const unmount = () => {
    const list = cleanups;
    cleanups = [];
    for (const fn of list.reverse()) {
      try { fn(); } catch (err) { console.error(err); }
    }
    document.documentElement.classList.remove('is-grabbing');
  };

  const hasScript = (src) => loaded.has(src) || [...document.scripts].some((s) => s.src === src);
  const loadScript = (src) => new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { loaded.add(src); ok(); };
    s.onerror = () => no(new Error('script failed: ' + src));
    document.body.appendChild(s);
  });
  const loadCss = (href) => new Promise((ok, no) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.onload = () => ok();
    l.onerror = () => no(new Error('css failed: ' + href));
    document.head.appendChild(l);
  });

  async function navigate(href, opts) {
    const push = !opts || opts.push !== false;
    const fallback = () => { if (push) location.assign(href); else location.reload(); };
    const id = ++navId;

    let doc, final;
    try {
      const res = await fetch(href, { headers: { Accept: 'text/html' } });
      if (id !== navId) return;
      final = new URL(res.url);
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.includes('text/html') || final.origin !== location.origin) throw new Error('not a page');
      doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      if (id !== navId) return;
      if (!doc.querySelector('main')) throw new Error('no <main>');
    } catch (_) {
      if (id === navId) fallback();
      return;
    }

    const cssWanted = [...doc.querySelectorAll('link[rel~="stylesheet"]')]
      .map((l) => new URL(l.getAttribute('href'), final).href);
    const jsWanted = [...doc.querySelectorAll('script[src]')]
      .map((s) => new URL(s.getAttribute('src'), final).href);

    try {
      for (const src of jsWanted) if (!hasScript(src)) await loadScript(src);
      const have = new Set([...document.head.querySelectorAll('link[rel~="stylesheet"]')].map((l) => l.href));
      await Promise.all(cssWanted.filter((h) => !have.has(h)).map(loadCss));
    } catch (_) {
      if (id === navId) fallback();
      return;
    }
    if (id !== navId) return;

    try {
      saveScroll();
      unmount();

      if (push) {
        entryId = uid();
        history.pushState({ id: entryId }, '', final.href);
      } else {
        const st = history.state;
        entryId = st && st.id;
        if (!entryId) {
          entryId = uid();
          history.replaceState({ id: entryId }, '');
        }
      }
      here = key(final);

      document.title = doc.title;
      for (const sel of ['meta[name="description"]', 'meta[name="theme-color"]']) {
        const from = doc.querySelector(sel), to = document.querySelector(sel);
        if (from && to) to.setAttribute('content', from.getAttribute('content'));
      }

      for (const l of document.head.querySelectorAll('link[rel~="stylesheet"]')) {
        if (!cssWanted.includes(l.href)) l.remove();
      }

      const next = document.importNode(doc.querySelector('main'), true);
      document.querySelector('main').replaceWith(next);

      mountScripts(jsWanted);

      next.setAttribute('tabindex', '-1');
      next.focus({ preventScroll: true });

      const anchor = final.hash && document.getElementById(decodeURIComponent(final.hash.slice(1)));
      if (anchor) anchor.scrollIntoView();
      else toY(push ? 0 : (loadScroll(entryId) || 0));
    } catch (err) {
      console.error(err);
      fallback();
    }
  }

  if (enabled) {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const st0 = history.state;
    entryId = (st0 && st0.id) || uid();
    if (!st0 || !st0.id) history.replaceState({ ...(st0 && typeof st0 === 'object' ? st0 : {}), id: entryId }, '');
    window.addEventListener('pagehide', saveScroll);
  }

  const pinUrls = () => {
    for (const el of document.querySelectorAll('link[rel~="stylesheet"][href], script[src]')) {
      const attr = el.localName === 'link' ? 'href' : 'src';
      el.setAttribute(attr, el[attr]);
    }
  };

  const boot = () => {
    pinUrls();
    mountScripts([...document.scripts].map((s) => s.src).filter(Boolean));
    if (!enabled) return;
    const y = loadScroll(entryId);
    if (y) toY(y);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  if (!enabled) { Site.go = (href) => location.assign(href); return; }

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a instanceof SVGElement) return;
    if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    if ((a.getAttribute('rel') || '').split(/\s+/).includes('external')) return;

    const url = new URL(a.href, location.href);
    if (!/^https?:$/.test(url.protocol) || url.origin !== location.origin) return;
    if (/\.[a-z0-9]+$/i.test(url.pathname) && !/\.html?$/i.test(url.pathname)) return;

    if (key(url) === here) {
      if (url.hash) return;
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    e.preventDefault();
    navigate(url.href);
  });

  window.addEventListener('popstate', () => {
    const url = new URL(location.href);
    if (key(url) === here) {
      if (history.state && history.state.id) entryId = history.state.id;
      return;
    }
    navigate(url.href, { push: false });
  });
})();
