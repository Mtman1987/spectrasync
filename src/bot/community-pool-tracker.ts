

// src/bot/community-pool-tracker.ts
import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getAdminDb } from '@/lib/firebase-admin';
import { getTwitchStreams } from '@/app/actions';
import { getUsersFromDb } from '@/app/actions';
import type { LiveUser } from '@/app/raid-pile/types';
import { buildClipGifMessageOptions } from './clip-gif-message';

const CHECK_INTERVAL = 7 * 60 * 1000; // 7 minutes
const activeTrackers: { [guildId: string]: NodeJS.Timeout } = {};

const messageStore: {
    [guildId: string]: {
        headerId?: string;
        footerId?: string;
        userMessageIds: { [twitchId: string]: string };
    }
} = {};

let spotlightIndex = 0;

const db = getAdminDb();

async function loadCommunityPoolChannelConfig(guildId: string) {
    const doc = await db.collection(`communities/${guildId}/settings`).doc('communityPoolChannel').get();
    if (doc.exists) {
        const data = doc.data();
        if (data) {
            if (!messageStore[guildId]) messageStore[guildId] = { userMessageIds: {} };
            messageStore[guildId].headerId = data.headerId;
            messageStore[guildId].footerId = data.footerId;
            if (data.userMessageIds) {
                messageStore[guildId].userMessageIds = data.userMessageIds;
            }
            return data;
        }
    }
    return null;
}

async function setCommunityPoolChannel(guildId: string, channelId: string, headerId: string, footerId: string, userMessageIds: { [key: string]: string } = {}, spotlightTwitchId: string | null = null) {
    await db.collection(`communities/${guildId}/settings`).doc('communityPoolChannel').set({ channelId, headerId, footerId, userMessageIds, spotlightTwitchId }, { merge: true });
    if (!messageStore[guildId]) messageStore[guildId] = { userMessageIds: {} };
    messageStore[guildId].headerId = headerId;
    messageStore[guildId].footerId = footerId;
    messageStore[guildId].userMessageIds = userMessageIds;
    console.log(`Set Community Pool channel for guild ${guildId} to ${channelId}`);
}

async function getCommunityPoolTwitchIds(guildId: string): Promise<string[]> {
    const snapshot = await db.collection(`communities/${guildId}/users`).where('inCommunityPool', '==', true).get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => doc.data().twitchInfo?.id).filter(Boolean);
}

export function buildSpotlightEmbed(user: LiveUser, isSpotlight: boolean): EmbedBuilder {
     const embed = new EmbedBuilder()
        .setAuthor({ name: user.displayName, iconURL: user.avatarUrl, url: `https://twitch.tv/${user.twitchLogin}` })
        .setTitle(user.latestStreamTitle || 'Untitled Stream')
        .setURL(`https://twitch.tv/${user.twitchLogin}`)
        .setColor(isSpotlight ? 0x1DA1F2 : 0x5865F2) // Blue for spotlight, Blurple for others
        .addFields(
            { name: 'Playing', value: user.latestGameName || 'N/A', inline: true },
            { name: 'Viewers', value: user.latestViewerCount.toString(), inline: true }
        )
        .setThumbnail(user.avatarUrl)
        .setImage(`https://static-cdn.jtvnw.net/previews-ttv/live_user_${user.twitchLogin}-440x248.jpg?t=${Date.now()}`)
        .setTimestamp();
    
    if (isSpotlight) {
        embed.setAuthor({ name: '🌟 Spotlight Streamer 🌟', iconURL: user.avatarUrl, url: `https://twitch.tv/${user.twitchLogin}` })
    }

    return embed;
}

export function buildCommunityPoolHeaderEmbed(): EmbedBuilder {
    const description = [
        "The orbital dashboard of the Streaming Cosmos. This is your real-time beacon of fellow Mountaineers currently broadcasting across the Creator’s Galaxy.",
        "",
        "🚀 One featured stream every 7 minutes—complete with a clip from their current mission.",
        "🛰️ FTL Tip: Click in. Say hi. Drop a follow. Every visit fuels the warp core of community.",
        "📡 **Want to be featured? Tap the SIGN-UP BUTTON** in the footer to join the rotation and beam your stream into the spotlight. Your signal matters. Let the crew see what you’re creating!"
    ].join('\n');

    return new EmbedBuilder()
        .setTitle('🚀 COMMUNITY LIVE POOL – STARSTREAM UPLINK ACTIVE 🚀')
        .setDescription(description)
        .setColor(0x1DA1F2);
}

export function buildCommunityPoolFooterEmbed(liveUserCount: number): EmbedBuilder {
    return new EmbedBuilder()
        .setDescription(`**Status:** Tracking ${liveUserCount} live member(s).`)
        .setColor(0x5865F2)
        .setFooter({ text: 'Next update in ~7 minutes.'})
        .setTimestamp();
}

