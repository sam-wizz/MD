import app from "./app";
import { logger } from "./lib/logger";

// Replit/Railway inject PORT; Hetzner Docker defaults to 8080 via compose.
// HOST=0.0.0.0 is required inside containers / behind nginx.
const rawPort = process.env["PORT"] ?? "5000";
const host = process.env["HOST"] ?? "0.0.0.0";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, host, () => {
  logger.info({ port, host }, "Server listening");
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
