(() => {
  'use strict';

  const USER_ID = '1202473439177351203';
  const REST_URL = 'https://api.lanyard.rest/v1/users/' + USER_ID;
  const SOCKET_URL = 'wss://api.lanyard.rest/socket';

  const SHOW_ACTIVITY = true;
  const SHOW_SPOTIFY = true;
  const SHOW_CUSTOM_STATUS = true;
  const HIDE_ACTIVITIES = [];

  const POLL_MS = 30000;

  const STATE_TEXT = { online: 'online', idle: 'idle', dnd: 'do not disturb' };
  const ACTIVITY_LABEL = { 0: 'Playing', 1: 'Streaming', 2: 'Listening to', 3: 'Watching', 5: 'Competing in' };
  const ROW_ORDER = ['playing', 'listening', 'vibe'];

  Site.page(() => {
    const status = document.getElementById('lanyardStatus');
    if (!status) return;

    const statusRow = status.closest('.row2');
    const fallbackText = status.textContent.trim();
    status.textContent = '';
    const dot = document.createElement('span');
    dot.className = 'presence-dot';
    dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = fallbackText;
    status.append(dot, label);
    status.dataset.state = 'offline';

    const ac = new AbortController();
    const rows = new Map();
    let socket = null;
    let heartbeat = 0;
    let pollTimer = 0;
    let retryTimer = 0;
    let retryDelay = 5000;
    let dead = false;

    function setRow(key, dtText, ddText) {
      let row = rows.get(key);
      if (!ddText) {
        if (row) { row.el.remove(); rows.delete(key); }
        return;
      }
      if (!row) {
        const el = document.createElement('div');
        el.className = 'row2 live-row';
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        el.append(dt, dd);
        row = { el, dt, dd };
        rows.set(key, row);
      }
      if (row.dt.textContent !== dtText) row.dt.textContent = dtText;
      if (row.dd.textContent !== ddText) row.dd.textContent = ddText;
    }

    function placeRows() {
      let anchor = statusRow;
      for (const key of ROW_ORDER) {
        const row = rows.get(key);
        if (!row) continue;
        if (anchor.nextElementSibling !== row.el) anchor.after(row.el);
        anchor = row.el;
      }
    }

    function render(p) {
      if (!p || typeof p.discord_status !== 'string') return;

      const state = STATE_TEXT[p.discord_status] ? p.discord_status : 'offline';
      const text = STATE_TEXT[state] || fallbackText;
      status.dataset.state = state;
      if (label.textContent !== text) label.textContent = text;

      const acts = Array.isArray(p.activities) ? p.activities : [];

      let playing = null;
      if (SHOW_ACTIVITY && state !== 'offline') {
        const a = acts.find((x) =>
          x && x.type !== 4 && x.type !== 2 && x.name && !HIDE_ACTIVITIES.includes(x.name));
        if (a) playing = [ACTIVITY_LABEL[a.type] || 'Playing', a.name];
      }
      setRow('playing', playing && playing[0], playing && playing[1]);

      let listening = null;
      if (SHOW_SPOTIFY && p.listening_to_spotify && p.spotify && p.spotify.song) {
        const artist = String(p.spotify.artist || '').replace(/;\s*/g, ', ');
        listening = artist ? p.spotify.song + ' · ' + artist : p.spotify.song;
      }
      setRow('listening', 'Listening to', listening);

      let vibe = null;
      if (SHOW_CUSTOM_STATUS) {
        const c = acts.find((x) => x && x.type === 4);
        if (c) {
          const emoji = c.emoji && !c.emoji.id && c.emoji.name ? c.emoji.name + ' ' : '';
          vibe = (emoji + (c.state || '')).trim() || null;
        }
      }
      setRow('vibe', 'Vibe', vibe);

      placeRows();
    }

    async function fetchRest() {
      try {
        const res = await fetch(REST_URL, { signal: ac.signal });
        if (!res.ok) return;
        const json = await res.json();
        if (json && json.success) render(json.data);
      } catch (_) {  }
    }

    const startPoll = () => {
      if (pollTimer || dead || document.hidden) return;
      fetchRest();
      pollTimer = setInterval(fetchRest, POLL_MS);
    };
    const stopPoll = () => { clearInterval(pollTimer); pollTimer = 0; };

    function openSocket() {
      if (dead || document.hidden || socket || !('WebSocket' in window)) {
        if (!('WebSocket' in window)) startPoll();
        return;
      }
      let sock;
      try { sock = new WebSocket(SOCKET_URL); } catch (_) { startPoll(); return; }
      socket = sock;

      sock.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch (_) { return; }
        if (m.op === 1) {
          const every = (m.d && m.d.heartbeat_interval) || 30000;
          sock.send(JSON.stringify({ op: 2, d: { subscribe_to_id: USER_ID } }));
          clearInterval(heartbeat);
          heartbeat = setInterval(() => {
            if (sock.readyState === 1) sock.send(JSON.stringify({ op: 3 }));
          }, every);
        } else if (m.op === 0 && m.d) {
          render(m.d);
          stopPoll();
          retryDelay = 5000;
        }
      };
      sock.onclose = () => {
        if (socket !== sock) return;
        socket = null;
        clearInterval(heartbeat);
        if (dead || document.hidden) return;
        startPoll();
        retryTimer = setTimeout(openSocket, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 60000);
      };
      sock.onerror = () => { };
    }

    function closeSocket() {
      clearInterval(heartbeat);
      clearTimeout(retryTimer);
      const s = socket;
      socket = null;
      if (s) { try { s.close(); } catch (_) { } }
    }

    const onVisibility = () => {
      if (document.hidden) {
        closeSocket();
        stopPoll();
      } else {
        fetchRest();
        openSocket();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    fetchRest();
    openSocket();

    return () => {
      dead = true;
      document.removeEventListener('visibilitychange', onVisibility);
      closeSocket();
      stopPoll();
      ac.abort();
    };
  });
})();