async function checkCommunityPool(client: Client, guildId: string, isInitialCheck = false) {
    const config = await loadCommunityPoolChannelConfig(guildId);
    if (!config || !config.channelId) return;

    const channel = await client.channels.fetch(config.channelId).catch(() => null) as TextChannel | null;
    if (!channel) {
        console.error(`Community Pool channel ${config.channelId} not found for guild ${guildId}.`);
        return;
    }
    
     if (!isInitialCheck) {
        const configDoc = await db.collection(`communities/${guildId}/settings`).doc('communityPoolChannel').get();
        if (configDoc.exists) {
            const data = configDoc.data();
            if (data) {
                if (!messageStore[guildId]) messageStore[guildId] = { userMessageIds: {} };
                messageStore[guildId].headerId = data.headerId;
                messageStore[guildId].footerId = data.footerId;
                messageStore[guildId].userMessageIds = data.userMessageIds || {};
            }
        }
    }


    try {
        const userIds = await getCommunityPoolTwitchIds(guildId);
        
        const liveStreams = await getTwitchStreams(userIds);
        const liveStreamMap = new Map(liveStreams.map(s => [s.user_id, s]));
        
        const dbUsers = await getUsersFromDb(guildId, userIds);

        const liveUsers: LiveUser[] = dbUsers
            .map(user => {
                const streamData = liveStreamMap.get(user.twitchId);
                if (!streamData) return null;
                return { ...user, ...streamData, latestGameName: streamData.game_name, latestViewerCount: streamData.viewer_count, latestStreamTitle: streamData.title };
            })
            .filter((u): u is LiveUser => u !== null)
            .sort((a, b) => new Date(a.started_at as string).getTime() - new Date(b.started_at as string).getTime());
        
        const store = messageStore[guildId];
        if (!store) {
            console.error(`Message store not initialized for guild ${guildId}`);
            return;
        }
        
        // --- Spotlight & Clip Logic ---
        let spotlightUser: LiveUser | null = null;
        if (liveUsers.length > 0) {
            spotlightIndex = (spotlightIndex + 1) % liveUsers.length;
            spotlightUser = liveUsers[spotlightIndex];
        }

        // Delete old spotlight clip message
        const oldClipMessageId = config.spotlightClipId;
        if (oldClipMessageId) {
            await channel.messages.delete(oldClipMessageId).catch(() => {});
        }

        // Post new spotlight clip message
        let newClipMessageId: string | null = null;
        if (spotlightUser) {
            const clipMessageOptions = await buildClipGifMessageOptions(spotlightUser.twitchId, guildId);
            if (clipMessageOptions) {
                const clipMessage = await channel.send(clipMessageOptions).catch(() => null);
                if (clipMessage) {
                    newClipMessageId = clipMessage.id;
                }
            }
        }
        // --- End Spotlight ---
        

        const postedUserIds = new Set(Object.keys(store.userMessageIds));
        const liveUserIds = new Set(liveUsers.map(v => v.twitchId));

        // Users who went offline
        for (const twitchId of postedUserIds) {
            if (!liveUserIds.has(twitchId)) {
                const messageId = store.userMessageIds[twitchId];
                await channel.messages.delete(messageId).catch(e => console.error(`Failed to delete pool message ${messageId}:`, e.message));
                delete store.userMessageIds[twitchId];
            }
        }

        // Users who are live (new or existing)
        for (const user of liveUsers) {
            const isSpotlight = user.twitchId === spotlightUser?.twitchId;
            
            const embed = buildSpotlightEmbed(user, isSpotlight);
            
            const messageId = store.userMessageIds[user.twitchId];
            if (messageId) {
                // User is already displayed, just edit their card
                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (message) {
                    await message.edit({ embeds: [embed] });
                } else {
                     // Message was deleted, so we'll treat it as a new post
                     delete store.userMessageIds[user.twitchId];
                     const newMessage = await channel.send({ embeds: [embed] });
                     store.userMessageIds[user.twitchId] = newMessage.id;
                }
            } else {
                // New user, post their card
                const message = await channel.send({ embeds: [embed] });
                store.userMessageIds[user.twitchId] = message.id;
            }
        }
        
        // Update or repost footer to ensure it's last and updated
        const components = [new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('community_pool_join')
                .setLabel('Join Community Pool')
                .setStyle(ButtonStyle.Success)
                .setEmoji('👋')
        )];
        
        const footerMessage = store.footerId ? await channel.messages.fetch(store.footerId).catch(() => null) : null;
        if (footerMessage) {
            const lastMessage = await channel.messages.fetch({ limit: 1 }).then(messages => messages.first());
            if (lastMessage?.id !== footerMessage.id) {
                // Footer is not the last message, re-post it
                await footerMessage.delete().catch(()=>{});
                const newFooter = await channel.send({ embeds: [buildCommunityPoolFooterEmbed(liveUsers.length)], components });
                store.footerId = newFooter.id;
            } else {
                // Footer is correct, just edit it
                 await footerMessage.edit({ embeds: [buildCommunityPoolFooterEmbed(liveUsers.length)], components });
            }
        } else if (!isInitialCheck) {
            const newFooter = await channel.send({ embeds: [buildCommunityPoolFooterEmbed(liveUsers.length)], components });
            store.footerId = newFooter.id;
        }

        // Persist the updated message IDs and the spotlight user to the database
         await db.collection(`communities/${guildId}/settings`).doc('communityPoolChannel').set({ 
            channelId: config.channelId, 
            headerId: store.headerId, 
            footerId: store.footerId, 
            userMessageIds: store.userMessageIds, 
            spotlightTwitchId: spotlightUser?.twitchId || null,
            spotlightClipId: newClipMessageId, // Save the new clip message ID
         }, { merge: true });

    } catch (error) {
        console.error(`Error during community pool check for guild ${guildId}:`, error);
    }
}

