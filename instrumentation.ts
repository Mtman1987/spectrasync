import "dotenv/config";

import { ensureVipLiveScheduler } from "./src/server/vip-live-scheduler";

export async function register(): Promise<void> {
  if (process.env.DISABLE_VIP_REFRESH === "true") {
    return;
  }

  ensureVipLiveScheduler();
}
