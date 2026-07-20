import express, { type Express } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Behind the Replit proxy: trust one hop so req.ip reflects the client,
// not the proxy, for accurate per-client rate limiting.
app.set("trust proxy", 1);

// CORS allowlist: only the app's own domains. The frontend is served from
// the same origin via path-based routing, so cross-origin access is not
// needed for normal operation.
// ALLOWED_ORIGINS supports non-Replit hosting (comma-separated, with or
// without the https:// prefix).
const allowedOrigins = new Set<string>(
  [
    ...(process.env.REPLIT_DOMAINS?.split(",") ?? []),
    ...(process.env.ALLOWED_ORIGINS?.split(",") ?? []),
    process.env.REPLIT_DEV_DOMAIN,
  ]
    .filter((d): d is string => Boolean(d))
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => (d.startsWith("http://") || d.startsWith("https://") ? d : `https://${d}`)),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin / non-browser requests (no Origin header).
      // Disallowed origins get no CORS headers (browser blocks the
      // response) without leaking a stack trace via a thrown error.
      callback(null, !origin || allowedOrigins.has(origin));
    },
  }),
);

// Global rate limit for all API routes.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Stricter limit for write operations to prevent database flooding.
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  skip: (req) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
});

app.use(express.json({ limit: "20mb" })); // فواتير مرفوعة كـ base64 لتحليلها بالذكاء الاصطناعي
app.use(express.urlencoded({ extended: true }));

app.use("/api", apiLimiter, writeLimiter);

app.use("/api", router);

// Single-service hosting: when the built frontend exists next to this bundle
// (or STATIC_DIR points at it), serve it with an SPA fallback. On Replit the
// deployment router serves the SPA separately and this block is a no-op.
const staticDir = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "erb-platform",
      "dist",
      "public",
    );

if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
  logger.info({ staticDir }, "Serving frontend static files");
}

export default app;
