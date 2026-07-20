import express, { type Express } from "express";
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
const allowedOrigins = new Set<string>(
  [
    ...(process.env.REPLIT_DOMAINS?.split(",") ?? []),
    process.env.REPLIT_DEV_DOMAIN,
  ]
    .filter((d): d is string => Boolean(d))
    .map((d) => `https://${d.trim()}`),
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

export default app;
