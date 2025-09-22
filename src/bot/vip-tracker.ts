// src/bot/vip-tracker.ts
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { getAdminDb } from '@/lib/firebase-admin';
import { getUsersFromDb, getTwitchStreams } from '@/app/actions';
import { buildClipGifMessageOptions } from './clip-gif-message';
import type { LiveUser } from '@/app/raid-pile/types';

const CHECK_INTERVAL = 7 * 60 * 1000; // 7 minutes
const activeTrackers: { [guildId: string]: NodeJS.Timeout } = {};

// Store message IDs for header, footer, and individual VIP cards
const messageStore: {
    [guildId: string]: {
        headerId?: string;
        footerId?: string;
        vipMessageIds: { [twitchId: string]: string };
        vipClipMessageIds: { [twitchId: string]: string }; // New: Store clip message IDs
    }
} = {};

const db = getAdminDb();

async function loadVipChannelConfig(guildId: string) {
    const doc = await db.collection(`communities/${guildId}/settings`).doc('vipLiveChannel').get();
    if (doc.exists) {
        const data = doc.data();
        if (data) {
            if (!messageStore[guildId]) messageStore[guildId] = { vipMessageIds: {}, vipClipMessageIds: {} };
            messageStore[guildId].headerId = data.headerId;
            messageStore[guildId].footerId = data.footerId;
            messageStore[guildId].vipMessageIds = data.vipMessageIds || {};
            messageStore[guildId].vipClipMessageIds = data.vipClipMessageIds || {}; // Load clip IDs
            return data;
        }
    }
    return null;
}

export async function setVipLiveChannel(guildId: string, channelId: string, headerId: string, footerId: string, vipMessageIds: { [key: string]: string } = {}, vipClipMessageIds: { [key: string]: string } = {}) {
    await db.collection(`communities/${guildId}/settings`).doc('vipLiveChannel').set({ channelId, headerId, footerId, vipMessageIds, vipClipMessageIds }, { merge: true });
    if (!messageStore[guildId]) messageStore[guildId] = { vipMessageIds: {}, vipClipMessageIds: {} };
    messageStore[guildId].headerId = headerId;
    messageStore[guildId].footerId = footerId;
    messageStore[guildId].vipMessageIds = vipMessageIds;
    messageStore[guildId].vipClipMessageIds = vipClipMessageIds;
    console.log(`Set VIP live channel for guild ${guildId} to ${channelId}`);
}

async function getVipTwitchIds(guildId: string): Promise<string[]> {
    const snapshot = await db.collection(`communities/${guildId}/users`).where('isVip', '==', true).get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => doc.data().twitchInfo?.id).filter(Boolean);
}

export function buildVipHeaderEmbed(): EmbedBuilder {
    const description = [
        "This is no ordinary uplink. These are the pillars of Space Mountain—our Partners, VIPs, Admins, and Mods. They are the warp stabilizers, the shield generators, the ones who keep the station humming even when the stars flicker.",
        "",
        "🛰️ highlighting those currently streaming across the Creator’s Galaxy. Each signal is a beacon of creativity, leadership, and crew-first energy.",
        "📡 These are the voices that built the mountain. Drop in. Show love. Boost their signal. Because when they go live, the whole cosmos listens."
    ].join('\n');

    return new EmbedBuilder()
        .setTitle('🚀 VIPs LIVE NOW – SIGNALS FROM THE CORE 🚀')
        .setDescription(description)
        .setColor(0xFFD700); // Gold
}

export function buildVipFooterEmbed(liveVipCount: number): EmbedBuilder {
    return new EmbedBuilder()
        .setDescription(`**Status:** Tracking ${liveVipCount} live VIP(s).`)
        .setColor(0x5865F2) // Discord Blurple
        .setFooter({ text: 'Next update in ~7 minutes.'})
        .setTimestamp();
}

function buildVipEmbed(vip: LiveUser): EmbedBuilder {
    const description = `*${vip.vipMessage || 'Come hang out!'}*`;

    return new EmbedBuilder()
        .setAuthor({ name: vip.displayName, iconURL: vip.avatarUrl, url: `https://twitch.tv/${vip.twitchLogin}` })
        .setTitle(vip.latestStreamTitle || 'Untitled Stream')
        .setURL(`https://twitch.tv/${vip.twitchLogin}`)
        .setDescription(description)
        .setColor(0x9146FF) // Twitch Purple
        .addFields(
            { name: 'Playing', value: vip.latestGameName || 'N/A', inline: true },
            { name: 'Viewers', value: vip.latestViewerCount.toString(), inline: true }
        )
        .setThumbnail(vip.avatarUrl)
        .setImage(`https://static-cdn.jtvnw.net/previews-ttv/live_user_${vip.twitchLogin}-440x248.jpg?t=${Date.now()}`)
        .setTimestamp();
}


