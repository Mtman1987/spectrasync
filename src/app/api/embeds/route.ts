import { NextResponse, type NextRequest } from "next/server";
import { format } from "date-fns";

import { buildCalendarEmbed } from "@/app/calendar/actions";
import { buildLeaderboardEmbed } from "@/app/leaderboard/actions";
import { getLiveVipUsers } from "@/app/actions";
import { getAdminDb } from "@/lib/firebase-admin";
import type { LiveUser } from "@/app/raid-pile/types";

interface EmbedRequestPayload extends Record<string, unknown> {
  type: string;
  guildId: string;
  channelId?: string;
  header?: string;
  headerTitle?: string;
  headerMessage?: string;
  maxEmbedsPerMessage?: number;
  vipId?: string;
  vipLogin?: string;
  dispatch?: boolean;
}

type EmbedResponsePayload = Record<string, unknown> | null;

interface VipEmbedResponse extends Record<string, unknown> {
  feature: string;
  guildId: string;
  totalVips: number;
  lastUpdatedAt: string;
  refreshHintSeconds: number;
  maxEmbedsPerMessage: number;
  header?: { title?: string | null; message?: string | null };
  messages?: MessageBlock[];
}

type EmbedBuilder = (payload: EmbedRequestPayload) => Promise<EmbedResponsePayload>;
type EmbedObject = Record<string, unknown>;

type MessageBlock = {
  index: number;
  embeds: EmbedObject[];
  metadata: {
    chunk: number;
    totalChunks: number;
    feature: string;
    guildId: string;
    lastUpdatedAt: string;
  };
};

type ClipPreview = {
  sourceClipUrl: string | null;
  gifUrl: string | null;
  note?: string | null;
};

type DispatchSummary =
  | { status: "skipped"; reason?: string }
  | { status: "sent"; count: number; messageIds: string[] }
  | { status: "error"; error: string };

const VIP_REFRESH_SECONDS = 6 * 60;
const DISCORD_MAX_EMBEDS = 10;
const MAX_VIP_CARDS = 100;
const DISCORD_API_BASE = process.env.DISCORD_API_BASE_URL ?? "https://discord.com/api/v10";
const VIP_LIVE_CONFIG_DOC_ID = "vipLiveConfig";

const embedBuilders: Record<string, EmbedBuilder> = {
  calendar: async ({ guildId }) => buildCalendarEmbed(guildId),
  leaderboard: async ({ guildId }) => buildLeaderboardEmbed(guildId),
  "vip-live": buildVipLiveEmbed,
  vip: buildVipLiveEmbed,
  "community-pool": buildUnsupported("community pool"),
  community: buildUnsupported("community pool"),
  "raid-pile": buildUnsupported("raid pile"),
  pile: buildUnsupported("raid pile"),
  "raid-train": buildUnsupported("raid train"),
};

const SECRET_PLACEHOLDERS = new Set([
  "your-super-secret-key-that-you-share-with-your-bot",
  "changeme",
  "placeholder",
]);

function shouldEnforceSecret(secretValue: string | undefined | null) {
  if (!secretValue) {
    return false;
  }

  const normalized = secretValue.trim().toLowerCase();
  return normalized.length > 0 && !SECRET_PLACEHOLDERS.has(normalized);
}

function validateSecret(request: NextRequest) {
  const expectedSecret = process.env.BOT_SECRET_KEY;
  if (!shouldEnforceSecret(expectedSecret)) {
    return { valid: true };
  }

  const providedSecret = request.headers.get("x-bot-secret") ?? request.headers.get("authorization");
  if (!providedSecret) {
    return { valid: false };
  }

  if (providedSecret === expectedSecret) {
    return { valid: true };
  }

  if (providedSecret.toLowerCase().startsWith("bearer ")) {
    const token = providedSecret.slice(7).trim();
    if (token === expectedSecret) {
      return { valid: true };
    }
  }

  return { valid: false };
}

function normalizePayload(rawPayload: unknown): EmbedRequestPayload | null {
  if (!rawPayload || typeof rawPayload !== "object") {
    return null;
  }

  let working = rawPayload as Record<string, unknown>;
  if (
    "root" in working &&
    working.root &&
    typeof working.root === "object" &&
    !Array.isArray(working.root)
  ) {
    working = working.root as Record<string, unknown>;
  }

  const typeValue =
    typeof working.type === "string"
      ? working.type
      : typeof working.feature === "string"
      ? working.feature
      : undefined;

  const guildIdValue =
    typeof working.guildId === "string"
      ? working.guildId
      : typeof working.communityId === "string"
      ? working.communityId
      : undefined;

  if (!typeValue || !guildIdValue) {
    return null;
  }

  const normalized: EmbedRequestPayload = {
    ...(working as EmbedRequestPayload),
    type: typeValue,
    guildId: guildIdValue,
  };

  return normalized;
}

