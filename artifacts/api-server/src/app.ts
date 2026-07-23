import express, { type Express, type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const trustProxy = process.env.TRUST_PROXY ?? "1";
app.set(
  "trust proxy",
  trustProxy === "true" ? true : Number.isFinite(Number(trustProxy)) ? Number(trustProxy) : 1,
);

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
  helmet({
    contentSecurityPolicy: false, // SPA + Vite assets; tighten behind nginx if needed
    crossOriginEmbedderPolicy: false,
  }),
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
      callback(null, !origin || allowedOrigins.has(origin));
    },
  }),
);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  skip: (req) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
});

app.use((req, res, next) => {
  const limit = req.path.startsWith("/api/invoices") ? "20mb" : "1mb";
  return express.json({ limit })(req, res, next);
});
app.use(express.urlencoded({ extended: true }));

app.use("/api", apiLimiter, writeLimiter);
app.use("/api", router);

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

// لا تُسرّب تفاصيل داخلية أو stack traces للعميل
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log?.error({ err }, "Unhandled error");
  if (res.headersSent) return;
  res.status(500).json({ error: "خطأ داخلي في الخادم" });
});

export default app;