async function checkVips(client: Client, guildId: string, isInitialCheck = false) {
    const config = await loadVipChannelConfig(guildId);
    if (!config || !config.channelId) {
        return;
    }

    const channel = await client.channels.fetch(config.channelId).catch(() => null) as TextChannel | null;
    if (!channel) {
        console.error(`VIP channel ${config.channelId} not found for guild ${guildId}.`);
        return;
    }
     // Sync local message store with database before checking
    if (config.vipMessageIds) {
        if (!messageStore[guildId]) messageStore[guildId] = { vipMessageIds: {}, vipClipMessageIds: {} };
        messageStore[guildId].vipMessageIds = config.vipMessageIds;
        messageStore[guildId].vipClipMessageIds = config.vipClipMessageIds || {};
    }


    try {
        const vipIds = await getVipTwitchIds(guildId);
        
        if (vipIds.length === 0) {
            const store = messageStore[guildId] || { vipMessageIds: {}, vipClipMessageIds: {} };
            for (const messageId of Object.values(store.vipMessageIds)) {
                await channel.messages.delete(messageId).catch(() => {});
            }
             for (const messageId of Object.values(store.vipClipMessageIds)) {
                await channel.messages.delete(messageId).catch(() => {});
            }
            store.vipMessageIds = {};
            store.vipClipMessageIds = {};
            const footerMessage = store.footerId ? await channel.messages.fetch(store.footerId).catch(() => null) : null;
            if (footerMessage) {
                await footerMessage.edit({ embeds: [buildVipFooterEmbed(0)] });
            }
            return;
        }

        const liveStreams = await getTwitchStreams(vipIds);
        const liveStreamMap = new Map(liveStreams.map(s => [s.user_id, s]));
        
        const dbUsers = await getUsersFromDb(guildId, vipIds);

        const liveVips: LiveUser[] = dbUsers
            .map(user => {
                const streamData = liveStreamMap.get(user.twitchId);
                if (!streamData) return null;
                return { ...user, ...streamData, latestGameName: streamData.game_name, latestViewerCount: streamData.viewer_count, latestStreamTitle: streamData.title };
            })
            .filter((u): u is LiveUser => u !== null);
        
        const store = messageStore[guildId];
        if (!store) {
            console.error(`Message store not initialized for guild ${guildId}`);
            return;
        }

        const postedVipIds = new Set(Object.keys(store.vipMessageIds));
        const liveVipIds = new Set(liveVips.map(v => v.twitchId));

        // Cleanup for users who went offline
        for (const twitchId of postedVipIds) {
            if (!liveVipIds.has(twitchId)) {
                // Delete the main embed
                const messageId = store.vipMessageIds[twitchId];
                await channel.messages.delete(messageId).catch(e => console.error(`Failed to delete VIP message ${messageId}:`, e.message));
                delete store.vipMessageIds[twitchId];

                // Delete the associated clip message
                const clipMessageId = store.vipClipMessageIds[twitchId];
                if (clipMessageId) {
                    await channel.messages.delete(clipMessageId).catch(e => console.error(`Failed to delete VIP clip message ${clipMessageId}:`, e.message));
                    delete store.vipClipMessageIds[twitchId];
                }
            }
        }

        // Update or post for live VIPs
        for (const vip of liveVips) {
            const embed = buildVipEmbed(vip);
            const messageId = store.vipMessageIds[vip.twitchId];
            
            if (messageId) {
                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (message) {
                    await message.edit({ embeds: [embed] });
                } else {
                    // Message was deleted, create a new one
                    const newMessage = await channel.send({ embeds: [embed] });
                    store.vipMessageIds[vip.twitchId] = newMessage.id;
                }
            } else {
                // New VIP going live
                const newMessage = await channel.send({ embeds: [embed] });
                store.vipMessageIds[vip.twitchId] = newMessage.id;
            }
            
            // Post a new clip, and only delete the old one after.
            const oldClipMessageId = store.vipClipMessageIds[vip.twitchId];
            const clipMessageOptions = await buildClipGifMessageOptions(vip.twitchId, guildId);

            if (clipMessageOptions) {
                try {
                    const newClipMessage = await channel.send(clipMessageOptions);
                    store.vipClipMessageIds[vip.twitchId] = newClipMessage.id;
                } catch (e) {
                    console.error("Failed to post converted clip:", e);
                    // If posting fails, don't delete the old clip ID from the store
                }
            }

            // Now, safely delete the old clip message if it existed
            if (oldClipMessageId) {
                await channel.messages.delete(oldClipMessageId).catch(() => {});
            }
        }
        
        // Update footer
        const footerMessage = store.footerId ? await channel.messages.fetch(store.footerId).catch(() => null) : null;
        if (footerMessage) {
            const lastMessage = await channel.messages.fetch({ limit: 1 }).then(messages => messages.first());
             if (lastMessage && lastMessage.id !== footerMessage.id) {
                await footerMessage.delete().catch(() => {});
                const newFooter = await channel.send({ embeds: [buildVipFooterEmbed(liveVips.length)] });
                store.footerId = newFooter.id;
             } else {
                 await footerMessage.edit({ embeds: [buildVipFooterEmbed(liveVips.length)] });
             }
        } else if (!isInitialCheck) {
            const newFooter = await channel.send({ embeds: [buildVipFooterEmbed(liveVips.length)] });
            store.footerId = newFooter.id;
        }

        // Persist all changes
        await setVipLiveChannel(guildId, channel.id, store.headerId!, store.footerId!, store.vipMessageIds, store.vipClipMessageIds);

    } catch (error) {
        console.error(`Error during VIP check for guild ${guildId}:`, error);
    }
}


