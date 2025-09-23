import { setTimeout as sleep } from "node:timers/promises";

export interface RenderGifOptions {
  /** Length of the GIF in seconds. Defaults to 6 seconds. */
  lengthSeconds?: number;
  /** Start offset within the source clip. Defaults to 0. */
  startSeconds?: number;
  /** Output frames per second. Defaults to 15. */
  fps?: number;
  /** Output width in pixels. Defaults to 480. */
  width?: number;
  /** Output height in pixels. Defaults to 270. */
  height?: number;
  /** Time to wait between polling attempts in milliseconds. Defaults to 5000ms. */
  pollIntervalMs?: number;
  /** Maximum number of polling attempts before timing out. Defaults to 24 attempts (~2 minutes). */
  maxAttempts?: number;
}

export interface RenderGifResult {
  gifUrl: string;
  renderId: string;
  status: string;
  metadata: Record<string, unknown> | null;
}

type ShotstackSubmitResponse = {
  success?: boolean;
  response?: {
    id?: string;
    status?: string;
    message?: string;
  };
  error?: unknown;
};

type ShotstackStatusAsset = {
  url?: string;
  type?: string;
  format?: string;
};

type ShotstackStatusResponse = {
  success?: boolean;
  response?: {
    status?: string;
    message?: string;
    output?: ShotstackStatusAsset[];
    assets?: ShotstackStatusAsset[];
    poster?: string;
    thumbnail?: string;
    url?: string;
    data?: Record<string, unknown>;
  };
  error?: unknown;
};

const DEFAULT_BASE_URL = "https://api.shotstack.io/stage";
const RENDER_PATH = "/render";
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_MAX_ATTEMPTS = 24;

function resolveShotstackEndpoint() {
  const configuredBase =
    process.env.SHOTSTACK_API_BASE_URL ??
    process.env.SHOTSTACK_API_URL ??
    process.env.SHOTSTACK_BASE_URL ??
    DEFAULT_BASE_URL;

  const baseUrl = configuredBase.replace(/\/$/, "");
  const apiKey = process.env.SHOTSTACK_API_KEY ?? process.env.SHOTSTACK_KEY ?? process.env.SHOTSTOCK_API_KEY;

  if (!apiKey) {
    throw new Error("Shotstack API key is not configured. Set SHOTSTACK_API_KEY in your environment.");
  }

  return { baseUrl, apiKey };
}

function buildRenderPayload(clipUrl: string, options: RenderGifOptions) {
  const {
    lengthSeconds = 6,
    startSeconds = 0,
    fps = 15,
    width = 480,
    height = 270,
  } = options;

  return {
    timeline: {
      background: "#000000",
      tracks: [
        {
          clips: [
            {
              asset: {
                type: "video",
                src: clipUrl,
              },
              start: Math.max(0, startSeconds),
              length: Math.max(1, lengthSeconds),
            },
          ],
        },
      ],
    },
    output: {
      format: "gif",
      fps,
      size: {
        width,
        height,
      },
    },
  };
}

async function submitRenderJob(clipUrl: string, options: RenderGifOptions): Promise<{ id: string; raw: ShotstackSubmitResponse }> {
  const { baseUrl, apiKey } = resolveShotstackEndpoint();
  const endpoint = `${baseUrl}${RENDER_PATH}`;
  const payload = buildRenderPayload(clipUrl, options);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => null)) as ShotstackSubmitResponse | null;

  if (!response.ok) {
    const message = body?.response?.message ?? body?.error ?? response.statusText;
    throw new Error(`Shotstack render request failed (${response.status}): ${message}`);
  }

  const id = body?.response?.id;
  if (!id) {
    throw new Error("Shotstack render response did not include a render ID.");
  }

  return { id, raw: body ?? {} };
}

async function fetchRenderStatus(renderId: string, options: RenderGifOptions): Promise<ShotstackStatusResponse> {
  const { baseUrl, apiKey } = resolveShotstackEndpoint();
  const endpoint = `${baseUrl}${RENDER_PATH}/${renderId}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
  });

  const body = (await response.json().catch(() => null)) as ShotstackStatusResponse | null;

  if (!response.ok) {
    const message = body?.response?.message ?? body?.error ?? response.statusText;
    throw new Error(`Shotstack render status failed (${response.status}): ${message}`);
  }

  return body ?? {};
}

function extractGifUrl(status: ShotstackStatusResponse): string | null {
  const response = status.response ?? {};
  const candidates: (ShotstackStatusAsset | undefined)[] = [];

  if (Array.isArray(response.output)) {
    candidates.push(...response.output);
  }
  if (Array.isArray(response.assets)) {
    candidates.push(...response.assets);
  }

  const urls = candidates
    .filter((asset): asset is ShotstackStatusAsset => Boolean(asset))
    .map((asset) => asset.url)
    .filter((url): url is string => typeof url === "string" && url.trim().length > 0);

  const gifCandidate = urls.find((url) => url.toLowerCase().endsWith(".gif"));
  if (gifCandidate) {
    return gifCandidate;
  }

  const fallbackUrl =
    urls[0] ?? response.url ?? response.poster ?? response.thumbnail ?? undefined;
  return typeof fallbackUrl === "string" && fallbackUrl.trim().length > 0 ? fallbackUrl : null;
}

function normalizeStatus(status: unknown): string {
  if (typeof status !== "string") {
    return "";
  }
  return status.trim().toLowerCase();
}

async function waitForRenderCompletion(renderId: string, options: RenderGifOptions): Promise<ShotstackStatusResponse> {
  const pollInterval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(pollInterval);
    }

    const status = await fetchRenderStatus(renderId, options);
    const normalizedStatus = normalizeStatus(status.response?.status);

    if (["done", "finished", "success", "complete", "completed"].includes(normalizedStatus)) {
      return status;
    }

    if (["failed", "error", "cancelled", "canceled"].includes(normalizedStatus)) {
      const message = status.response?.message ?? status.error ?? "Shotstack render failed.";
      throw new Error(typeof message === "string" ? message : JSON.stringify(message));
    }
  }

  const attempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const interval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const totalSeconds = (attempts * interval) / 1000;

  throw new Error(`Shotstack render ${renderId} did not complete within ${totalSeconds}s.`);
}

export async function renderGifFromClip(
  clipUrl: string,
  options: RenderGifOptions = {},
): Promise<RenderGifResult> {
  if (!clipUrl || clipUrl.trim().length === 0) {
    throw new Error("A source clip URL is required to render a GIF.");
  }

  const submission = await submitRenderJob(clipUrl.trim(), options);
  const finalStatus = await waitForRenderCompletion(submission.id, options);
  const gifUrl = extractGifUrl(finalStatus);

  if (!gifUrl) {
    throw new Error("Shotstack render completed without providing a GIF URL.");
  }

  const metadata: Record<string, unknown> | null = finalStatus.response?.data ?? null;

  return {
    gifUrl,
    renderId: submission.id,
    status: finalStatus.response?.status ?? "done",
    metadata,
  };
}

