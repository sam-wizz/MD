// Minimal Supabase GoTrue-compatible auth stand-in — LOCAL DEV ONLY.
//
// The Madd app uses Supabase purely to issue and verify user JWTs; all
// application data lives in the app's own Postgres (DATABASE_URL). This tiny
// stand-in lets you exercise the real signup / login / order flow locally
// WITHOUT provisioning an external Supabase project.
//
// It is NOT used in production and is not wired into the app. Point the app at
// it with:
//   export SUPABASE_URL=http://localhost:54321          # api-server (verify)
//   export VITE_SUPABASE_URL=http://localhost:54321     # frontend (dev)
//   export SUPABASE_ANON_KEY=local-anon-key
//   export VITE_SUPABASE_ANON_KEY=local-anon-key
//
// Run: node scripts/dev/mock-supabase-auth.mjs
//
// For a faithful setup instead, set the real Supabase env vars (see replit.md).
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.MOCK_GOTRUE_PORT ?? 54321);
const SECRET = "local-dev-secret";

const usersByEmail = new Map(); // email -> user
const tokenToUser = new Map(); // access_token -> user

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function makeJwt(user) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      aud: "authenticated",
      role: "authenticated",
      iat: now,
      exp: now + 60 * 60 * 24 * 365,
    }),
  );
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

function makeUser(email, metadata = {}) {
  const nowIso = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: nowIso,
    phone: "",
    confirmed_at: nowIso,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: metadata,
    identities: [],
    created_at: nowIso,
    updated_at: nowIso,
  };
}

function sessionFor(user) {
  const access_token = makeJwt(user);
  tokenToUser.set(access_token, user);
  return {
    access_token,
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 365,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    refresh_token: b64url(crypto.randomBytes(24)),
    user,
  };
}

function cors(res, origin) {
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  );
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  cors(res, req.headers.origin);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {}

    if (path === "/auth/v1/user" && req.method === "GET") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const user = tokenToUser.get(token);
      if (!user) return json(res, 401, { error: "invalid token" });
      return json(res, 200, user);
    }

    if (path === "/auth/v1/signup" && req.method === "POST") {
      const { email, password, data } = body;
      if (!email || !password) return json(res, 400, { error: "email and password required" });
      let user = usersByEmail.get(email);
      if (!user) {
        user = makeUser(email, data ?? {});
        usersByEmail.set(email, user);
      }
      return json(res, 200, sessionFor(user));
    }

    if (path === "/auth/v1/token" && req.method === "POST") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        const { email } = body;
        let user = usersByEmail.get(email);
        if (!user) {
          user = makeUser(email);
          usersByEmail.set(email, user);
        }
        return json(res, 200, sessionFor(user));
      }
      const anyUser = usersByEmail.values().next().value;
      if (anyUser) return json(res, 200, sessionFor(anyUser));
      return json(res, 400, { error: "no session" });
    }

    if (path === "/auth/v1/logout" && req.method === "POST") {
      res.writeHead(204);
      return res.end();
    }

    if (path === "/auth/v1/settings") {
      return json(res, 200, { external: {}, disable_signup: false, autoconfirm: true });
    }

    return json(res, 404, { error: "not found", path });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[mock-supabase-auth] listening on http://localhost:${PORT}`);
});