export function startVipTracking(client: Client, guildId: string) {
    if (activeTrackers[guildId]) {
        return;
    }
    
    setTimeout(() => {
        loadVipChannelConfig(guildId).then(() => {
            checkVips(client, guildId);

            const interval = setInterval(() => checkVips(client, guildId), CHECK_INTERVAL);
            activeTrackers[guildId] = interval;
            console.log(`Started VIP tracking interval for guild ${guildId}.`);
        });
    }, 10 * 1000); // 10-second delay
}

export async function runInitialVipCheck(client: Client, guildId: string, channel: TextChannel) {
     if (activeTrackers[guildId]) {
        clearInterval(activeTrackers[guildId]);
        delete activeTrackers[guildId];
    }
    
    messageStore[guildId] = { vipMessageIds: {}, vipClipMessageIds: {} };

    const headerMsg = await channel.send({ embeds: [buildVipHeaderEmbed()] });
    messageStore[guildId].headerId = headerMsg.id;

    await checkVips(client, guildId, true);

    const liveVips = await getVipTwitchIds(guildId).then(ids => getTwitchStreams(ids));
    const footerMsg = await channel.send({ embeds: [buildVipFooterEmbed(liveVips.length)] });
    messageStore[guildId].footerId = footerMsg.id;

    await setVipLiveChannel(guildId, channel.id, messageStore[guildId].headerId, messageStore[guildId].footerId, messageStore[guildId].vipMessageIds, messageStore[guildId].vipClipMessageIds);
    
    console.log(`Initial VIP check complete for guild ${guildId}. Channel is set up.`);
}

export async function stopVipTracking(client: Client, guildId: string): Promise<boolean> {
    if (activeTrackers[guildId]) {
        clearInterval(activeTrackers[guildId]);
        delete activeTrackers[guildId];
        console.log(`Stopped VIP tracking for guild ${guildId}.`);
    }

    const configDocRef = db.collection(`communities/${guildId}/settings`).doc('vipLiveChannel');
    const configDoc = await configDocRef.get();
    if (!configDoc.exists) {
        return false;
    }
    const config = configDoc.data();
     if (!config || !config.channelId) return false;

    const channel = await client.channels.fetch(config.channelId).catch(() => null) as TextChannel | null;
    if (channel) {
        const finalConfig = await loadVipChannelConfig(guildId).then(() => config);
        const messageIdsToDelete = [
            finalConfig.headerId, 
            finalConfig.footerId, 
            ...Object.values(finalConfig.vipMessageIds || {}),
            ...Object.values(finalConfig.vipClipMessageIds || {})
        ].filter(Boolean);
        
        try {
             for(const id of messageIdsToDelete) {
                if (id) {
                    await channel.messages.delete(id as string).catch(() => {});
                }
            }
        } catch (e: any) {
            console.error(`Could not delete old VIP messages in guild ${guildId}:`, e.message);
        }
    }

    await configDocRef.delete();
    if (messageStore[guildId]) {
        delete messageStore[guildId];
    }
    return true;
}
