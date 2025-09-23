
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { renderGifFromClip } from '@/lib/shotstack';
import type { Webhook } from '../settings/actions';
import type { LiveUser } from '../raid-pile/types';

const DEFAULT_TEST_CLIP_URL =
  process.env.VIP_TEST_CLIP_URL ??
  'https://www.twitch.tv/swordsmaneb/clip/CulturedAffluentJellyfishPRChase-7mAyvT1tE2yRCOSt';

const DEFAULT_TEST_GIF_URL =
  process.env.VIP_TEST_GIF_URL ??
  'https://i.ibb.co/cSB5dBbv/314902552281-offset-1580-ezgif-com-video-to-gif-converter.gif';

const FALLBACK_FOOTER_ICON = process.env.VIP_FOOTER_ICON_URL ?? 'https://cdn.discordapp.com/embed/avatars/0.png';

async function resolveVipGifUrl(vip: LiveUser): Promise<string | null> {
  if (vip.gifUrl && vip.gifUrl.trim().length > 0) {
    return vip.gifUrl;
  }

  const clipUrl = vip.clipUrl && vip.clipUrl.trim().length > 0 ? vip.clipUrl : DEFAULT_TEST_CLIP_URL;
  if (!clipUrl || clipUrl.trim().length === 0) {
    return DEFAULT_TEST_GIF_URL ?? null;
  }

  try {
    const { gifUrl } = await renderGifFromClip(clipUrl, {
      lengthSeconds: 6,
      fps: 15,
      width: 480,
      height: 270,
    });
    return gifUrl;
  } catch (error) {
    console.error(`[sendVipLiveNotification] GIF conversion failed for ${vip.displayName}:`, error);
    return DEFAULT_TEST_GIF_URL ?? null;
  }
}

function formatSignalStrength(viewerCount: number): string {
  if (viewerCount >= 200) {
    return `Overcharged (${viewerCount.toLocaleString()} aboard)`;
  }
  if (viewerCount >= 75) {
    return `High (${viewerCount.toLocaleString()} aboard)`;
  }
  if (viewerCount > 0) {
    return `Steady (${viewerCount.toLocaleString()} aboard)`;
  }
  return 'Calibrating';
}

/**
 * Sends a "go live" notification to all enabled webhooks for a given VIP.
 */
export async function sendVipLiveNotification(guildId: string, vip: LiveUser) {
  if (!guildId || !vip) {
    return { success: false, error: 'Missing guild or VIP information.' };
  }

  try {
    const db = getAdminDb();

    // 1. Fetch all enabled webhooks for the guild
    const webhooksSnapshot = await db
      .collection(`communities/${guildId}/webhooks`)
      .where('enabled', '==', true)
      .get();
    const webhooks = webhooksSnapshot.docs.map(
      (doc) => doc.data() as Omit<Webhook, 'id'>
    );

    if (webhooks.length === 0) {
      return {
        success: false,
        error: 'No enabled webhooks found. Please configure them in Settings.',
      };
    }

    const gifUrl = await resolveVipGifUrl(vip);
    const viewerCount = typeof vip.latestViewerCount === 'number' ? vip.latestViewerCount : 0;
    const vipMessage = vip.vipMessage && vip.vipMessage.trim().length > 0
      ? vip.vipMessage.trim()
      : 'Space Mountain Broadcast: The stars align for a mission of generosity. Join the orbit, lift spirits, and vibe with the crew.';

    const embedDescription = `> ${vipMessage}`;
    const signalStrength = formatSignalStrength(viewerCount);

    // 2. Construct the rich embed payload for Discord
    const embed = {
      author: {
        name: `🌌 ${vip.displayName} Goes Galactic!`,
        url: `https://www.twitch.tv/${vip.twitchLogin}`,
        icon_url: vip.avatarUrl ?? undefined,
      },
      title: `🪐 ${vip.latestStreamTitle && vip.latestStreamTitle.trim().length > 0 ? vip.latestStreamTitle.trim() : 'Live on Twitch'}`,
      url: `https://www.twitch.tv/${vip.twitchLogin}`,
      description: embedDescription,
      color: 0xff9640,
      fields: [
        {
          name: '💬 Chat Commands',
          value: '`!boost`, `!shoutout`, `!warp`',
          inline: true,
        },
        {
          name: '🎁 Loot Drops',
          value: 'Cosmic crates every 30 mins',
          inline: true,
        },
        {
          name: '📡 Signal Strength',
          value: signalStrength,
          inline: true,
        },
      ],
      thumbnail: vip.avatarUrl ? { url: vip.avatarUrl } : undefined,
      image: gifUrl ? { url: gifUrl } : undefined,
      footer: {
        text: 'Powered by Cosmic Crew • All systems nominal',
        icon_url: FALLBACK_FOOTER_ICON,
      },
      timestamp: new Date().toISOString(),
    };

    const webhookPayload = {
      content: `**🛰️ Transmission from Space Mountain**\n${vip.displayName} is live now—crew morale is high and the cosmic vibes are flowing!`,
      embeds: [embed],
      username: 'Cosmic Raid Announcer', // You can customize this
      allowed_mentions: { parse: [] },
    };

    // 3. Send the message to all enabled webhooks in parallel
    const webhookPromises = webhooks.map((hook) =>
      fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      })
        .then((response) => {
          if (!response.ok) {
            console.error(
              `Error sending to webhook ${hook.name}: ${response.status} ${response.statusText}`
            );
            // Don't throw here, just log, so one failed webhook doesn't stop others.
          }
        })
        .catch((error) => {
          console.error(`Failed to fetch webhook ${hook.name}:`, error);
        })
    );

    await Promise.all(webhookPromises);

    return { success: true };
  } catch (error) {
    console.error('Error sending VIP notification:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
