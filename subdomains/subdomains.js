(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const mod = (a, n) => ((a % n) + n) % n;

  const DATA_URL = 'subdomains.json';
  const CLICK_URL = '../assets/sound/clicking_noise_for_the_spinner.mp3';

  const STEP = 18;
  const K = 5;
  const POOL = 2 * K + 1;

  const FRICTION = 2.4;
  const SNAP_BELOW = 3;
  const SPRING_K = 220;
  const SPRING_C = 2 * Math.sqrt(SPRING_K);
  const MAX_V = 45;
  const DRAG_SLOP = 6;
  const wheel = $('#wheel');
  const statusEl = $('#status');
  const spinBtn = $('#spin');
  const soundBox = $('#sound');
  const plainEl = $('#plain');
  const pegL = $('.peg.l');
  const pegR = $('.peg.r');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  const y = $('#year');
  if (y) y.textContent = new Date().getFullYear();

  const sound = (() => {
    const MAX_VOICES = 8;
    let ctx = null, buf = null, raw = null;
    let onset = 0, lastT = 0;
    let on = true;
    const voices = [];
    try { on = localStorage.getItem('subdomains-sound') !== 'off'; } catch (_) { }

    const rawReady = fetch(CLICK_URL)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((b) => { raw = b; })
      .catch(() => { });

    async function decode() {
      await rawReady;
      if (!raw || !ctx) return;
      try {
        buf = await ctx.decodeAudioData(raw.slice(0));
        const d = buf.getChannelData(0);
        let i = 0;
        while (i < d.length && Math.abs(d[i]) < 0.02) i++;
        onset = Math.max(0, i / buf.sampleRate - 0.004);
      } catch (_) { }
    }

    function unlock() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC({ latencyHint: 'interactive' });
        decode();
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => { });
    }

    function tick(speed) {
      if (!on || !buf || !ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const gap = now - lastT;
      lastT = now;

      const dur = clamp(gap * 1.6, 0.05, buf.duration - onset);
      const level = 1 - 0.4 * clamp(speed / 30, 0, 1);

      const g = ctx.createGain();
      g.gain.setValueAtTime(level, now);
      g.gain.setValueAtTime(level, now + Math.max(0, dur - 0.012));
      g.gain.linearRampToValueAtTime(0, now + dur);

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.96 + Math.random() * 0.08;
      src.connect(g).connect(ctx.destination);

      const voice = { src, g };
      voices.push(voice);
      src.onended = () => {
        const i = voices.indexOf(voice);
        if (i >= 0) voices.splice(i, 1);
      };
      if (voices.length > MAX_VOICES) {
        const old = voices.shift();
        old.g.gain.cancelScheduledValues(now);
        old.g.gain.setTargetAtTime(0, now, 0.004);
        try { old.src.stop(now + 0.03); } catch (_) { }
      }
      src.start(now, onset, dur);
    }

    return {
      unlock,
      tick,
      get on() { return on; },
      set on(v) {
        on = !!v;
        try { localStorage.setItem('subdomains-sound', on ? 'on' : 'off'); } catch (_) { }
      },
    };
  })();

  let list = [];
  let N = 0;

  const toItem = (s, domain) => {
    const sub = String(s.subdomain || '').trim();
    let url = '';
    if (s.url && /^https?:\/\//i.test(s.url)) url = s.url;
    else if (sub && domain) url = 'https://' + sub + '.' + domain;
    else return null;
    let host;
    try { host = new URL(url).host; } catch (_) { return null; }
    return { name: s.name || sub || host, host, url, description: s.description || '' };
  };

  async function loadList() {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error('list ' + res.status);
    const json = await res.json();
    return (json.subdomains || []).map((s) => toItem(s, json.domain)).filter(Boolean);
  }

  const rows = [];
  let ROW = 80;
  let R = 240;
  let p = 0; 
  let v = 0; 
  let target = 0;
  let mode = 'idle';
  let lastRound = 0;
  let touched = false;

  function buildRows() {
    for (let j = 0; j < POOL; j++) {
      const a = document.createElement('a');
      a.className = 'row3d';
      a.draggable = false;
      a.tabIndex = -1;
      a.innerHTML = '<span class="top"><b class="name"></b><span class="dots"></span><em class="host"></em></span><small class="desc"></small>';
      a._name = a.querySelector('.name');
      a._host = a.querySelector('.host');
      a._desc = a.querySelector('.desc');
      a._n = null;
      a._sel = false;
      wheel.appendChild(a);
      rows.push(a);
    }
  }

  function bind(el, n) {
    const it = list[mod(n, N)];
    el._n = n;
    el.href = it.url;
    el._name.textContent = it.name;
    el._host.textContent = it.host;
    el._desc.textContent = it.description;
  }

  function layout() {
    ROW = rows[0].offsetHeight || 80;
    R = ROW / (2 * Math.tan(STEP * Math.PI / 360));
    render();
  }

  function render() {
    const centre = Math.round(p);
    const first = centre - K;
    for (let j = 0; j < POOL; j++) {
      const el = rows[j];
      const n = first + mod(j - first, POOL);
      if (el._n !== n) bind(el, n);

      const deg = (n - p) * STEP;
      if (Math.abs(deg) >= 80) {
        el.style.visibility = 'hidden';
        continue;
      }
      el.style.visibility = 'visible';
      el.style.transform = 'translateZ(' + (-R).toFixed(1) + 'px) rotateX(' + (-deg).toFixed(2) + 'deg) translateZ(' + R.toFixed(1) + 'px)';
      el.style.opacity = Math.pow(Math.cos(deg * Math.PI / 180), 1.5).toFixed(3);

      const sel = n === centre;
      if (sel !== el._sel) {
        el._sel = sel;
        el.classList.toggle('sel', sel);
      }
    }
  }

  function flick() {
    if (reduce.matches || !pegL.animate) return;
    const o = { duration: 140, easing: 'ease-out' };
    pegL.animate([{ transform: 'rotate(-30deg) scale(1.25)' }, { transform: 'none' }], o);
    pegR.animate([{ transform: 'rotate(30deg) scale(1.25)' }, { transform: 'none' }], o);
  }

  function afterMove(speed) {
    const r = Math.round(p);
    if (r === lastRound) return;
    lastRound = r;
    sound.tick(Math.abs(speed));
    flick();
  }

  function updateStatus() {
    if (!N) return;
    if (!touched) {
      statusEl.textContent = 'grab it and spin!';
      return;
    }
    const it = list[mod(Math.round(p), N)];
    statusEl.textContent = 'landed on ' + it.host;
  }

  let raf = 0;
  let lastFrame = 0;

  function kick() {
    if (raf) return;
    lastFrame = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function leaveIdle() {
    wheel.classList.remove('idle');
  }

  function settle() {
    mode = 'idle';
    v = 0;
    wheel.classList.add('idle');
    updateStatus();
  }

  function startCoast(vel) {
    leaveIdle();
    mode = 'coast';
    v = clamp(vel, -MAX_V, MAX_V);
    kick();
  }

  function snapTo(t) {
    leaveIdle();
    mode = 'snap';
    target = t;
    kick();
  }

  function loop(now) {
    raf = 0;
    const dt = Math.min(0.033, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;

    if (mode === 'coast') {
      p += v * dt;
      v *= Math.exp(-FRICTION * dt);
      if (Math.abs(v) < SNAP_BELOW) snapTo(Math.round(p + v * 0.18));
    } else if (mode === 'snap') {
      const h = dt / 2;
      for (let i = 0; i < 2; i++) {
        v += (SPRING_K * (target - p) - SPRING_C * v) * h;
        p += v * h;
      }
      if (Math.abs(v) < 0.05 && Math.abs(target - p) < 0.004) {
        p = target;
        afterMove(0);
        render();
        settle();
        return;
      }
    }

    afterMove(v);
    render();
    if ((mode === 'coast' || mode === 'snap') && !raf) {
      raf = requestAnimationFrame(loop);
    }
  }

  let press = null;
  let suppressClick = false;

  wheel.addEventListener('pointerdown', (e) => {
    if (!N) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    sound.unlock();
    touched = true;
    press = {
      id: e.pointerId,
      y: e.clientY,
      lastY: e.clientY,
      moved: false,
      wasMoving: mode !== 'idle',
      samples: [[e.timeStamp, p]],
    };
    if (press.wasMoving) {
      mode = 'hold';
      v = 0;
    }
  });

  wheel.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (!press.moved) {
      if (Math.abs(e.clientY - press.y) < DRAG_SLOP) return;
      press.moved = true;
      mode = 'drag';
      v = 0;
      leaveIdle();
      try { wheel.setPointerCapture(e.pointerId); } catch (_) { }
      document.documentElement.classList.add('is-grabbing');
    }
    const dy = e.clientY - press.lastY;
    press.lastY = e.clientY;
    p -= dy / ROW;

    const s = press.samples;
    s.push([e.timeStamp, p]);
    while (s.length > 2 && e.timeStamp - s[0][0] > 100) s.shift();

    afterMove(0);
    render();
  });

  function release(e, cancelled) {
    if (!press || e.pointerId !== press.id) return;
    const pr = press;
    press = null;
    document.documentElement.classList.remove('is-grabbing');

    if (pr.moved) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);

      let vel = 0;
      const s = pr.samples;
      const a = s[0], b = s[s.length - 1];
      if (!cancelled && e.timeStamp - b[0] < 80 && b[0] > a[0]) {
        vel = (b[1] - a[1]) / ((b[0] - a[0]) / 1000);
      }
      vel = clamp(vel, -MAX_V, MAX_V);
      if (reduce.matches || Math.abs(vel) < SNAP_BELOW) snapTo(Math.round(p + (reduce.matches ? 0 : vel * 0.18)));
      else startCoast(vel);
    } else if (pr.wasMoving) {
      snapTo(Math.round(p));
    }
  }
  wheel.addEventListener('pointerup', (e) => release(e, false));
  wheel.addEventListener('pointercancel', (e) => release(e, true));

  wheel.addEventListener('click', (e) => {
    if (suppressClick) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  wheel.addEventListener('wheel', (e) => {
    if (!N) return;
    e.preventDefault();
    sound.unlock();
    touched = true;
    if (mode === 'drag') return;

    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 33;
    else if (e.deltaMode === 2) dy *= 400;

    if (mode !== 'coast') {
      if (mode !== 'snap') v = 0;
      leaveIdle();
      mode = 'coast';
    }
    v = clamp(v + dy / 100 * 3.5, -MAX_V, MAX_V);
    kick();
  }, { passive: false });

  const go = (n) => snapTo(n);

  function jumpToLetter(ch, base) {
    const c = ch.toLowerCase();
    const cur = mod(base, N);
    for (let d = 1; d <= N; d++) {
      if (list[(cur + d) % N].name.toLowerCase().startsWith(c)) {
        go(base + d);
        return true;
      }
    }
    return false;
  }

  wheel.addEventListener('keydown', (e) => {
    if (!N || e.altKey || e.ctrlKey || e.metaKey) return;
    sound.unlock();
    touched = true;
    const base = mode === 'snap' ? target : Math.round(p);
    switch (e.key) {
      case 'ArrowDown': case 'ArrowRight': go(base + 1); break;
      case 'ArrowUp': case 'ArrowLeft': go(base - 1); break;
      case 'PageDown': go(base + 5); break;
      case 'PageUp': go(base - 5); break;
      case 'Home': go(base - mod(base, N)); break;
      case 'End': go(base - mod(base, N) + N - 1); break;
      case 'Enter': case ' ': location.href = list[mod(base, N)].url; break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key) && jumpToLetter(e.key, base)) break;
        return;
    }
    e.preventDefault();
  });

  spinBtn.addEventListener('click', () => {
    if (!N) return;
    sound.unlock();
    touched = true;
    if (reduce.matches) {
      snapTo(Math.round(p) + 3 + Math.floor(Math.random() * 8));
    } else {
      startCoast(24 + Math.random() * 20);
    }
  });

  soundBox.checked = sound.on;
  soundBox.addEventListener('change', () => {
    sound.on = soundBox.checked;
    sound.unlock();
  });

  window.addEventListener('pointerdown', () => sound.unlock(), { once: true });
  window.addEventListener('keydown', () => sound.unlock(), { once: true });

  if ('ResizeObserver' in window) new ResizeObserver(() => { if (rows.length) layout(); }).observe(wheel);
  else window.addEventListener('resize', () => { if (rows.length) layout(); });

  loadList().then((items) => {
    if (!items.length) throw new Error('empty list');
    list = items;
    N = items.length;

    items.forEach((it) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = it.url;
      a.textContent = it.host;
      const span = document.createElement('span');
      span.textContent = ' - ' + it.description;
      li.append(a, span);
      plainEl.appendChild(li);
    });

    buildRows();
    layout();
    lastRound = Math.round(p);
    spinBtn.disabled = false;
    settle();
  }).catch((err) => {
    console.error(err);
    statusEl.textContent = "couldn't load the list :(";
  });
})();
