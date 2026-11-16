import { DurableObject } from "cloudflare:workers";

export const ICONS = ["heart", "star", "mug", "flower", "moon", "cat"];

const DEFAULT_SIZE = 10;
const MIN_SIZE = 1;
const MAX_SIZE = 20;

const FAKE_NAMES = [
  "mochi", "juniper", "pixel", "biscuit", "clover", "waffles", "nimbus", "tofu",
  "sprout", "marmalade", "pebble", "noodle", "fig", "latte", "cinder", "bean",
  "maple", "thistle", "orbit", "peach", "wren", "sesame", "dusk", "poppy",
];

const clampSize = (n, fallback) => {
  if (n === null || n === undefined || n === "") return fallback;
  n = Math.trunc(Number(n));
  return Number.isFinite(n) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, n)) : fallback;
};

export class Card extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  migrate() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS cards (
        id           INTEGER PRIMARY KEY,
        size         INTEGER NOT NULL,
        started_at   INTEGER NOT NULL,
        completed_at INTEGER,
        completed_by TEXT
      )`);
   this.sql.exec(`
      CREATE TABLE IF NOT EXISTS stamps (
        card      INTEGER NOT NULL,
        slot      INTEGER NOT NULL,
        user_id   TEXT    NOT NULL,
        name      TEXT    NOT NULL,
        avatar    TEXT,
        icon      TEXT    NOT NULL,
        anonymous INTEGER NOT NULL DEFAULT 0,
        fake      INTEGER NOT NULL DEFAULT 0,
        at        INTEGER NOT NULL,
        PRIMARY KEY (card, slot),
        UNIQUE (card, user_id)
      )`);
    const has = this.sql.exec("SELECT COUNT(*) AS n FROM cards").one().n;
    if (!has) this.newCard(1, clampSize(this.env.CARD_SIZE, DEFAULT_SIZE));
  }

  holdMs() {
    const h = Number(this.env.HOLD_HOURS);
    return (Number.isFinite(h) && h >= 0 ? h : 24) * 3600 * 1000;
  }

  newCard(id, size) {
    this.sql.exec("INSERT INTO cards (id, size, started_at) VALUES (?, ?, ?)", id, size, Date.now());
    return this.sql.exec("SELECT * FROM cards WHERE id = ?", id).one();
  }

  current() {
    const card = this.sql.exec("SELECT * FROM cards ORDER BY id DESC LIMIT 1").one();
    if (card.completed_at && Date.now() - card.completed_at >= this.holdMs()) {
      return this.newCard(card.id + 1, clampSize(this.env.CARD_SIZE, card.size));
    }
    return card;
  }

  stampRows(cardId) {
    return this.sql
      .exec("SELECT slot, user_id, name, avatar, icon, anonymous, fake, at FROM stamps WHERE card = ? ORDER BY slot", cardId)
      .toArray();
  }

  insertStamp(card, slot, user, icon, anonymous, fake = 0) {
    this.sql.exec(
      "INSERT INTO stamps (card, slot, user_id, name, avatar, icon, anonymous, fake, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      card.id, slot, user.id, user.name, user.avatar ?? null, icon, anonymous ? 1 : 0, fake, Date.now(),
    );
  }

  completeIfFull(card, lastUserId) {
    const n = this.sql.exec("SELECT COUNT(*) AS n FROM stamps WHERE card = ?", card.id).one().n;
    if (n >= card.size && !card.completed_at) {
      this.sql.exec("UPDATE cards SET completed_at = ?, completed_by = ? WHERE id = ?", Date.now(), lastUserId, card.id);
    }
    return this.sql.exec("SELECT * FROM cards WHERE id = ?", card.id).one();
  }

  view(viewerId, { admin = false } = {}) {
    const card = this.current();
    const rows = this.stampRows(card.id);
    const stamps = rows.map((r) => {
      const hidden = !!r.anonymous;
      const s = {
        slot: r.slot,
        icon: r.icon,
        at: r.at,
        mine: !!viewerId && r.user_id === viewerId,
        anonymous: hidden,
        name: hidden ? null : r.name,
        avatar: hidden ? null : r.avatar,
      };
      if (admin) Object.assign(s, { userId: r.user_id, fake: !!r.fake, realName: r.name });
      return s;
    });
    return {
      card: card.id,
      size: card.size,
      count: stamps.length,
      complete: !!card.completed_at,
      completedAt: card.completed_at ?? null,
      nextCardAt: card.completed_at ? card.completed_at + this.holdMs() : null,
      youStamped: stamps.some((s) => s.mine),
      icons: ICONS,
      stamps,
    };
  }

  fail(error, viewerId) {
    return { ok: false, error, state: this.view(viewerId) };
  }

  async getState(viewerId) {
    return this.view(viewerId);
  }

  async stamp(user, { icon, slot, anonymous } = {}) {
    const card = this.current();
    if (!ICONS.includes(icon)) return this.fail("bad_icon", user.id);
    if (card.completed_at) return this.fail("card_full", user.id);

    const rows = this.stampRows(card.id);
    if (rows.some((r) => r.user_id === user.id)) return this.fail("already_stamped", user.id);
    if (rows.length >= card.size) return this.fail("card_full", user.id);

    const taken = new Set(rows.map((r) => r.slot));
    let chosen;
    if (slot === undefined || slot === null) {
      chosen = 0;
      while (taken.has(chosen)) chosen++;
    } else {
      chosen = Number(slot);
      if (!Number.isInteger(chosen) || chosen < 0 || chosen >= card.size) return this.fail("bad_slot", user.id);
      if (taken.has(chosen)) return this.fail("slot_taken", user.id);
    }

    const safe = {
      id: String(user.id),
      name: String(user.name || "someone").slice(0, 40),
      avatar: typeof user.avatar === "string" && user.avatar.startsWith("https://cdn.discordapp.com/") ? user.avatar : null,
    };
    this.insertStamp(card, chosen, safe, icon, !!anonymous);
    this.completeIfFull(card, safe.id);
    return { ok: true, state: this.view(user.id) };
  }

  async adminState() {
    return this.view(null, { admin: true });
  }

  async adminReset(size) {
    const card = this.current();
    this.newCard(card.id + 1, clampSize(size, clampSize(this.env.CARD_SIZE, card.size)));
    return this.view(null, { admin: true });
  }

  async adminFake(count = 1) {
    const card = this.current();
    if (card.completed_at) return { added: 0, state: this.view(null, { admin: true }) };

    const rows = this.stampRows(card.id);
    const taken = new Set(rows.map((r) => r.slot));
    const remaining = card.size - rows.length;
    const want =
      count === "all" ? remaining :
      count === "almost" ? Math.max(0, remaining - 1) :
      Math.min(remaining, Math.max(0, Math.trunc(Number(count)) || 0));

    const usedNames = new Set(rows.map((r) => r.name));
    let added = 0, last = null;
    for (let slot = 0; slot < card.size && added < want; slot++) {
      if (taken.has(slot)) continue;
      let name;
      do {
        name = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
        if (usedNames.has(name)) name += Math.floor(Math.random() * 90 + 10);
      } while (usedNames.has(name));
      usedNames.add(name);
      last = `fake:${crypto.randomUUID().slice(0, 8)}`;
      const icon = ICONS[Math.floor(Math.random() * ICONS.length)];
      this.insertStamp(card, slot, { id: last, name, avatar: null }, icon, Math.random() < 0.25, 1);
      added++;
    }
    if (last) this.completeIfFull(card, last);
    return { added, state: this.view(null, { admin: true }) };
  }

  async adminUnstamp(userId) {
    const card = this.current();
    const before = this.sql.exec("SELECT COUNT(*) AS n FROM stamps WHERE card = ? AND user_id = ?", card.id, String(userId)).one().n;
    this.sql.exec("DELETE FROM stamps WHERE card = ? AND user_id = ?", card.id, String(userId));
    if (before && card.completed_at) {
      this.sql.exec("UPDATE cards SET completed_at = NULL, completed_by = NULL WHERE id = ?", card.id);
    }
    return { removed: before, state: this.view(null, { admin: true }) };
  }
}
