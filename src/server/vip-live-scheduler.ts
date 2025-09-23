import { setTimeout as sleep } from "node:timers/promises";

import { getAdminDb } from "@/lib/firebase-admin";

type Logger = Pick<typeof console, "info" | "warn" | "error">;

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

export interface VipLiveSchedulerOptions {
  endpoint?: string;
  defaultIntervalSeconds?: number;
  guildId?: string;
  logger?: Logger;
}

interface VipDispatchPayload {
  refreshHintSeconds?: number;
  [key: string]: unknown;
}

const MIN_INTERVAL_SECONDS = 30;

const globalForVipScheduler = globalThis as typeof globalThis & {
  __vipLiveScheduler__?: VipLiveScheduler;
};

function isAbortError(error: unknown): boolean {
  return (error instanceof Error && error.name === "AbortError") ||
    (typeof error === "object" && error !== null && "name" in error && (error as { name: unknown }).name === "AbortError");
}

async function sleepWithSignal(milliseconds: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) {
    return false;
  }

  try {
    await sleep(milliseconds, undefined, { signal });
    return true;
  } catch (error) {
    if (isAbortError(error)) {
      return false;
    }
    throw error;
  }
}

export class VipLiveScheduler {
  private readonly endpoint: string;
  private readonly defaultIntervalSeconds: number;
  private readonly botSecret: string;
  private readonly initialGuildId: string;
  private readonly logger: Logger;
  private readonly abortController = new AbortController();
  private runPromise: Promise<void> | null = null;

  constructor(private readonly options: VipLiveSchedulerOptions = {}) {
    this.logger = options.logger ?? console;
    this.endpoint =
      options.endpoint ?? process.env.VIP_EMBED_ENDPOINT ?? "http://localhost:9002/api/embeds";

    const defaultInterval = Number.parseInt(
      options.defaultIntervalSeconds?.toString() ?? process.env.VIP_REFRESH_INTERVAL_SECONDS ?? "420",
      10,
    );
    this.defaultIntervalSeconds = Number.isFinite(defaultInterval) && defaultInterval > 0 ? defaultInterval : 420;

    this.botSecret = process.env.BOT_SECRET_KEY ?? "";
    this.initialGuildId = options.guildId ?? process.env.GUILD_ID ?? process.env.HARDCODED_GUILD_ID ?? "";
  }

  start(): Promise<void> {
    if (this.runPromise) {
      return this.runPromise;
    }

    this.runPromise = this.loop();
    return this.runPromise;
  }

  async stop(): Promise<void> {
    this.abortController.abort();
    try {
      await this.runPromise;
    } catch (error) {
      if (!isAbortError(error)) {
        throw error;
      }
    }
  }

  isRunning(): boolean {
    return !!this.runPromise && !this.abortController.signal.aborted;
  }

  waitForStop(): Promise<void> {
    return this.runPromise ?? Promise.resolve();
  }

  private resolveGuildId(): string | null {
    const envGuildId = this.initialGuildId.trim();
    if (envGuildId.length > 0) {
      return envGuildId;
    }

    this.logger.warn("[vip-live-refresh] GUILD_ID is not set. Waiting for configuration.");
    return null;
  }

  private async fetchVipConfig(guildId: string): Promise<VipLiveConfigDoc | null> {
    const db = getAdminDb();
    const doc = await db
      .collection("communities")
      .doc(guildId)
      .collection("settings")
      .doc("vipLiveConfig")
      .get();

    if (!doc.exists) {
      return null;
    }

    return doc.data() as VipLiveConfigDoc;
  }

  private buildDispatchBody(guildId: string, config: VipLiveConfigDoc): Record<string, unknown> {
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

  private async dispatchVipEmbed(
    guildId: string,
    config: VipLiveConfigDoc,
    signal: AbortSignal,
  ): Promise<VipDispatchPayload | null> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.botSecret.trim().length > 0) {
      headers["x-bot-secret"] = this.botSecret.trim();
    }

    const body = this.buildDispatchBody(guildId, config);

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });

    const payload = (await response.json().catch(() => null)) as VipDispatchPayload | null;

    if (!response.ok) {
      this.logger.error(
        `[vip-live-refresh] Dispatch failed (${response.status}):`,
        (payload as { error?: unknown })?.error ?? payload ?? "Unknown error",
      );
      return payload;
    }

    this.logger.info(
      "[vip-live-refresh] Dispatch summary:",
      JSON.stringify((payload as { dispatch?: unknown })?.dispatch ?? {}, null, 2),
    );

    return payload;
  }

  private async loop(): Promise<void> {
    const { signal } = this.abortController;

    while (!signal.aborted) {
      const guildId = this.resolveGuildId();
      if (!guildId) {
        const shouldContinue = await sleepWithSignal(this.defaultIntervalSeconds * 1000, signal);
        if (!shouldContinue) {
          break;
        }
        continue;
      }

      let config: VipLiveConfigDoc | null = null;

      try {
        config = await this.fetchVipConfig(guildId);
      } catch (error) {
        if (isAbortError(error)) {
          break;
        }

        this.logger.error("[vip-live-refresh] Failed to read VIP configuration:", error);
        const shouldContinue = await sleepWithSignal(this.defaultIntervalSeconds * 1000, signal);
        if (!shouldContinue) {
          break;
        }
        continue;
      }

      if (!config || !config.dispatchEnabled || !config.channelId) {
        this.logger.info("[vip-live-refresh] No active VIP embed configuration. Sleeping...");
        const sleepSeconds = config?.refreshHintSeconds ?? this.defaultIntervalSeconds;
        const shouldContinue = await sleepWithSignal(
          Math.max(MIN_INTERVAL_SECONDS, sleepSeconds) * 1000,
          signal,
        );
        if (!shouldContinue) {
          break;
        }
        continue;
      }

      try {
        const payload = await this.dispatchVipEmbed(guildId, config, signal);
        const nextIntervalSeconds =
          (payload?.refreshHintSeconds as number | undefined) ??
          config.refreshHintSeconds ??
          this.defaultIntervalSeconds;

        const shouldContinue = await sleepWithSignal(
          Math.max(MIN_INTERVAL_SECONDS, nextIntervalSeconds) * 1000,
          signal,
        );
        if (!shouldContinue) {
          break;
        }
      } catch (error) {
        if (isAbortError(error)) {
          break;
        }

        this.logger.error("[vip-live-refresh] Unexpected error during dispatch:", error);
        const shouldContinue = await sleepWithSignal(this.defaultIntervalSeconds * 1000, signal);
        if (!shouldContinue) {
          break;
        }
      }
    }
  }
}

export function createVipLiveScheduler(options?: VipLiveSchedulerOptions): VipLiveScheduler {
  return new VipLiveScheduler(options);
}

export function ensureVipLiveScheduler(options?: VipLiveSchedulerOptions): VipLiveScheduler {
  if (globalForVipScheduler.__vipLiveScheduler__) {
    return globalForVipScheduler.__vipLiveScheduler__;
  }

  const scheduler = new VipLiveScheduler(options);
  globalForVipScheduler.__vipLiveScheduler__ = scheduler;
  void scheduler.start();
  return scheduler;
}
