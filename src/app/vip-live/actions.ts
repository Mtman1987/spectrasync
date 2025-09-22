
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import type { Webhook } from '../settings/actions';
import type { LiveUser } from '../raid-pile/types';

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

    // 2. Construct the rich embed payload for Discord
    const embed = {
      title: `🚀 ${vip.displayName} is LIVE! 🚀`,
      url: `https://twitch.tv/${vip.twitchLogin}`,
      description: `**${vip.latestStreamTitle || 'Come hang out!'}**`,
      color: 10181046, // Twitch purple
      fields: [
        {
          name: 'Playing',
          value: vip.latestGameName || 'N/A',
          inline: true,
        },
        {
            name: 'Viewers',
            value: vip.latestViewerCount.toString(),
            inline: true,
        }
      ],
      author: {
        name: vip.displayName,
        icon_url: vip.avatarUrl,
        url: `https://twitch.tv/${vip.twitchLogin}`
      },
      thumbnail: {
        url: vip.avatarUrl,
      },
      footer: {
        text: 'Powered by Cosmic Raid',
      },
      timestamp: new Date().toISOString(),
    };

    const webhookPayload = {
      // content: `@here ${vip.displayName} is now live!`, // Optional: to ping roles
      embeds: [embed],
      username: 'Cosmic Raid Announcer', // You can customize this
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
