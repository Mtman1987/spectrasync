import { NextResponse, type NextRequest } from "next/server";
import { format } from "date-fns";

import { buildCalendarEmbed } from "@/app/calendar/actions";
import { buildLeaderboardEmbed } from "@/app/leaderboard/actions";
import { getLiveVipUsers } from "@/app/actions";
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
}

type EmbedResponsePayload = Record<string, unknown> | null;
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

const VIP_REFRESH_SECONDS = 7 * 60;
const DISCORD_MAX_EMBEDS = 10;
const MAX_VIP_CARDS = 100;

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
  if (!secretValue) return false;
  const normalized = secretValue.trim().toLowerCase();
  return normalized.length > 0 && !SECRET_PLACEHOLDERS.has(normalized);
}

function validateSecret(request: NextRequest) {
  const expectedSecret = process.env.BOT_SECRET_KEY;
  if (!shouldEnforceSecret(expectedSecret)) return { valid: true };

  const providedSecret = request.headers.get("x-bot-secret") ?? request.headers.get("authorization");
  if (!providedSecret) return { valid: false };
  if (providedSecret === expectedSecret) return { valid: true };

  if (providedSecret.toLowerCase().startsWith("bearer ")) {
    const token = providedSecret.slice(7).trim();
    if (token === expectedSecret) return { valid: true };
  }
  return { valid: false };
}

function normalizePayload(rawPayload: unknown): EmbedRequestPayload | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;

  let working = rawPayload as Record<string, unknown>;
  if ("root" in working && working.root && typeof working.root === "object" && !Array.isArray(working.root)) {
    working = working.root as Record<string, unknown>;
  }

  const typeValue =
    typeof working.type === "string" ? working.type :
    typeof working.feature === "string" ? working.feature :
    undefined;

  const guildIdValue =
    typeof working.guildId === "string" ? working.guildId :
    typeof working.communityId === "string" ? working.communityId :
    undefined;

  if (!typeValue || !guildIdValue) return null;

  return {
    ...(working as EmbedRequestPayload),
    type: typeValue,
    guildId: guildIdValue,
  };
}

function buildUnsupported(feature: string): EmbedBuilder {
  return async () => ({
    embeds: [{
      title: `${feature} embed coming soon`,
      description: `The ${feature} embed has not been implemented yet.`,
      color: 0xff5555,
      timestamp: new Date().toISOString(),
    }],
    components: [],
  });
}

function formatStartedAt(iso?: string) {
  if (!iso) return "just now";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "just now";
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
  if (current.length > 0) messages.push(current);
  return messages;
}

function pickVipTarget(liveVips: LiveUser[], payload: EmbedRequestPayload) {
  const requestedId = typeof payload.vipId === "string" ? payload.vipId : undefined;
  const requestedLogin = typeof payload.vipLogin === "string" ? payload.vipLogin.toLowerCase() : undefined;

  const matchById = requestedId
    ? liveVips.find((vip) => vip.twitchId === requestedId || vip.twitchLogin === requestedId)
    : undefined;
  if (matchById) return matchById;

  if (requestedLogin) {
    const match = liveVips.find((vip) => vip.twitchLogin?.toLowerCase() === requestedLogin);
    if (match) return match;
  }
  return liveVips[0];
}

function pickVipOrdering(liveVips: LiveUser[], payload: EmbedRequestPayload) {
  const primary = pickVipTarget(liveVips, payload);
  if (!primary) return [...liveVips];
  return [primary, ...liveVips.filter((vip) => vip !== primary)];
}

async function buildVipLiveEmbed(payload: EmbedRequestPayload): Promise<EmbedResponsePayload> {
  const guildId = payload.guildId;
  if (!guildId) return null;

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
    (headerCandidates.find((value) => typeof value === "string" && value.trim().length) as string | undefined)?.trim() ??
    "Our VIPs keep the community adventurous and thriving. Drop in, cheer them on, and help the crew grow!";

  const headerTitleCandidate = typeof rawPayload.headerTitle === "string" ? rawPayload.headerTitle.trim() : "";
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

      const fields: Array<{ name: string; value: string; inline?: boolean }> = [
        { name: "Streaming", value: vip.latestGameName || "N/A", inline: true },
        { name: "Viewers", value: `${viewerCount}`, inline: true },
      ];

      if (vip.vipMessage && vip.vipMessage.trim().length > 0) {
        fields.push({ name: "VIP Message", value: vip.vipMessage.trim(), inline: false });
      }

      cardEmbeds.push({
        title: `${index + 1}. ${vip.displayName}`,
        url: vip.twitchLogin ? `https://twitch.tv/${vip.twitchLogin}` : undefined,
        description: vip.latestStreamTitle || "Streaming now!",
        color: index === 0 ? 0x9146ff : 0x4864ff,
        fields,
        thumbnail: vip.avatarUrl ? { url: vip.avatarUrl } : undefined,
        footer: { text: `Live since ${startedAtText}` },
        timestamp: isoNow,
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

  const footerLines: string[] = [`Last update: ${formattedTimestamp}`, "Updates ~7m"];
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

  const cardsMeta = ordered.map((vip, index) => ({
    rank: index + 1,
    displayName: vip.displayName,
    twitchLogin: vip.twitchLogin,
    latestGameName: vip.latestGameName ?? null,
    latestStreamTitle: vip.latestStreamTitle ?? null,
    latestViewerCount: typeof vip.latestViewerCount === "number" ? vip.latestViewerCount : null,
    startedAt: vip.started_at ?? null,
    vipMessage: vip.vipMessage ?? null,
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

async function buildCommunityPoolEmbed(payload: EmbedRequestPayload): Promise<EmbedResponsePayload> {
  return buildUnsupported("community pool")(payload);
}

async function buildRaidPileEmbed(payload: EmbedRequestPayload): Promise<EmbedResponsePayload> {
  return buildUnsupported("raid pile")(payload);
}

async function buildRaidTrainEmbed(payload: EmbedRequestPayload): Promise<EmbedResponsePayload> {
  return buildUnsupported("raid train")(payload);
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
      return NextResponse.json({ error: "Missing required field: type or guildId" }, { status: 400 });
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

    return NextResponse.json(responsePayload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
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
