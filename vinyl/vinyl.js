(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const DEG_PER_SEC = Vinyl.DEG_PER_SEC;

  Site.page(() => {
    const rec = $('#rec');
    const hit = $('#hit');
    const playBtn = $('#play');
    const prevBtn = $('#prev');
    const nextBtn = $('#next');
    const listEl = $('#tracks');
    const labelText = $('.label-text textPath');
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

    let lastSecond = -1;
    let builtFor = null;
    const buildList = () => {
      const tracks = Vinyl.tracks;
      if (builtFor === tracks) return;
      builtFor = tracks;
      listEl.replaceChildren();
      tracks.forEach((t, i) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'track';
        b.dataset.i = i;
        const n = document.createElement('span');
        n.className = 'track-n';
        n.textContent = i + 1;
        const name = document.createElement('span');
        name.className = 'track-name';
        name.textContent = t.title;
        b.append(n, name);
        if (t.duration) {
          const d = document.createElement('span');
          d.className = 'track-dur';
          d.textContent = Vinyl.fmt(t.duration);
          b.append(d);
        }
        li.append(b);
        listEl.append(li);
      });
    };

    listEl.addEventListener('click', (e) => {
      const b = e.target.closest('.track');
      if (!b) return;
      const i = +b.dataset.i;
      if (i === Vinyl.index && Vinyl.ready) Vinyl.toggle();
      else Vinyl.select(i, { play: true });
    });

    const syncUi = () => {
      playBtn.textContent = Vinyl.playing ? 'Pause' : 'Play';
      playBtn.disabled = seek.disabled = !Vinyl.ready;
      prevBtn.disabled = nextBtn.disabled = Vinyl.tracks.length < 2;
      lastSecond = -1;

      buildList();
      [...listEl.querySelectorAll('.track')].forEach((b, i) => {
        if (i === Vinyl.index) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });

      const t = Vinyl.track;
      if (t) labelText.textContent = 'track ' + (Vinyl.index + 1);
      if (Vinyl.failed) statusEl.textContent = t ? "couldn't load " + t.title + ' :(' : "couldn't load the record :(";
      else if (Vinyl.loading && t) statusEl.textContent = 'putting on ' + t.title + '...';
      else if (Vinyl.ready) {
        statusEl.textContent = t ? t.title : 'ready!';
        hit.setAttribute('aria-valuemax', Math.round(Vinyl.duration));
      }
    };
    const offState = Vinyl.on(syncUi);
    syncUi();
    Vinyl.init();

    const unbind = Vinyl.bindRecord(hit);

    playBtn.addEventListener('click', () => Vinyl.toggle());
    prevBtn.addEventListener('click', () => Vinyl.prev());
    nextBtn.addEventListener('click', () => Vinyl.next());

    let seeking = false;
    seek.addEventListener('pointerdown', () => { seeking = true; Vinyl.wake(); });
    window.addEventListener('pointerup', () => { seeking = false; }, { signal });
    window.addEventListener('pointercancel', () => { seeking = false; }, { signal });
    seek.addEventListener('input', () => {
      if (!Vinyl.ready) return;
      Vinyl.seekTo(seek.value / 1000 * Vinyl.duration, { start: true });
    });

    let armAngle = Vinyl.armTarget(Vinyl.pos());
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
