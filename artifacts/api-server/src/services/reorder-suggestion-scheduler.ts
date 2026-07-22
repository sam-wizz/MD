import { logger } from "../lib/logger";
import { getReorderSuggestionService } from "./reorder-suggestion-runtime";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
let intervalHandle: NodeJS.Timeout | undefined;

export function startReorderSuggestionScheduler(): void {
  if (intervalHandle) return;

  intervalHandle = setInterval(async () => {
    try {
      const service = getReorderSuggestionService();
      const result = await service.generateForEligibleClients("scheduled", null);
      logger.info({ result }, "Scheduled POS reorder suggestion run completed");
    } catch (error) {
      logger.error(
        { err: error },
        "Scheduled POS reorder suggestion run failed",
      );
    }
  }, ONE_DAY_MS);

  logger.info("POS reorder suggestion scheduler started (daily)");
}
