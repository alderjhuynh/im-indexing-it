(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const SONG_URL = '../assets/sound/coffeeshop.m4a';
  const DEG_PER_SEC = 200;
  const CX = 210, CY = 210;

  const rec = $('#rec');
  const hit = $('#hit');
  const playBtn = $('#play');
  const seek = $('#seek');
  const timeEl = $('#time');
  const statusEl = $('#status');
  const armPivot = $('#armPivot');
  const SVGNS = 'http://www.w3.org/2000/svg';

  const y = $('#year');
  if (y) y.textContent = new Date().getFullYear();

  (function drawRecord() {
    const grooves = $('#grooves');
    const GAPS = [100, 141];
    for (let r = 72; r <= 184; r += 4.2) {
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', CX); c.setAttribute('cy', CY); c.setAttribute('r', r.toFixed(1));
      grooves.appendChild(c);
    }
    GAPS.forEach((r) => {
      const c = document.createElementNS(SVGNS, 'circle');
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
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', `M${x1.toFixed(1)} ${y1.toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`);
      grooves.appendChild(p);
    }

    const sheens = $('#sheens');
    [-55, 125].forEach((mid) => {
      const [x1, y1] = pt(186, mid - 15), [x2, y2] = pt(186, mid + 15);
      const w = document.createElementNS(SVGNS, 'path');
      w.setAttribute('d', `M${CX} ${CY}L${x1.toFixed(1)} ${y1.toFixed(1)}A186 186 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}Z`);
      w.setAttribute('fill', 'url(#sheen)');
      sheens.appendChild(w);
    });
  })();

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
  let armAngle = ARM_REST;

  let ctx = null, node = null;
  let duration = 0;
  let ready = false;
  let playing = false;
  let started = false;
  let ended = false;
  let dragging = false;
  let dragPos = 0;
  let rep = { t: 0, pos: 0, rate: 0 };
  let seeking = false;
  let lastSecond = -1;

  const pos = () => {
    if (dragging) return dragPos;
    if (!ctx) return 0;
    return clamp(rep.pos + rep.rate * Math.max(0, ctx.currentTime - rep.t), 0, duration);
  };

  const fmt = (s) => {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  const ensureRunning = async () => {
    if (ctx && ctx.state !== 'running') {
      try { await ctx.resume(); } catch (_) { }
    }
  };

  const setPlaying = (on) => {
    playing = on;
    playBtn.textContent = on ? 'Pause' : 'Play';
    if (!node) return;
    if (on) {
      started = true;
      if (ended || pos() >= duration - 0.1) seekTo(0);
      ended = false;
    }
    node.port.postMessage({ type: 'motor', on });
  };

  const seekTo = (sec) => {
    if (!ready) return;
    sec = clamp(sec, 0, duration);
    node.port.postMessage({ type: 'jump', pos: sec });
    rep = { t: ctx.currentTime, pos: sec, rate: rep.rate };
    if (sec < duration - 0.1) ended = false;
  };

  async function init() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || !window.AudioWorkletNode) throw new Error('no AudioWorklet');
      ctx = new AC({ latencyHint: 'interactive' });
      await ctx.audioWorklet.addModule('processor.js');

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
          playBtn.textContent = 'Play';
        }
      };
      node.port.postMessage({ type: 'load', L, R }, R ? [L.buffer, R.buffer] : [L.buffer]);

      hit.setAttribute('aria-valuemax', Math.round(duration));
      lastSecond = -1;
      playBtn.disabled = false;
      seek.disabled = false;
      ready = true;
      statusEl.textContent = 'ready!';
    } catch (err) {
      console.error(err);
      statusEl.textContent = "couldn't load the record :(";
    }
  }

  let prevA = 0;
  let hitRect = null;
  const pointerAngle = (e) => {
    const b = hitRect || (hitRect = hit.getBoundingClientRect());
    const dx = e.clientX - (b.left + b.width / 2);
    const dy = e.clientY - (b.top + b.height / 2);
    return { a: Math.atan2(dy, dx) * 180 / Math.PI, r: Math.hypot(dx, dy), R: b.width / 2 };
  };

  hit.addEventListener('pointerdown', (e) => {
    if (!ready || e.button !== 0) return;
    e.preventDefault();
    hit.setPointerCapture(e.pointerId);
    ensureRunning();

    hitRect = null;
    dragPos = pos();
    dragging = true;
    started = true;
    prevA = pointerAngle(e).a;
    node.port.postMessage({ type: 'hand', pos: dragPos });
    document.documentElement.classList.add('is-grabbing');
  });

  hit.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = pointerAngle(e);
    if (p.r < p.R * 0.06) return;
    let d = p.a - prevA;
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    prevA = p.a;
    dragPos = clamp(dragPos + d / DEG_PER_SEC, 0, duration);
    node.port.postMessage({ type: 'hand', pos: dragPos });
  });

  const letGo = (e) => {
    if (!dragging) return;
    dragging = false;
    rep = { t: ctx.currentTime, pos: dragPos, rate: 0 };
    node.port.postMessage({ type: 'release' });
    document.documentElement.classList.remove('is-grabbing');
    if (hit.hasPointerCapture && hit.hasPointerCapture(e.pointerId)) hit.releasePointerCapture(e.pointerId);
  };
  hit.addEventListener('pointerup', letGo);
  hit.addEventListener('pointercancel', letGo);

  hit.addEventListener('keydown', (e) => {
    if (!ready) return;
    const step = e.shiftKey ? 15 : 5;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp': seekTo(pos() + step); break;
      case 'ArrowLeft': case 'ArrowDown': seekTo(pos() - step); break;
      case 'Home': seekTo(0); break;
      case 'End': seekTo(duration); break;
      case ' ': case 'Enter': ensureRunning(); setPlaying(!playing); break;
      default: return;
    }
    e.preventDefault();
  });

  playBtn.addEventListener('click', async () => {
    if (!ready) return;
    await ensureRunning();
    setPlaying(!playing);
  });

  seek.addEventListener('pointerdown', () => { seeking = true; ensureRunning(); });
  window.addEventListener('pointerup', () => { seeking = false; });
  window.addEventListener('pointercancel', () => { seeking = false; });
  seek.addEventListener('input', () => {
    if (!ready) return;
    started = true;
    seekTo(seek.value / 1000 * duration);
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    const t = pos();

    const deg = (t * DEG_PER_SEC) % 360;
    rec.style.transform = `rotate(${deg.toFixed(2)}deg)`;

    const progress = duration ? t / duration : 0;
    const target = started && !ended
      ? armAngleFor(R_OUTER - (R_OUTER - R_INNER) * progress)
      : ARM_REST;
    armAngle += (target - armAngle) * (1 - Math.exp(-dt / 0.14));
    armPivot.style.transform = `rotate(${armAngle.toFixed(2)}deg)`;

    const sec = Math.floor(t);
    if (sec !== lastSecond) {
      lastSecond = sec;
      timeEl.textContent = fmt(t) + ' / ' + fmt(duration);
      hit.setAttribute('aria-valuenow', sec);
      hit.setAttribute('aria-valuetext', fmt(t) + ' of ' + fmt(duration));
    }
    if (!seeking) seek.value = Math.round(progress * 1000);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  init();
})();
