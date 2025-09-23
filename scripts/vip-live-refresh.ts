import "dotenv/config";
import { setTimeout as sleep } from "node:timers/promises";

import { getAdminDb } from "@/lib/firebase-admin";

interface VipLiveConfigDoc {
  channelId: string | null;
  guildId: string;
  headerTitle?: string | null;
  headerMessage?: string | null;
  maxEmbedsPerMessage?: number | null;
  refreshHintSeconds?: number | null;
  dispatchEnabled?: boolean;
  lastUpdatedAt?: string | null;
}

const endpoint = process.env.VIP_EMBED_ENDPOINT ?? "http://localhost:9002/api/embeds";
const defaultIntervalSeconds = Number.parseInt(process.env.VIP_REFRESH_INTERVAL_SECONDS ?? "420", 10) || 420;
const botSecret = process.env.BOT_SECRET_KEY ?? "";
const guildIdFromEnv = process.env.GUILD_ID ?? process.env.HARDCODED_GUILD_ID ?? "";
const vipConfigDocId = "vipLiveConfig";

let stopRequested = false;

process.once("SIGINT", () => {
  console.info("[vip-live-refresh] Caught SIGINT. Shutting down.");
  stopRequested = true;
});

process.once("SIGTERM", () => {
  console.info("[vip-live-refresh] Caught SIGTERM. Shutting down.");
  stopRequested = true;
});

function resolveGuildId(): string | null {
  if (guildIdFromEnv.trim().length > 0) {
    return guildIdFromEnv.trim();
  }

  console.warn("[vip-live-refresh] GUILD_ID is not set. Waiting for configuration.");
  return null;
}

async function fetchVipConfig(guildId: string): Promise<VipLiveConfigDoc | null> {
  const db = getAdminDb();
  const doc = await db
    .collection("communities")
    .doc(guildId)
    .collection("settings")
    .doc(vipConfigDocId)
    .get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as VipLiveConfigDoc;
}

function buildDispatchBody(guildId: string, config: VipLiveConfigDoc) {
  const body: Record<string, unknown> = {
    type: "vip-live",
    guildId,
    channelId: config.channelId,
    dispatch: true,
  };

  if (config.headerTitle) {
    body.headerTitle = config.headerTitle;
  }
  if (config.headerMessage) {
    body.headerMessage = config.headerMessage;
  }
  if (typeof config.maxEmbedsPerMessage === "number") {
    body.maxEmbedsPerMessage = config.maxEmbedsPerMessage;
  }

  return body;
}

async function dispatchVipEmbed(guildId: string, config: VipLiveConfigDoc) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (botSecret.trim().length > 0) {
    headers["x-bot-secret"] = botSecret.trim();
  }

  const body = buildDispatchBody(guildId, config);

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    console.error(
      `[vip-live-refresh] Dispatch failed (${response.status}):`,
      payload?.error ?? payload ?? "Unknown error",
    );
    return payload;
  }

  console.info(
    "[vip-live-refresh] Dispatch summary:",
    JSON.stringify(payload?.dispatch ?? {}, null, 2),
  );

  return payload;
}

async function loop() {
  while (!stopRequested) {
    const guildId = resolveGuildId();
    if (!guildId) {
      await sleep(defaultIntervalSeconds * 1000);
      continue;
    }

    let config: VipLiveConfigDoc | null = null;

    try {
      config = await fetchVipConfig(guildId);
    } catch (error) {
      console.error("[vip-live-refresh] Failed to read VIP configuration:", error);
      await sleep(defaultIntervalSeconds * 1000);
      continue;
    }

    if (!config || !config.dispatchEnabled || !config.channelId) {
      console.info("[vip-live-refresh] No active VIP embed configuration. Sleeping...");
      const sleepSeconds = config?.refreshHintSeconds ?? defaultIntervalSeconds;
      await sleep(Math.max(30, sleepSeconds) * 1000);
      continue;
    }

    try {
      const payload = await dispatchVipEmbed(guildId, config);
      const nextIntervalSeconds =
        (payload?.refreshHintSeconds as number | undefined) ??
        config.refreshHintSeconds ??
        defaultIntervalSeconds;
      await sleep(Math.max(30, nextIntervalSeconds) * 1000);
    } catch (error) {
      console.error("[vip-live-refresh] Unexpected error during dispatch:", error);
      await sleep(defaultIntervalSeconds * 1000);
    }
  }
}

loop().catch((error) => {
  console.error("[vip-live-refresh] Fatal error:", error);
  process.exit(1);
});
