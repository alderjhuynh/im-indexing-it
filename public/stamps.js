(() => {
  'use strict';

  const POLL_MS = 20000;
  const IDLE_MS = 60000;
  const FALLBACK_SIZE = 10;
  const ICON_LABEL = { heart: 'heart', star: 'star', mug: 'coffee mug', flower: 'flower', moon: 'moon', cat: 'cat' };
  const ERRORS = {
    slot_taken: 'someone just grabbed that spot. pick another!',
    already_stamped: 'you already stamped this card. thank you!',
    card_full: 'this card just filled up!',
  };
  const LOGIN_NOTES = {
    ok: "you're in! pick a stamp, then tap a circle.",
    denied: 'login cancelled. no stamp added.',
    error: "discord login didn't work. try again?",
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private mode etc. */ } },
  };

  Site.page(() => {
    const wrap = document.getElementById('stamps');
    const msg = document.getElementById('free');
    const pickerEl = document.getElementById('stampPicker');
    const authEl = document.getElementById('stampAuth');
    if (!wrap || !msg || !pickerEl || !authEl) return;
    const panel = wrap.closest('.loyalty');

    const ac = new AbortController();
    const { signal } = ac;

    let data = null;
    let failed = false;
    let loading = false;
    let busy = false;
    let note = '';
    let noteTimer = 0;
    let wasComplete = null;
    let authSig = '';
    let icon = store.get('stamp-icon', 'heart');
    let anon = store.get('stamp-anon', '0') === '1';

    let lastActivity = Date.now();
    const bump = () => { lastActivity = Date.now(); };
    for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'])
      document.addEventListener(ev, bump, { passive: true, signal });
    const idle = () => Date.now() - lastActivity > IDLE_MS;

    const canStamp = () => !!(data && data.me.loggedIn && !data.youStamped && !data.complete);

    function buildSlots(size) {
      wrap.replaceChildren();
      for (let i = 0; i < size; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'stamp';
        const ic = document.createElement('i');
        ic.className = 'ic';
        b.appendChild(ic);
        wrap.appendChild(b);
      }
    }

    function renderSlots() {
      const size = data ? data.size : FALLBACK_SIZE;
      if (wrap.children.length !== size) buildSlots(size);
      const bySlot = new Map((data ? data.stamps : []).map((s) => [s.slot, s]));
      const can = canStamp();

      [...wrap.children].forEach((b, i) => {
        const s = bySlot.get(i);
        const ic = b.firstElementChild;
        ic.dataset.ic = s ? s.icon : icon;

        b.classList.toggle('on', !!s);
        b.classList.toggle('mine', !!(s && s.mine));
        b.classList.toggle('anon', !!(s && s.anonymous));
        if (!s && can) b.dataset.can = ''; else delete b.dataset.can;

        let av = b.querySelector('.av');
        if (s && s.avatar) {
          if (!av) {
            av = document.createElement('img');
            av.className = 'av';
            av.alt = '';
            av.loading = 'lazy';
            av.referrerPolicy = 'no-referrer';
            b.appendChild(av);
          }
          if (av.getAttribute('src') !== s.avatar) av.src = s.avatar;
        } else if (av) {
          av.remove();
        }

        b.setAttribute('aria-label', s
          ? 'Stamp ' + (i + 1) + ', stamped by ' + (s.mine ? 'you' : s.name || 'someone anonymous')
          : 'Stamp ' + (i + 1) + ', empty' + (can ? ', press to stamp it' : ''));
      });
    }

    function renderPicker() {
      const show = canStamp();
      pickerEl.hidden = !show;
      if (!show) return;

      if (!pickerEl.dataset.built) {
        pickerEl.setAttribute('role', 'group');
        pickerEl.setAttribute('aria-label', 'Choose your stamp');
        for (const name of data.icons) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'pick';
          b.dataset.icon = name;
          b.setAttribute('aria-label', ICON_LABEL[name] || name);
          const ic = document.createElement('i');
          ic.className = 'ic';
          ic.dataset.ic = name;
          b.appendChild(ic);
          pickerEl.appendChild(b);
        }
        const label = document.createElement('label');
        label.className = 'anon-opt';
        const box = document.createElement('input');
        box.type = 'checkbox';
        label.append(box, document.createTextNode('stamp anonymously'));
        pickerEl.appendChild(label);
        pickerEl.dataset.built = '1';
      }
      if (!data.icons.includes(icon)) icon = data.icons[0];
      for (const b of pickerEl.querySelectorAll('.pick')) b.setAttribute('aria-pressed', String(b.dataset.icon === icon));
      pickerEl.querySelector('input').checked = anon;
    }

    function renderAuth() {
      const me = data && data.me;
      const sig = JSON.stringify([!!data, me && me.loggedIn, me && me.name, me && me.avatar, data && data.devLogin]);
      if (sig === authSig) return;
      authSig = sig;
      authEl.replaceChildren();
      if (!data) return;

      if (me.loggedIn) {
        const who = document.createElement('span');
        who.className = 'me';
        if (me.avatar) {
          const img = document.createElement('img');
          img.src = me.avatar;
          img.alt = '';
          img.referrerPolicy = 'no-referrer';
          who.appendChild(img);
        }
        const strong = document.createElement('strong');
        strong.textContent = me.name;
        who.append(document.createTextNode('stamping as '), strong);
        const out = document.createElement('button');
        out.type = 'button';
        out.className = 'quiet';
        out.dataset.act = 'logout';
        out.textContent = 'log out';
        authEl.append(who, out);
      } else {
        const a = document.createElement('a');
        a.className = 'btn alt sm';
        a.href = '/api/login';
        a.rel = 'external';
        a.textContent = 'Log in with Discord';
        authEl.appendChild(a);
      }

      if (data.devLogin) {
        for (const name of ['alice', 'bob', 'carol']) {
          const a = document.createElement('a');
          a.className = 'quiet';
          a.href = '/api/dev/login?as=' + name;
          a.rel = 'external';
          a.textContent = 'dev: ' + name;
          authEl.appendChild(a);
        }
      }
    }

    function nextCardText() {
      if (!data || !data.nextCardAt) return '';
      const ms = data.nextCardAt - Date.now();
      if (ms <= 0) return '';
      return ms >= 3.6e6
        ? ' (new card in ' + Math.ceil(ms / 3.6e6) + 'h)'
        : ' (new card in ' + Math.max(1, Math.ceil(ms / 6e4)) + ' min)';
    }

    function renderMsg() {
      let text;
      if (note) text = note;
      else if (!data) text = failed ? "can't reach the card right now. try refreshing!" : 'warming up the stamp…';
      else if (data.complete) text = "now wasn't that fun?" + nextCardText();
      else {
        const n = data.count + ' / ' + data.size + ' stamps';
        text = !data.me.loggedIn ? n + '. log in to add yours!'
          : data.youStamped ? n + '. yours is on there, thank you!'
          : n + '. pick a stamp, then tap a circle!';
      }
      if (msg.textContent !== text) msg.textContent = text;
    }

    function render() {
      renderSlots();
      renderPicker();
      renderAuth();
      renderMsg();
      if (panel) {
        if (data && wasComplete === false && data.complete) {
          panel.classList.add('done');
          setTimeout(() => panel.classList.remove('done'), 900);
        }
        panel.dataset.complete = data && data.complete ? '1' : '';
      }
      wasComplete = data ? data.complete : wasComplete;
    }

    function flashNote(text, ms = 4000) {
      note = text;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => { note = ''; renderMsg(); }, ms);
      renderMsg();
    }

    async function refresh() {
      if (loading) return;
      loading = true;
      try {
        const res = await fetch('/api/card', { credentials: 'same-origin', cache: 'no-store', signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        data = await res.json();
        failed = false;
        // share login state with the dock so it never needs its own request here
        store.set('dock-me', JSON.stringify({ ...data.me, at: Date.now() }));
        window.dispatchEvent(new CustomEvent('dock:me', { detail: data.me }));
      } catch (err) {
        if (err.name === 'AbortError') return;
        failed = true;
      } finally {
        loading = false;
      }
      render();
    }

    async function doStamp(slot) {
      if (busy || !canStamp()) return;
      busy = true;
      try {
        const res = await fetch('/api/stamp', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ icon, slot, anonymous: anon }),
          signal,
        });
        const body = await res.json().catch(() => null);
        if (body && body.state) data = { ...body.state, me: data.me, devLogin: data.devLogin };
        if (res.status === 401) {
          data.me = { loggedIn: false };
          flashNote('your login expired. log in again to stamp!');
        } else if (!res.ok) {
          flashNote(ERRORS[body && body.error] || "that didn't work. try again?");
        }
      } catch (err) {
        if (err.name !== 'AbortError') flashNote("couldn't reach the card. try again?");
      } finally {
        busy = false;
        render();
      }
    }

    async function logout() {
      try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin', signal }); }
      catch (_) { }
      await refresh();
    }

    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('.stamp');
      if (!b) return;
      const i = [...wrap.children].indexOf(b);
      const s = data && data.stamps.find((x) => x.slot === i);
      if (s) {
        flashNote('stamp ' + (i + 1) + ': ' + (s.mine ? 'you' + (s.anonymous ? ' (anonymous)' : '') : s.name || 'someone anonymous'));
      } else if (!data) {
        return;
      } else if (canStamp()) {
        doStamp(i);
      } else if (!data.me.loggedIn) {
        flashNote('log in with Discord first, then tap a circle!');
        const link = authEl.querySelector('a.btn');
        if (link) link.focus();
      } else if (data.youStamped) {
        flashNote(ERRORS.already_stamped);
      }
    }, { signal });

    pickerEl.addEventListener('click', (e) => {
      const b = e.target.closest('.pick');
      if (!b) return;
      icon = b.dataset.icon;
      store.set('stamp-icon', icon);
      renderPicker();
      renderSlots();
    }, { signal });

    pickerEl.addEventListener('change', (e) => {
      if (e.target.matches('input[type=checkbox]')) {
        anon = e.target.checked;
        store.set('stamp-anon', anon ? '1' : '0');
      }
    }, { signal });

    authEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="logout"]')) logout();
    }, { signal });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      bump(); // coming back to the tab counts as activity
      refresh();
    }, { signal });
    const poll = setInterval(() => { if (!document.hidden && !busy && !idle()) refresh(); }, POLL_MS);

    buildSlots(FALLBACK_SIZE);
    render();
    refresh();

    const params = new URLSearchParams(location.search);
    const result = params.get('login');
    const reason = params.get('reason');
    if (result && LOGIN_NOTES[result]) {
      const why = result === 'error' && /^[a-z0-9_]{1,40}$/.test(reason || '') ? ' (' + reason + ')' : '';
      flashNote(LOGIN_NOTES[result].replace('work.', 'work' + why + '.'), 10000);
      params.delete('login');
      params.delete('reason');
      const qs = params.toString();
      history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }

    return () => {
      ac.abort();
      clearInterval(poll);
      clearTimeout(noteTimer);
    };
  });
})();
