import "dotenv/config";

const DEFAULT_ENDPOINT = process.env.VIP_EMBED_ENDPOINT ?? "http://localhost:9002/api/embeds";
const DEFAULT_INTERVAL_SECONDS = Number(process.env.VIP_REFRESH_INTERVAL_SECONDS ?? "420");
const GUILD_ID = process.env.GUILD_ID ?? process.env.HARDCODED_GUILD_ID ?? "";
const CHANNEL_ID = process.env.DISCORD_VIP_CHANNEL_ID ?? process.env.DISCORD_CHANNEL_ID ?? "";
const BOT_SECRET = process.env.BOT_SECRET_KEY ?? process.env.BOT_SECRET ?? "";

if (!GUILD_ID) {
  console.error("[vip-live-refresh] Missing GUILD_ID (or HARDCODED_GUILD_ID) in environment.");
  process.exit(1);
}

if (!CHANNEL_ID) {
  console.error("[vip-live-refresh] Missing DISCORD_VIP_CHANNEL_ID (or DISCORD_CHANNEL_ID) in environment.");
  process.exit(1);
}

const endpoint = DEFAULT_ENDPOINT;
const intervalSeconds = Number.isFinite(DEFAULT_INTERVAL_SECONDS) && DEFAULT_INTERVAL_SECONDS > 0
  ? DEFAULT_INTERVAL_SECONDS
  : 420;

let timer: NodeJS.Timeout | null = null;
let running = false;

async function runCycle() {
  if (running) {
    console.warn("[vip-live-refresh] Previous cycle still running. Skipping this tick.");
    return;
  }

  running = true;
  const startedAt = new Date();
  console.info(`[vip-live-refresh] Dispatching VIP embed at ${startedAt.toISOString()}`);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(BOT_SECRET ? { "x-bot-secret": BOT_SECRET } : {}),
      },
      body: JSON.stringify({
        type: "vip-live",
        guildId: GUILD_ID,
        channelId: CHANNEL_ID,
        dispatch: true,
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error(
        `[vip-live-refresh] Dispatch failed (${response.status}):`,
        payload?.error ?? payload ?? "Unknown error",
      );
    } else {
      const meta = payload?.dispatch ?? {};
      console.info(
        `[vip-live-refresh] Dispatch summary:`,
        JSON.stringify(meta, null, 2),
      );
    }
  } catch (error) {
    console.error("[vip-live-refresh] Unexpected error while dispatching VIP embed:", error);
  } finally {
    running = false;
  }
}

function startTimer() {
  timer = setInterval(runCycle, intervalSeconds * 1000);
  timer.unref?.();
  runCycle().catch((error) => {
    console.error("[vip-live-refresh] Initial run failed:", error);
  });
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

process.once("SIGINT", () => {
  console.info("[vip-live-refresh] Caught SIGINT. Shutting down.");
  stopTimer();
  process.exit(0);
});

process.once("SIGTERM", () => {
  console.info("[vip-live-refresh] Caught SIGTERM. Shutting down.");
  stopTimer();
  process.exit(0);
});

startTimer();