export function startCommunityPoolTracking(client: Client, guildId: string) {
    if (activeTrackers[guildId]) {
        return;
    }
    
    setTimeout(() => {
        loadCommunityPoolChannelConfig(guildId).then(() => {
            checkCommunityPool(client, guildId);

            const interval = setInterval(() => checkCommunityPool(client, guildId), CHECK_INTERVAL);
            activeTrackers[guildId] = interval;
            console.log(`Started community pool tracking interval for guild ${guildId}.`);
        });
    }, 12 * 1000); // 12-second delay to offset from VIP tracker
}

export async function runInitialCommunityPoolCheck(client: Client, guildId: string, channel: TextChannel) {
    if (activeTrackers[guildId]) {
        clearInterval(activeTrackers[guildId]);
        delete activeTrackers[guildId];
    }
    spotlightIndex = 0; // Reset spotlight on initial run
    messageStore[guildId] = { userMessageIds: {} }; // Reset local store

    const headerMsg = await channel.send({ embeds: [buildCommunityPoolHeaderEmbed()] });
    await checkCommunityPool(client, guildId, true);
    
    // Get live count for initial footer
    const userIds = await getCommunityPoolTwitchIds(guildId);
    const liveUsers = await getTwitchStreams(userIds);
    
    const components = [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('community_pool_join')
            .setLabel('Join Community Pool')
            .setStyle(ButtonStyle.Success)
            .setEmoji('👋')
    )];

    const footerMsg = await channel.send({ embeds: [buildCommunityPoolFooterEmbed(liveUsers.length)], components });
    await setCommunityPoolChannel(guildId, channel.id, headerMsg.id, footerMsg.id, messageStore[guildId].userMessageIds, null);
    
    console.log(`Initial community pool check complete for guild ${guildId}.`);
}

export async function stopCommunityPoolTracking(client: Client, guildId: string): Promise<boolean> {
    // 1. Stop the interval
    if (activeTrackers[guildId]) {
        clearInterval(activeTrackers[guildId]);
        delete activeTrackers[guildId];
        console.log(`Stopped community pool tracking for guild ${guildId}.`);
    }

    // 2. Load configuration
    const configDocRef = db.collection(`communities/${guildId}/settings`).doc('communityPoolChannel');
    const configDoc = await configDocRef.get();
    if (!configDoc.exists) {
        return false; // Not configured, so nothing to do.
    }
    const config = configDoc.data();
    if (!config || !config.channelId) return false;

    // 3. Delete messages from the channel
    const channel = await client.channels.fetch(config.channelId).catch(() => null) as TextChannel | null;
    if (channel) {
        // We now also have userMessageIds and the clip ID in the config
        const messageIdsToDelete = [config.headerId, config.footerId, config.spotlightClipId, ...Object.values(config.userMessageIds || {})].filter(Boolean);
        try {
            // Bulk delete is more efficient if there are many messages
            if (messageIdsToDelete.length > 1) {
                await channel.bulkDelete(messageIdsToDelete as string[], true).catch(() => {
                    // If bulk delete fails (e.g. messages are too old), delete individually
                    for(const id of messageIdsToDelete) {
                        channel.messages.delete(id as string).catch(() => {});
                    }
                });
            } else if (messageIdsToDelete.length === 1) {
                 await channel.messages.delete(messageIdsToDelete[0] as string);
            }
        } catch (e: any) {
            console.error(`Could not delete old community pool messages in guild ${guildId}:`, e.message);
            // Don't stop, just log the error. We still want to delete the DB config.
        }
    }
    
    // 4. Delete the config from Firestore
    await configDocRef.delete();

    // 5. Clear local store
    if (messageStore[guildId]) {
        delete messageStore[guildId];
    }
    return true;
}
