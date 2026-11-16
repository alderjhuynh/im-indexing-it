(() => {
  const $ = s => document.querySelector(s);
  const BASE = document.currentScript.src;

  const sfx = (() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return { play() {}, unlock() {} };
    const ctx = new AC({ latencyHint: 'interactive' });
    const bufs = {};
    const load = (k, file) => fetch(new URL(file, BASE))
      .then(r => r.arrayBuffer())
      .then(ab => new Promise((ok, no) => ctx.decodeAudioData(ab, ok, no)))
      .then(b => { bufs[k] = b; })
      .catch(() => {});
    load('begin', 'assets/sound/click_begin.mp3');
    load('end', 'assets/sound/click_end.mp3');
    const unlock = () => { if (ctx.state !== 'running') ctx.resume().catch(() => {}); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    return {
      unlock,
      play(k) {
        if (!bufs[k]) return;
        unlock();
        const s = ctx.createBufferSource();
        s.buffer = bufs[k];
        s.connect(ctx.destination);
        s.start();
      },
    };
  })();
  const play = k => sfx.play(k);

  Site.page(() => {
    const ac = new AbortController();
    const { signal } = ac;
    const timers = [];

    document.querySelectorAll('.like').forEach(b => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true', c = b.querySelector('.count');
      b.setAttribute('aria-pressed', on);
      c.textContent = +c.textContent + (on ? 1 : -1);
    }));

    const wrap = $('#stamps'), msg = $('#free'), N = 10;
    for (let i = 0; i < N; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stamp';
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', 'Stamp ' + (i + 1));
      b.innerHTML = '<i class="ic-heart"></i>';
      wrap.appendChild(b);
    }
    const update = () => {
      const n = wrap.querySelectorAll('.on').length;
      msg.textContent = n === 0 ? 'tap a circle to stamp it!'
        : n < N ? n + ' / ' + N + ' stamps, keep going!'
        : 'now wasn\'t that fun?';
    };
    wrap.addEventListener('click', e => {
      const b = e.target.closest('.stamp');
      if (!b) return;
      const on = !b.classList.contains('on');
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
      update();
    });

    const clickBtn = $('main .btn');

    if (clickBtn) {
      const ORIGINAL_TEXT = clickBtn.textContent;
      const FLASH_TEXT = 'You\'re such a good girl';
      const HOLD_MS = 1500;
      const FADE_MS = 300;
      let flashTimers = [];

      const flash = () => {
        flashTimers.forEach(clearTimeout);
        flashTimers = [];

        clickBtn.style.transition = 'none';
        clickBtn.style.opacity = '1';
        clickBtn.textContent = FLASH_TEXT;
        void clickBtn.offsetWidth;
        clickBtn.style.transition = 'opacity ' + FADE_MS + 'ms ease';

        flashTimers.push(setTimeout(() => {
          clickBtn.style.opacity = '0';
          flashTimers.push(setTimeout(() => {
            clickBtn.textContent = ORIGINAL_TEXT;
            clickBtn.style.opacity = '1';
          }, FADE_MS));
        }, HOLD_MS));
      };
      timers.push(() => flashTimers.forEach(clearTimeout));

      let down = false;
      clickBtn.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        down = true;
        play('begin');
      });

      window.addEventListener('pointerup', () => {
        if (!down) return;
        down = false;
        play('end');
        flash();
      }, { signal });
      window.addEventListener('pointercancel', () => { down = false; }, { signal });
    }

    const y = $('#year');
    if (y) y.textContent = new Date().getFullYear();

    return () => {
      ac.abort();
      timers.forEach(fn => fn());
    };
  });
})();
