(() => {
  'use strict';

  const USER = 'alderjhuynh';
  const LIMIT = 5;
  const TTL_MS = 10 * 60 * 1000;
  const CACHE_KEY = 'gh-feed-v1:' + USER;
  const API = 'https://api.github.com';

  const readCache = () => {
    try { return JSON.parse(sessionStorage.getItem(CACHE_KEY)); } catch (_) { return null; }
  };
  const writeCache = (items) => {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), items })); } catch (_) { }
  };

  async function viaSearch(signal) {
    const q = encodeURIComponent('author:' + USER);
    const res = await fetch(`${API}/search/commits?q=${q}&sort=author-date&order=desc&per_page=${LIMIT}`, { signal });
    if (!res.ok) throw new Error('search ' + res.status);
    const json = await res.json();
    return (json.items || []).map((i) => ({
      msg: i.commit && i.commit.message,
      url: i.html_url,
      repo: i.repository && i.repository.full_name,
      date: i.commit && i.commit.author && i.commit.author.date,
      sha: String(i.sha || '').slice(0, 7),
    }));
  }

  // fallback
  async function viaEvents(signal) {
    const res = await fetch(`${API}/users/${USER}/events/public?per_page=30`, { signal });
    if (!res.ok) throw new Error('events ' + res.status);
    const events = await res.json();
    return events
      .filter((e) => e.type === 'PushEvent' && e.payload && e.payload.head)
      .slice(0, LIMIT)
      .map((e) => {
        const cs = e.payload.commits;
        return {
          msg: cs && cs.length ? cs[cs.length - 1].message : null,
          branch: String(e.payload.ref || '').replace('refs/heads/', ''),
          url: `https://github.com/${e.repo.name}/commit/${e.payload.head}`,
          repo: e.repo.name,
          date: e.created_at,
          sha: String(e.payload.head).slice(0, 7),
        };
      });
  }

  const rtf = window.Intl && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }) : null;
  const UNITS = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  function ago(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const secs = (d - Date.now()) / 1000;
    if (!rtf) return d.toLocaleDateString();
    for (const [unit, size] of UNITS) {
      if (Math.abs(secs) >= size) return rtf.format(Math.round(secs / size), unit);
    }
    return 'just now';
  }

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  Site.page(() => {
    const list = document.getElementById('commits');
    if (!list) return;

    const ac = new AbortController();
    let alive = true;

    const note = (text) => {
      list.replaceChildren(el('li', 'gh-note', text));
    };

    function render(items) {
      if (!items.length) { note('nothing in the oven right now'); return; }
      const frag = document.createDocumentFragment();
      for (const it of items) {
        const li = document.createElement('li');
        const a = el('a', 'commit');
        a.href = it.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer external';

        const firstLine = it.msg ? it.msg.split('\n')[0].trim() : '';
        a.append(el('span', 'c-msg', firstLine || (it.branch ? 'pushed to ' + it.branch : 'pushed some changes')));

        const meta = el('span', 'c-meta');
        const repo = it.repo ? (it.repo.startsWith(USER + '/') ? it.repo.slice(USER.length + 1) : it.repo) : '';
        if (repo) meta.append(el('span', 'c-repo', repo));
        if (it.date) {
          const t = el('time', null, ago(it.date));
          t.dateTime = it.date;
          t.title = new Date(it.date).toLocaleString();
          meta.append(t);
        }
        if (it.sha) meta.append(el('span', 'c-sha', it.sha));
        a.append(meta);

        li.append(a);
        frag.append(li);
      }
      list.replaceChildren(frag);
    }

    async function load() {
      const cached = readCache();
      if (cached && Array.isArray(cached.items) && Date.now() - cached.t < TTL_MS) {
        render(cached.items);
        return;
      }
      note('warming up the oven...');

      let items = null;
      try { items = await viaSearch(ac.signal); } catch (_) { }
      if (!alive) return;
      if (!items || !items.length) {
        try { items = await viaEvents(ac.signal); } catch (_) { }
        if (!alive) return;
      }

      if (items && items.length) {
        writeCache(items);
        render(items);
      } else if (cached && Array.isArray(cached.items) && cached.items.length) {
        render(cached.items); // stale beats empty
      } else {
        note("couldn't reach GitHub just now, try the button above!");
      }
    }

    load();

    return () => {
      alive = false;
      ac.abort();
    };
  });
})();
