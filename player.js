(() => {
  'use strict';
  if (window.Vinyl) return;

  const ROOT = new URL('./', document.currentScript.src).href;
  const SONG_URL = ROOT + 'assets/sound/coffeeshop.m4a';
  const WORKLET_URL = ROOT + 'vinyl/processor.js';

  const DEG_PER_SEC = 200;
  const CX = 210, CY = 210;
  const SVGNS = 'http://www.w3.org/2000/svg';

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fmt = (s) => {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  const PIVOT = { x: 500, y: 70 };
  const ARM_LEN = 290;
  const R_OUTER = 176, R_INNER = 80;
  const ARM_REST = 98;
  const armAngleFor = (r) => {
    const dx = CX - PIVOT.x, dy = CY - PIVOT.y;
    const d = Math.hypot(dx, dy);
    const ux = dx / d, uy = dy / d;
    const a = (ARM_LEN * ARM_LEN - r * r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, ARM_LEN * ARM_LEN - a * a));
    const sx = PIVOT.x + a * ux + h * uy;
    const sy = PIVOT.y + a * uy - h * ux;
    return Math.atan2(sy - PIVOT.y, sx - PIVOT.x) * 180 / Math.PI;
  };

  let ctx = null, node = null;
  let duration = 0;
  let ready = false;
  let failed = false;
  let loading = null;
  let playing = false;
  let started = false;
  let engaged = false;
  let ended = false;
  let dragging = false;
  let dragPos = 0;
  let rep = { t: 0, pos: 0, rate: 0 };
  let miniSuppressed = false;

  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => {
    try { fn(); } catch (err) { console.error(err); }
  });
  const on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  const pos = () => {
    if (dragging) return dragPos;
    if (!ctx) return 0;
    return clamp(rep.pos + rep.rate * Math.max(0, ctx.currentTime - rep.t), 0, duration);
  };

  const ensureRunning = async () => {
    if (ctx && ctx.state !== 'running') {
      try { await ctx.resume(); } catch (_) { }
    }
  };

  function init() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC || !window.AudioWorkletNode) throw new Error('no AudioWorklet');
        ctx = new AC({ latencyHint: 'interactive' });
        await ctx.audioWorklet.addModule(WORKLET_URL);

        const res = await fetch(SONG_URL);
        if (!res.ok) throw new Error('song ' + res.status);
        let buf = await ctx.decodeAudioData(await res.arrayBuffer());
        duration = buf.duration;

        const L = buf.getChannelData(0).slice();
        const R = buf.numberOfChannels > 1 ? buf.getChannelData(1).slice() : null;
        buf = null;

        node = new AudioWorkletNode(ctx, 'vinyl-processor', { numberOfInputs: 0, outputChannelCount: [2] });
        node.connect(ctx.destination);
        node.port.onmessage = (e) => {
          const m = e.data;
          if (m.type === 'pos') {
            if (!dragging) rep = { t: m.t, pos: m.pos, rate: m.rate };
          } else if (m.type === 'ended') {
            playing = false; started = false; ended = true;
            emit();
          }
        };
        node.port.postMessage({ type: 'load', L, R }, R ? [L.buffer, R.buffer] : [L.buffer]);
        ready = true;
      } catch (err) {
        console.error(err);
        failed = true;
      }
      emit();
    })();
    return loading;
  }

  function engage() {
    if (engaged) return;
    engaged = true;
  }

  function setPlaying(on) {
    if (!node) return;
    playing = on;
    if (on) {
      started = true;
      engage();
      if (ended || pos() >= duration - 0.1) seekTo(0);
      ended = false;
    }
    node.port.postMessage({ type: 'motor', on });
    emit();
  }

  async function toggle() {
    if (!ready) return;
    await ensureRunning();
    setPlaying(!playing);
  }

  function seekTo(sec, opts) {
    if (!ready) return;
    sec = clamp(sec, 0, duration);
    node.port.postMessage({ type: 'jump', pos: sec });
    rep = { t: ctx.currentTime, pos: sec, rate: rep.rate };
    if (sec < duration - 0.1) ended = false;
    const wasEngaged = engaged, wasStarted = started;
    engage();
    if (opts && opts.start) started = true;
    if (!wasEngaged || wasStarted !== started) emit();
  }

  function grab() {
    if (!ready || dragging) return false;
    ensureRunning();
    dragPos = pos();
    dragging = true;
    started = true;
    engage();
    node.port.postMessage({ type: 'hand', pos: dragPos });
    emit();
    return true;
  }

  function drag(deltaSec) {
    if (!dragging) return;
    dragPos = clamp(dragPos + deltaSec, 0, duration);
    node.port.postMessage({ type: 'hand', pos: dragPos });
  }

  function release() {
    if (!dragging) return;
    dragging = false;
    rep = { t: ctx.currentTime, pos: dragPos, rate: 0 };
    node.port.postMessage({ type: 'release' });
    emit();
  }

  function bindRecord(el, opts) {
    const { onGrab, onRelease } = opts || {};
    let activeId = null;
    let prevA = 0;

    const geo = (e) => {
      const b = el.getBoundingClientRect();
      const dx = e.clientX - (b.left + b.width / 2);
      const dy = e.clientY - (b.top + b.height / 2);
      return { a: Math.atan2(dy, dx) * 180 / Math.PI, r: Math.hypot(dx, dy), R: b.width / 2 };
    };

    const down = (e) => {
      if (!ready || e.button !== 0 || activeId !== null) return;
      e.preventDefault();
      if (!grab()) return;
      activeId = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (_) { }
      prevA = geo(e).a;
      document.documentElement.classList.add('is-grabbing');
      if (onGrab) onGrab();
    };

    const move = (e) => {
      if (e.pointerId !== activeId) return;
      const p = geo(e);
      if (p.r < p.R * 0.06) return;
      let d = p.a - prevA;
      if (d > 180) d -= 360; else if (d < -180) d += 360;
      prevA = p.a;
      drag(d / DEG_PER_SEC);
    };

    const letGo = (e) => {
      if (e && e.pointerId !== activeId) return;
      if (activeId === null) return;
      const id = activeId;
      activeId = null;
      release();
      document.documentElement.classList.remove('is-grabbing');
      try { if (el.hasPointerCapture(id)) el.releasePointerCapture(id); } catch (_) { }
      if (onRelease) onRelease();
    };

    const key = (e) => {
      if (!ready) return;
      const step = e.shiftKey ? 15 : 5;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowUp': seekTo(pos() + step); break;
        case 'ArrowLeft': case 'ArrowDown': seekTo(pos() - step); break;
        case 'Home': seekTo(0); break;
        case 'End': seekTo(duration); break;
        case ' ': case 'Enter': toggle(); break;
        default: return;
      }
      e.preventDefault();
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', letGo);
    el.addEventListener('pointercancel', letGo);
    el.addEventListener('keydown', key);

    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', letGo);
      el.removeEventListener('pointercancel', letGo);
      el.removeEventListener('keydown', key);
      letGo();
    };
  }

  const frameFns = new Set();
  let raf = 0, lastFrame = 0;
  function tick(now) {
    raf = 0;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const t = pos();
    frameFns.forEach((fn) => fn(t, dt));
    if (frameFns.size) raf = requestAnimationFrame(tick);
  }
  function onFrame(fn) {
    frameFns.add(fn);
    if (!raf) { lastFrame = performance.now(); raf = requestAnimationFrame(tick); }
    return () => { frameFns.delete(fn); };
  }

  const armTarget = (t) => {
    const progress = duration ? t / duration : 0;
    return started && !ended ? armAngleFor(R_OUTER - (R_OUTER - R_INNER) * progress) : ARM_REST;
  };

  function drawRecord(grooves, sheens, opts) {
    const step = (opts && opts.step) || 4.2;
    const GAPS = [100, 141];
    const mk = (tag) => document.createElementNS(SVGNS, tag);
    for (let r = 72; r <= 184; r += step) {
      const c = mk('circle');
      c.setAttribute('cx', CX); c.setAttribute('cy', CY); c.setAttribute('r', r.toFixed(1));
      grooves.appendChild(c);
    }
    GAPS.forEach((r) => {
      const c = mk('circle');
      c.setAttribute('cx', CX); c.setAttribute('cy', CY); c.setAttribute('r', r);
      c.setAttribute('class', 'gap');
      grooves.appendChild(c);
    });

    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pt = (r, deg) => [CX + r * Math.cos(deg * Math.PI / 180), CY + r * Math.sin(deg * Math.PI / 180)];
    for (let i = 0; i < 9; i++) {
      const r = 78 + rnd() * 100;
      const a0 = rnd() * 360, span = 14 + rnd() * 40;
      const [x1, y1] = pt(r, a0), [x2, y2] = pt(r, a0 + span);
      const p = mk('path');
      p.setAttribute('d', `M${x1.toFixed(1)} ${y1.toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`);
      grooves.appendChild(p);
    }

    const sheenId = (opts && opts.sheenId) || 'sheen';
    [-55, 125].forEach((mid) => {
      const [x1, y1] = pt(186, mid - 15), [x2, y2] = pt(186, mid + 15);
      const w = mk('path');
      w.setAttribute('d', `M${CX} ${CY}L${x1.toFixed(1)} ${y1.toFixed(1)}A186 186 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}Z`);
      w.setAttribute('fill', `url(#${sheenId})`);
      sheens.appendChild(w);
    });
  }

  window.Vinyl = {
    DEG_PER_SEC, ARM_REST,
    init, toggle, seekTo, grab, drag, release,
    wake: ensureRunning,
    pos, fmt, on, onFrame, bindRecord, drawRecord, armTarget,
    hideMini(v) { miniSuppressed = !!v; emit(); },
    get ready() { return ready; },
    get failed() { return failed; },
    get duration() { return duration; },
    get playing() { return playing; },
    get started() { return started; },
    get ended() { return ended; },
    get engaged() { return engaged; },
    get dragging() { return dragging; },
    get miniSuppressed() { return miniSuppressed; },
  };

  const mini = document.createElement('aside');
  mini.className = 'mp';
  mini.setAttribute('aria-label', 'Music player');
  mini.innerHTML = `
    <div class="mp-body">
      <div class="mp-rec">
        <svg viewBox="0 0 560 420" aria-hidden="false">
          <defs>
            <radialGradient id="mp-sheen" cx="210" cy="210" r="190" gradientUnits="userSpaceOnUse">
              <stop offset="0.15" stop-color="#fff" stop-opacity="0"/>
              <stop offset="0.7" stop-color="#fff" stop-opacity=".16"/>
              <stop offset="1" stop-color="#fff" stop-opacity=".04"/>
            </radialGradient>
            <clipPath id="mp-clip"><circle cx="210" cy="210" r="188"/></clipPath>
          </defs>
          <g class="mp-spin">
            <circle class="mp-disc" cx="210" cy="210" r="190"/>
            <g class="mp-grooves"></g>
            <circle class="mp-label" cx="210" cy="210" r="66"/>
            <circle class="mp-ring" cx="210" cy="210" r="58"/>
            <path class="mp-heart" fill-rule="evenodd" d="M22 38C6 26 1 18 1 11 1 5 6 1 11 1c5 0 9 3 11 7 2-4 6-7 11-7 5 0 10 4 10 10 0 7-5 15-21 27zM29.5 19.5a7.5 7.5 0 1 1-15 0a7.5 7.5 0 1 1 15 0z" transform="translate(192.4 194.4) scale(.8)"/>
            <circle class="mp-spindle" cx="210" cy="210" r="5.5"/>
          </g>
          <g clip-path="url(#mp-clip)"><g class="mp-sheens"></g></g>
          <circle class="mp-armbase" cx="500" cy="70" r="26"/>
          <g class="mp-arm" transform="rotate(98 500 70)">
            <g transform="translate(500 70)">
              <line class="mp-arm-weight" x1="-34" y1="0" x2="-8" y2="0"/>
              <line class="mp-arm-rod" x1="0" y1="0" x2="268" y2="0"/>
              <rect class="mp-arm-head" x="258" y="-8" width="38" height="16" rx="6"/>
              <circle class="mp-arm-hub" cx="0" cy="0" r="9"/>
            </g>
          </g>
          <circle class="mp-hit grab" cx="210" cy="210" r="190" fill="transparent"
                  tabindex="0" role="slider" aria-label="Record position. Drag to scrub, or use the arrow keys."
                  aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" aria-valuetext="0:00"/>
        </svg>
      </div>
      <button class="mp-play" type="button" aria-label="Play" data-playing="false" disabled>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path class="i-play" d="M8.500 5.500v13l10.500-6.500z"/>
          <path class="i-pause" d="M8.500 6v12M15.500 6v12"/>
        </svg>
      </button>
      <div class="mp-scrub">
        <input class="mp-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek" disabled>
        <span class="mp-time" aria-hidden="true">0:00 / 0:00</span>
      </div>
    </div>`;
  Dock.add(mini, { order: 0 });

  const $m = (s) => mini.querySelector(s);
  const spinG = $m('.mp-spin');
  const armG = $m('.mp-arm');
  const hit = $m('.mp-hit');
  const playBtn = $m('.mp-play');
  const seek = $m('.mp-seek');
  const timeEl = $m('.mp-time');

  drawRecord($m('.mp-grooves'), $m('.mp-sheens'), { step: 14, sheenId: 'mp-sheen' });

  let closeTimer = 0;
  let holds = 0;
  let swallowClick = false;
  let seeking = false;

  const isOpen = () => mini.classList.contains('is-open');
  const open = () => { clearTimeout(closeTimer); mini.classList.add('is-open'); };
  const closeSoon = () => {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (holds === 0 && !mini.matches(':hover')) mini.classList.remove('is-open');
    }, 280);
  };
  const hold = () => { holds++; open(); mini.classList.add('is-hold'); };
  const unhold = () => {
    holds = Math.max(0, holds - 1);
    if (holds === 0) { mini.classList.remove('is-hold'); closeSoon(); }
  };

  mini.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') open(); });
  mini.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') closeSoon(); });

  mini.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || isOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 500);
    open();
  }, true);
  mini.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' && !mini.contains(e.target) && holds === 0) {
      mini.classList.remove('is-open');
    }
  });
  mini.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.activeElement && mini.contains(document.activeElement)) document.activeElement.blur();
      mini.classList.remove('is-open');
    }
  });

  bindRecord(hit, { onGrab: hold, onRelease: unhold });

  playBtn.addEventListener('click', () => toggle());

  seek.addEventListener('pointerdown', () => { seeking = true; hold(); ensureRunning(); });
  const endSeek = () => { if (!seeking) return; seeking = false; unhold(); };
  window.addEventListener('pointerup', endSeek);
  window.addEventListener('pointercancel', endSeek);
  seek.addEventListener('input', () => {
    if (!ready) return;
    seekTo(seek.value / 1000 * duration, { start: true });
  });

  let shown = false;
  let armAngle = ARM_REST;
  let lastSecond = -1;
  let offFrame = null;

  function frame(t, dt) {
    spinG.setAttribute('transform', `rotate(${((t * DEG_PER_SEC) % 360).toFixed(2)} ${CX} ${CY})`);

    armAngle += (armTarget(t) - armAngle) * (1 - Math.exp(-dt / 0.14));
    armG.setAttribute('transform', `rotate(${armAngle.toFixed(2)} ${PIVOT.x} ${PIVOT.y})`);

    const sec = Math.floor(t);
    if (sec !== lastSecond) {
      lastSecond = sec;
      timeEl.textContent = fmt(t) + ' / ' + fmt(duration);
      hit.setAttribute('aria-valuenow', sec);
      hit.setAttribute('aria-valuetext', fmt(t) + ' of ' + fmt(duration));
    }
    if (!seeking) seek.value = Math.round((duration ? t / duration : 0) * 1000);
  }

  function sync() {
    const show = engaged && !miniSuppressed;
    if (show !== shown) {
      shown = show;
      Dock.setVisible(mini, show);
      if (show) {
        armAngle = armTarget(pos());
        lastSecond = -1;
        hit.setAttribute('aria-valuemax', Math.round(duration));
        offFrame = onFrame(frame);
      } else {
        if (offFrame) { offFrame(); offFrame = null; }
      }
    }
    playBtn.dataset.playing = String(playing);
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    playBtn.disabled = !ready;
    seek.disabled = !ready;
  }
  on(sync);
})();
