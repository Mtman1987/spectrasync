import "dotenv/config";

import { createVipLiveScheduler } from "@/server/vip-live-scheduler";

async function main() {
  const scheduler = createVipLiveScheduler();

  const handleShutdown = async (signal: NodeJS.Signals) => {
    console.info(`[vip-live-refresh] Caught ${signal}. Shutting down.`);
    await scheduler.stop();
  };

  process.once("SIGINT", () => {
    void handleShutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void handleShutdown("SIGTERM");
  });

  await scheduler.start();
  await scheduler.waitForStop();
}

main().catch((error) => {
  console.error("[vip-live-refresh] Fatal error:", error);
  process.exit(1);
});
