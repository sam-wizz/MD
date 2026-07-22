import app from "./app";
import { logger } from "./lib/logger";
import { startReorderSuggestionScheduler } from "./services/reorder-suggestion-scheduler";

// Replit always provides PORT in production; 5000 is the local-dev fallback.
const rawPort = process.env["PORT"] ?? "5000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startReorderSuggestionScheduler();
});
