import { Card } from "./card.js";
import { sign, verify, parseCookies, cookie, safeEqual } from "./session.js";

export { Card };

const SESSION_COOKIE = "session";
const STATE_COOKIE = "oauth_state";
const SESSION_DAYS = 30;
const UA = "auraea-stamp-card (https://www.auraea.fyi)";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });

const redirect = (location, cookies = [], status = 302) => {
  const h = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response(null, { status, headers: h });
};

const loginFail = (reason, clearState, detail) => {
  console.error("discord login failed:", reason, detail ?? "");
  return redirect(`/?login=error&reason=${reason}`, [clearState]);
};
const safeCode = (s) => String(s || "").toLowerCase().replace(/[^a-z_]/g, "").slice(0, 30);

const cardStub = (env) => env.CARD.get(env.CARD.idFromName("main"));

function avatarUrl(id, hash) {
  if (!/^\d+$/.test(String(id))) return null;
  if (hash) return `https://cdn.discordapp.com/avatars/${id}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=64`;
  return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> 22n) % 6n)}.png`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const secure = url.protocol === "https:";

    try {
      if (url.hostname === "auraea.fyi") {
        return redirect(`https://www.auraea.fyi${url.pathname}${url.search}`, [], 301);
      }

      const cookies = parseCookies(request.headers.get("Cookie"));
      const session = await verify(cookies[SESSION_COOKIE], env.SESSION_SECRET);
      const viewer = session ? { id: session.id, name: session.name, avatar: avatarUrl(session.id, session.avatar) } : null;

      if (pathname === "/api/card" && request.method === "GET") {
        const state = await cardStub(env).getState(viewer ? viewer.id : null);
        return json({
          ...state,
          me: viewer
            ? { loggedIn: true, name: viewer.name, avatar: viewer.avatar }
            : { loggedIn: false },
          devLogin: devLoginAllowed(env, url),
        });
      }

      if (pathname === "/api/login" && request.method === "GET") {
        if (!env.DISCORD_CLIENT_ID) return json({ error: "discord_not_configured" }, 500);
        const missing = !env.DISCORD_CLIENT_SECRET ? "missing_client_secret" : !env.SESSION_SECRET ? "missing_session_secret" : null;
        if (missing) return loginFail(missing, cookie(STATE_COOKIE, "", { maxAge: 0, path: "/api", secure }));
        const state = crypto.randomUUID();
        const authorize = new URL("https://discord.com/oauth2/authorize");
        authorize.search = new URLSearchParams({
          client_id: env.DISCORD_CLIENT_ID,
          response_type: "code",
          redirect_uri: `${url.origin}/api/callback`,
          scope: "identify",
          state,
          prompt: "none",
        });
        return redirect(authorize.toString(), [cookie(STATE_COOKIE, state, { maxAge: 600, path: "/api", secure })]);
      }

      if (pathname === "/api/callback" && request.method === "GET") {
        const clearState = cookie(STATE_COOKIE, "", { maxAge: 0, path: "/api", secure });
        if (url.searchParams.get("error")) return redirect("/?login=denied", [clearState]);

        if (!env.DISCORD_CLIENT_SECRET) return loginFail("missing_client_secret", clearState);
        if (!env.SESSION_SECRET) return loginFail("missing_session_secret", clearState);

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state || state !== cookies[STATE_COOKIE]) {
          return loginFail("state_mismatch", clearState, { hasCode: !!code, hasStateParam: !!state, hasStateCookie: !!cookies[STATE_COOKIE] });
        }

        let tokenRes;
        try {
          tokenRes = await fetch("https://discord.com/api/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
            body: new URLSearchParams({
              client_id: env.DISCORD_CLIENT_ID,
              client_secret: env.DISCORD_CLIENT_SECRET,
              grant_type: "authorization_code",
              code,
              redirect_uri: `${url.origin}/api/callback`,
            }),
          });
        } catch (err) {
          return loginFail("token_network", clearState, String(err));
        }
        if (!tokenRes.ok) {
          const text = await tokenRes.text().catch(() => "");
          let why = "";
          try { why = safeCode(JSON.parse(text).error); } catch (_) { /* not JSON, e.g. an HTML block page */ }
          return loginFail(`token_${tokenRes.status}${why ? "_" + why : ""}`, clearState, { redirect_uri: `${url.origin}/api/callback`, body: text.slice(0, 300) });
        }
        const { access_token } = await tokenRes.json();

        const meRes = await fetch("https://discord.com/api/users/@me", {
          headers: { Authorization: `Bearer ${access_token}`, "User-Agent": UA },
        });
        if (!meRes.ok) return loginFail(`me_${meRes.status}`, clearState, (await meRes.text().catch(() => "")).slice(0, 300));
        const me = await meRes.json();

        let token;
        try {
          token = await sign(
            {
              id: me.id,
              name: String(me.global_name || me.username).slice(0, 40),
              avatar: me.avatar || null,
              exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400,
            },
            env.SESSION_SECRET,
          );
        } catch (err) {
          return loginFail("session_sign_failed", clearState, String(err));
        }
        return redirect("/?login=ok", [
          clearState,
          cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400, secure }),
        ]);
      }

      if (pathname === "/api/logout" && request.method === "POST") {
        if (!sameOrigin(request, url)) return json({ error: "bad_origin" }, 403);
        return json({ ok: true }, 200, { "Set-Cookie": cookie(SESSION_COOKIE, "", { maxAge: 0, secure }) });
      }

      if (pathname === "/api/stamp" && request.method === "POST") {
        if (!sameOrigin(request, url)) return json({ error: "bad_origin" }, 403);
        if (!viewer) return json({ error: "login_required" }, 401);
        const body = await request.json().catch(() => ({}));
        const result = await cardStub(env).stamp(
          { id: viewer.id, name: viewer.name, avatar: viewer.avatar },
          { icon: body.icon, slot: body.slot, anonymous: !!body.anonymous },
        );
        return json(result, result.ok ? 200 : 409);
      }

      if (pathname === "/api/dev/login" && request.method === "GET") {
        if (!devLoginAllowed(env, url)) return json({ error: "not_found" }, 404);
        const as = (url.searchParams.get("as") || "tester").replace(/[^\w -]/g, "").slice(0, 24) || "tester";
        const token = await sign(
          { id: `dev:${as.toLowerCase()}`, name: as, avatar: null, exp: Math.floor(Date.now() / 1000) + 86400 },
          env.SESSION_SECRET,
        );
        return redirect("/", [cookie(SESSION_COOKIE, token, { maxAge: 86400, secure })]);
      }

      if (pathname.startsWith("/api/admin/")) {
        const given = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
        if (!env.ADMIN_TOKEN || !given || !(await safeEqual(given, env.ADMIN_TOKEN))) {
          return json({ error: "unauthorized" }, 401);
        }
        const stub = cardStub(env);
        const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};

        if (pathname === "/api/admin/state" && request.method === "GET") return json(await stub.adminState());
        if (pathname === "/api/admin/reset" && request.method === "POST") return json(await stub.adminReset(body.size));
        if (pathname === "/api/admin/fake" && request.method === "POST") return json(await stub.adminFake(body.count ?? 1));
        if (pathname === "/api/admin/unstamp" && request.method === "POST") {
          if (!body.id) return json({ error: "id_required" }, 400);
          return json(await stub.adminUnstamp(body.id));
        }
        return json({ error: "not_found" }, 404);
      }

      return json({ error: "not_found" }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "server_error" }, 500);
    }
  },
};

function devLoginAllowed(env, url) {
  return env.DEV_LOGIN === "1" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

function sameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  return !origin || origin === url.origin;
}
