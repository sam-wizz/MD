import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Boot-time env: the DB pool is created lazily, so a dummy URL is enough for
// routes that fail validation before touching the database.
process.env["DATABASE_URL"] ??= "postgres://test:test@localhost:5432/test";
process.env["SUPABASE_URL"] = "https://supabase.test";
process.env["SUPABASE_ANON_KEY"] = "anon-test";
delete process.env["ADMIN_EMAILS"];

// Stub Supabase token verification: "valid-token" maps to a fixed user,
// anything else is rejected. Imported app uses global fetch, so stub first.
const realFetch = globalThis.fetch;
vi.stubGlobal(
  "fetch",
  vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    if (url.startsWith("https://supabase.test/auth/v1/user")) {
      const auth = (init?.headers as Record<string, string> | undefined)?.["Authorization"] ?? "";
      if (auth === "Bearer valid-token") {
        return new Response(JSON.stringify({ id: "user-1", email: "user@example.com" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", { status: 401 });
    }
    return realFetch(input, init);
  }),
);

const { default: app } = await import("./app");

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("health", () => {
  it("GET /api/healthz returns ok without auth", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("auth gate", () => {
  it("rejects requests without a token", async () => {
    const res = await request(app).get("/api/profiles/me");
    expect(res.status).toBe(401);
  });

  it("rejects requests with an invalid token", async () => {
    const res = await request(app)
      .get("/api/orders/mine")
      .set("Authorization", "Bearer wrong-token");
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users on admin routes", async () => {
    const res = await request(app)
      .get("/api/admin/orders")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(403);
  });
});

describe("security headers", () => {
  it("sets helmet headers on responses", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("input validation", () => {
  it("POST /api/profiles rejects missing required fields", async () => {
    const res = await request(app)
      .post("/api/profiles")
      .set("Authorization", "Bearer valid-token")
      .send({});
    expect(res.status).toBe(400);
  });

  it("POST /api/profiles ignores client email/user_id (still validates role)", async () => {
    const res = await request(app)
      .post("/api/profiles")
      .set("Authorization", "Bearer valid-token")
      .send({
        user_id: "attacker",
        email: "spoof@evil.com",
        full_name: "Test User",
        company_name: "Test Co",
        role: "superuser",
      });
    expect(res.status).toBe(400);
  });

  it("POST /api/orders rejects missing required fields", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer valid-token")
      .send({ items: "٥ كراتين أرز" });
    expect(res.status).toBe(400);
  });

  it("PATCH /api/orders/:id/status rejects invalid status", async () => {
    const res = await request(app)
      .patch("/api/orders/1/status")
      .set("Authorization", "Bearer valid-token")
      .send({ status: "approved" });
    expect(res.status).toBe(400);
  });
});
