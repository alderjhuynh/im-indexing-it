(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const DEG_PER_SEC = Vinyl.DEG_PER_SEC;

  Site.page(() => {
    const rec = $('#rec');
    const hit = $('#hit');
    const playBtn = $('#play');
    const seek = $('#seek');
    const timeEl = $('#time');
    const statusEl = $('#status');
    const armPivot = $('#armPivot');
    const ac = new AbortController();
    const { signal } = ac;

    const y = $('#year');
    if (y) y.textContent = new Date().getFullYear();

    Vinyl.drawRecord($('#grooves'), $('#sheens'));

    Vinyl.hideMini(true);

    const syncUi = () => {
      playBtn.textContent = Vinyl.playing ? 'Pause' : 'Play';
      playBtn.disabled = seek.disabled = !Vinyl.ready;
      if (Vinyl.failed) statusEl.textContent = "couldn't load the record :(";
      else if (Vinyl.ready) {
        statusEl.textContent = 'ready!';
        hit.setAttribute('aria-valuemax', Math.round(Vinyl.duration));
      }
    };
    const offState = Vinyl.on(syncUi);
    syncUi();
    Vinyl.init();

    const unbind = Vinyl.bindRecord(hit);

    playBtn.addEventListener('click', () => Vinyl.toggle());

    let seeking = false;
    seek.addEventListener('pointerdown', () => { seeking = true; Vinyl.wake(); });
    window.addEventListener('pointerup', () => { seeking = false; }, { signal });
    window.addEventListener('pointercancel', () => { seeking = false; }, { signal });
    seek.addEventListener('input', () => {
      if (!Vinyl.ready) return;
      Vinyl.seekTo(seek.value / 1000 * Vinyl.duration, { start: true });
    });

    let armAngle = Vinyl.armTarget(Vinyl.pos());
    let lastSecond = -1;

    const offFrame = Vinyl.onFrame((t, dt) => {
      const duration = Vinyl.duration;

      rec.style.transform = `rotate(${((t * DEG_PER_SEC) % 360).toFixed(2)}deg)`;

      armAngle += (Vinyl.armTarget(t) - armAngle) * (1 - Math.exp(-dt / 0.14));
      armPivot.style.transform = `rotate(${armAngle.toFixed(2)}deg)`;

      const sec = Math.floor(t);
      if (sec !== lastSecond) {
        lastSecond = sec;
        timeEl.textContent = Vinyl.fmt(t) + ' / ' + Vinyl.fmt(duration);
        hit.setAttribute('aria-valuenow', sec);
        hit.setAttribute('aria-valuetext', Vinyl.fmt(t) + ' of ' + Vinyl.fmt(duration));
      }
      if (!seeking) seek.value = Math.round((duration ? t / duration : 0) * 1000);
    });

    return () => {
      offFrame();
      offState();
      unbind();
      ac.abort();
      Vinyl.hideMini(false);
    };
  });
})();