function buildUnsupported(feature: string): EmbedBuilder {
  return async () => ({
    feature,
    embeds: [
      {
        title: `${feature} embed coming soon`,
        description: `The ${feature} embed has not been implemented yet.`,
        color: 0xff5555,
        timestamp: new Date().toISOString(),
      },
    ],
    components: [],
  });
}

function formatStartedAt(iso?: string) {
  if (!iso) {
    return "just now";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  try {
    return format(date, "h:mm a");
  } catch {
    return "just now";
  }
}

function chunkEmbeds(embeds: EmbedObject[], maxPerMessage: number) {
  const messages: EmbedObject[][] = [];
  let current: EmbedObject[] = [];

  for (const embed of embeds) {
    if (current.length >= maxPerMessage) {
      messages.push(current);
      current = [];
    }
    current.push(embed);
  }

  if (current.length > 0) {
    messages.push(current);
  }

  return messages;
}

function pickVipTarget(liveVips: LiveUser[], payload: EmbedRequestPayload) {
  const requestedId = typeof payload.vipId === "string" ? payload.vipId : undefined;
  const requestedLogin =
    typeof payload.vipLogin === "string" ? payload.vipLogin.toLowerCase() : undefined;

  const matchById = requestedId
    ? liveVips.find((vip) => vip.twitchId === requestedId || vip.twitchLogin === requestedId)
    : undefined;
  if (matchById) {
    return matchById;
  }

  if (requestedLogin) {
    const match = liveVips.find((vip) => vip.twitchLogin?.toLowerCase() === requestedLogin);
    if (match) {
      return match;
    }
  }

  return liveVips[0];
}

function pickVipOrdering(liveVips: LiveUser[], payload: EmbedRequestPayload) {
  const primary = pickVipTarget(liveVips, payload);
  if (!primary) {
    return [...liveVips];
  }
  return [primary, ...liveVips.filter((vip) => vip !== primary)];
}

function getClipPreviewPlaceholder(vip: LiveUser): ClipPreview {
  return {
    sourceClipUrl: vip.clipUrl ?? null,
    gifUrl: vip.gifUrl ?? null,
    note:
      vip.gifUrl && vip.gifUrl.trim().length > 0
        ? null
        : "Provide a highlight clip to showcase an animated preview in the embed.",
  };
}

async function buildVipLiveEmbed(payload: EmbedRequestPayload): Promise<EmbedResponsePayload> {
  const guildId = payload.guildId;
  if (!guildId) {
    return null;
  }

  const liveVips = await getLiveVipUsers(guildId);
  const now = new Date();
  const isoNow = now.toISOString();
  const formattedTimestamp = format(now, "MMM d, yyyy h:mm a");

  const rawPayload = payload as Record<string, unknown>;
  const headerCandidates = [
    typeof rawPayload.headerMessage === "string" ? rawPayload.headerMessage : undefined,
    typeof rawPayload.message === "string" ? rawPayload.message : undefined,
    typeof rawPayload.header === "string" ? rawPayload.header : undefined,
  ];

  const headerMessage =
    (headerCandidates.find((value) => typeof value === "string" && value.trim().length) as
      | string
      | undefined)?.trim() ??
    "Our VIPs keep the community adventurous and thriving. Drop in, cheer them on, and help the crew grow!";

  const headerTitleCandidate =
    typeof rawPayload.headerTitle === "string" ? rawPayload.headerTitle.trim() : "";
  const headerTitle = headerTitleCandidate.length > 0 ? headerTitleCandidate : "VIP Live Lounge";

  let maxEmbedsPerMessage = DISCORD_MAX_EMBEDS;
  if (typeof rawPayload.maxEmbedsPerMessage === "number") {
    const coerced = Math.floor(rawPayload.maxEmbedsPerMessage);
    if (Number.isFinite(coerced) && coerced >= 1) {
      maxEmbedsPerMessage = Math.min(DISCORD_MAX_EMBEDS, coerced);
    }
  }

  const headerEmbed: EmbedObject = {
    title: headerTitle,
    description: headerMessage,
    color: 0xa970ff,
    timestamp: isoNow,
  };

  const ordered = liveVips.length ? pickVipOrdering(liveVips, payload) : [];
  const cardEmbeds: EmbedObject[] = [];
  const cardsMeta: Array<Record<string, unknown>> = [];

  if (!ordered.length) {
    cardEmbeds.push({
      description: "No VIPs are live right now. Check back soon for more community adventures!",
      color: 0x5865f2,
      timestamp: isoNow,
    });
  } else {
    ordered.slice(0, MAX_VIP_CARDS).forEach((vip, index) => {
      const viewerCount = typeof vip.latestViewerCount === "number" ? vip.latestViewerCount : 0;
      const startedAtText = formatStartedAt(vip.started_at);
      const clipPreview = getClipPreviewPlaceholder(vip);
      const viewerLabel = viewerCount > 0 ? viewerCount.toLocaleString() : "0";
      const signalStrength = viewerCount > 0 ? `High (${viewerLabel} aboard)` : "Calibrating";

      const descriptionLines: string[] = [];
      if (vip.vipMessage && vip.vipMessage.trim().length > 0) {
        descriptionLines.push(`> ${vip.vipMessage.trim()}`);
      } else if (vip.latestStreamTitle && vip.latestStreamTitle.trim().length > 0) {
        descriptionLines.push(`> ${vip.latestStreamTitle.trim()}`);
      } else {
        descriptionLines.push(`> ${vip.displayName} is live now!`);
      }

      if (vip.latestGameName && vip.latestGameName.trim().length > 0) {
        descriptionLines.push(`> 🎮 Now playing: **${vip.latestGameName.trim()}**`);
      }

      if (startedAtText && startedAtText !== "Unknown") {
        descriptionLines.push(`> ⏱️ Live since ${startedAtText}`);
      }

      const fields: Array<{ name: string; value: string; inline?: boolean }> = [
        { name: "💬 Chat Commands", value: "`!boost`, `!shoutout`, `!warp`", inline: true },
        { name: "🎁 Loot Drops", value: "Cosmic crates every 30 mins", inline: true },
        { name: "📡 Signal Strength", value: signalStrength, inline: true },
      ];

      cardEmbeds.push({
        author:
          vip.avatarUrl || vip.displayName
            ? {
                name: `🌌 ${vip.displayName} Goes Galactic!`,
                icon_url: vip.avatarUrl ?? undefined,
                url: vip.twitchLogin ? `https://twitch.tv/${vip.twitchLogin}` : undefined,
              }
            : undefined,
        title: `🪐 ${vip.latestStreamTitle && vip.latestStreamTitle.trim().length > 0 ? vip.latestStreamTitle.trim() : vip.displayName}`,
        url: vip.twitchLogin ? `https://twitch.tv/${vip.twitchLogin}` : undefined,
        description: descriptionLines.join("\n"),
        color: 0xff9640,
        fields,
        thumbnail: vip.avatarUrl ? { url: vip.avatarUrl } : undefined,
        image: clipPreview.gifUrl ? { url: clipPreview.gifUrl } : undefined,
        footer: {
          text: "Powered by Cosmic Crew • All systems nominal",
          icon_url: "https://cdn.discordapp.com/embed/avatars/0.png",
        },
        timestamp: isoNow,
      });

      cardsMeta.push({
        rank: index + 1,
        displayName: vip.displayName,
        twitchLogin: vip.twitchLogin,
        latestGameName: vip.latestGameName ?? null,
        latestStreamTitle: vip.latestStreamTitle ?? null,
        latestViewerCount: typeof vip.latestViewerCount === "number" ? vip.latestViewerCount : null,
        startedAt: vip.started_at ?? null,
        vipMessage: vip.vipMessage ?? null,
        clip: clipPreview,
      });
    });

    if (ordered.length > MAX_VIP_CARDS) {
      const remaining = ordered.length - MAX_VIP_CARDS;
      cardEmbeds.push({
        description: `+${remaining} additional VIP${remaining === 1 ? "" : "s"} are live.`,
        color: 0x9146ff,
        timestamp: isoNow,
      });
    }
  }

  const footerLines: string[] = [`Last update: ${formattedTimestamp}`, "Updates ~6m"];
  if (typeof rawPayload.channelId === "string" && rawPayload.channelId.trim().length > 0) {
    footerLines.push(`Channel: <#${rawPayload.channelId.trim()}>`);
  }

  const footerEmbed: EmbedObject = {
    color: 0x5865f2,
    description: footerLines.join(" • "),
    timestamp: isoNow,
  };

  const allEmbeds = [headerEmbed, ...cardEmbeds, footerEmbed];
  const messages = chunkEmbeds(allEmbeds, maxEmbedsPerMessage).map<MessageBlock>((chunk, index, all) => ({
    index,
    embeds: chunk,
    metadata: {
      chunk: index + 1,
      totalChunks: all.length,
      feature: "vip-live",
      guildId,
      lastUpdatedAt: isoNow,
    },
  }));

  return {
    feature: "vip-live",
    guildId,
    totalVips: liveVips.length,
    lastUpdatedAt: isoNow,
    refreshHintSeconds: VIP_REFRESH_SECONDS,
    maxEmbedsPerMessage,
    header: {
      title: headerTitle,
      message: headerMessage,
    },
    cards: cardsMeta,
    messages,
  };
}

async function dispatchMessagesToDiscord(messages: MessageBlock[], channelId: string) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    throw new Error("DISCORD_BOT_TOKEN is not configured.");
  }

  const userAgent = process.env.DISCORD_USER_AGENT ?? "SpectraSyncBot/1.0 (+https://spectrasync.app)";
  const ids: string[] = [];

  for (const block of messages) {
    const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
        "User-Agent": userAgent,
      },
      body: JSON.stringify({ embeds: block.embeds }),
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const errorMessage = typeof payload?.message === "string" ? payload.message : text;
      throw new Error(`Discord API error (${response.status}): ${errorMessage}`);
    }

    if (typeof payload?.id === "string") {
      ids.push(payload.id);
    }

    if (messages.length > 1) {
      await delay(250);
    }
  }

  return ids;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function persistVipLiveConfig(
  payload: EmbedRequestPayload,
  responsePayload: EmbedResponsePayload,
  dispatchSummary: DispatchSummary,
) {
  try {
    if (!payload.guildId) {
      return;
    }

    const db = getAdminDb();
    const settingsRef = db
      .collection("communities")
      .doc(payload.guildId)
      .collection("settings")
      .doc(VIP_LIVE_CONFIG_DOC_ID);

    const normalizedChannelId =
      typeof payload.channelId === "string" && payload.channelId.trim().length > 0
        ? payload.channelId.trim()
        : "";
    const dispatchEnabled = Boolean(payload.dispatch && normalizedChannelId);

    if (!dispatchEnabled && !normalizedChannelId && payload.dispatch === false) {
      await settingsRef.delete();
      return;
    }

    const response = (responsePayload ?? {}) as VipEmbedResponse;
    const headerFromResponse = response.header ?? {};

    const data = {
      guildId: payload.guildId,
      channelId: normalizedChannelId || null,
      headerTitle: payload.headerTitle ?? headerFromResponse.title ?? null,
      headerMessage: payload.headerMessage ?? headerFromResponse.message ?? null,
      maxEmbedsPerMessage: payload.maxEmbedsPerMessage ?? response.maxEmbedsPerMessage ?? null,
      refreshHintSeconds: response.refreshHintSeconds ?? VIP_REFRESH_SECONDS,
      lastUpdatedAt: response.lastUpdatedAt ?? new Date().toISOString(),
      dispatchEnabled,
      updatedAt: new Date().toISOString(),
      lastDispatchStatus: dispatchSummary.status,
      lastDispatchMessageIds:
        dispatchSummary.status === "sent" ? dispatchSummary.messageIds ?? [] : [],
    };

    await settingsRef.set(data, { merge: true });
  } catch (error) {
    console.error("Failed to persist VIP live embed configuration", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const secretStatus = validateSecret(request);
    if (!secretStatus.valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (error) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const payload = normalizePayload(rawPayload);
    if (!payload) {
      return NextResponse.json(
        { error: "Missing required field: type or guildId" },
        { status: 400 },
      );
    }

    const normalizedType = payload.type.toLowerCase();
    const builder = embedBuilders[normalizedType];
    if (!builder) {
      return NextResponse.json({ error: `Unsupported embed type: ${payload.type}` }, { status: 400 });
    }

    const responsePayload = await builder(payload);
    if (!responsePayload) {
      return NextResponse.json({ error: "Failed to generate embed payload" }, { status: 500 });
    }

    let statusCode = 200;
    let dispatchSummary: DispatchSummary = { status: "skipped" };

    if (payload.dispatch) {
      if (!payload.channelId || typeof payload.channelId !== "string" || !payload.channelId.trim()) {
        return NextResponse.json(
          { error: "channelId is required when dispatch is enabled" },
          { status: 400 },
        );
      }

      const maybeMessages = (responsePayload as Record<string, unknown>).messages;
      if (!Array.isArray(maybeMessages) || maybeMessages.length === 0) {
        dispatchSummary = { status: "skipped", reason: "No messages to dispatch" };
      } else {
        try {
          const messageIds = await dispatchMessagesToDiscord(
            maybeMessages as MessageBlock[],
            payload.channelId,
          );
          dispatchSummary = {
            status: "sent",
            count: messageIds.length,
            messageIds,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown Discord dispatch error";
          console.error("Failed to dispatch VIP embed to Discord", error);
          dispatchSummary = { status: "error", error: message };
          statusCode = 502;
        }
      }
    }

    await persistVipLiveConfig(payload, responsePayload, dispatchSummary);

    return NextResponse.json(
      {
        ...(responsePayload ?? {}),
        dispatch: dispatchSummary,
      },
      { status: statusCode },
    );
  } catch (error) {
    console.error("Error in /api/embeds route:", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}
