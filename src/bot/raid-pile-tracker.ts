

// src/bot/raid-pile-tracker.ts
import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, type MessageCreateOptions } from 'discord.js';
import { getAdminDb } from '@/lib/firebase-admin';
import { getTwitchStreams } from '@/app/actions';
import { getUsersFromDb } from '@/app/actions';
import type { LiveUser } from '@/app/raid-pile/types';
import { buildLeaderboardEmbed as buildLeaderboardPayload } from '@/app/leaderboard/actions';
import { buildClipGifMessageOptions } from './clip-gif-message';


const CHECK_INTERVAL = 7 * 60 * 1000; // 7 minutes
const activeTrackers: { [guildId: string]: NodeJS.Timeout } = {};

const messageStore: {
    [guildId: string]: {
        headerId?: string;
        holderId?: string;
        clipId?: string; // New: To store the holder's clip message ID
        leaderboardId?: string;
        queueId?: string;
        footerId?: string;
    }
} = {};

const db = getAdminDb();

async function loadRaidPileChannelConfig(guildId: string) {
    const doc = await db.collection(`communities/${guildId}/settings`).doc('raidPileChannel').get();
    if (doc.exists) {
        const data = doc.data();
        if (data) {
            if (!messageStore[guildId]) messageStore[guildId] = {};
            messageStore[guildId].headerId = data.headerId;
            messageStore[guildId].holderId = data.holderId;
            messageStore[guildId].clipId = data.clipId;
            messageStore[guildId].leaderboardId = data.leaderboardId;
            messageStore[guildId].queueId = data.queueId;
            messageStore[guildId].footerId = data.footerId;
            return data;
        }
    }
    return null;
}

async function setRaidPileChannel(guildId: string, channelId: string, messageIds: { headerId: string, holderId: string, clipId?: string, leaderboardId: string, queueId: string, footerId: string }) {
    await db.collection(`communities/${guildId}/settings`).doc('raidPileChannel').set({ channelId, ...messageIds });
    messageStore[guildId] = messageIds;
    console.log(`Set and saved all Raid Pile message IDs for guild ${guildId} in channel ${channelId}`);
}


async function getRaidPileTwitchIds(guildId: string): Promise<string[]> {
    const snapshot = await db.collection(`communities/${guildId}/users`).where('inPile', '==', true).get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => doc.data().twitchInfo?.id).filter(Boolean);
}

function buildHolderEmbed(user: LiveUser | null): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Raid Pile Holder', iconURL: 'https://em-content.zobj.net/source/twitter/376/crossed-swords_2694-fe0f.png' });

    if (user) {
        embed.setTitle(user.displayName)
            .setURL(`https://twitch.tv/${user.twitchLogin}`)
            .setColor(0xED4245)
            .setThumbnail(user.avatarUrl)
            .addFields(
                { name: 'Playing', value: user.latestGameName || 'N/A', inline: true },
                { name: 'Viewers', value: user.latestViewerCount.toString(), inline: true }
            )
            .setImage(`https://static-cdn.jtvnw.net/previews-ttv/live_user_${user.twitchLogin}-440x248.jpg?t=${Date.now()}`)
            .setTimestamp();
    } else {
        embed.setTitle("The Raid Pile is Empty")
             .setDescription("No one is currently in the raid pile. Join the pile to become the holder!")
             .setColor(0x5865F2);
    }
    return embed;
}

function toLeaderboardMessagePayload(payload: Awaited<ReturnType<typeof buildLeaderboardPayload>>): Pick<MessageCreateOptions, 'embeds' | 'components'> {
    if (payload && Array.isArray(payload.embeds) && payload.embeds.length > 0) {
        return {
            embeds: payload.embeds,
            components: payload.components ?? [],
        };
    }

    const fallbackEmbed = new EmbedBuilder()
        .setTitle('🏆   Community Leaderboard   🏆')
        .setDescription('Leaderboard data is currently unavailable.')
        .setColor(0xFFD700)
        .setTimestamp();

    return {
        embeds: [fallbackEmbed.toJSON()],
        components: [],
    };
}

function buildQueueEmbed(users: LiveUser[]): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Next in the Pile' });

    if (users.length > 0) {
        embed.setDescription(users.map((u, i) => `**${i + 1}.** ${u.displayName}`).join('\n'));
        embed.setColor(0x5865F2);
    } else {
        embed.setDescription("The queue is empty.");
        embed.setColor(0x5865F2);
    }
    return embed;
}

function buildRaidPileHeaderEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle('⚔️ The Raid Pile ⚔️')
        .setDescription('The dynamic queue to be the next one raided by the community.')
        .setColor(0xED4245);
}

function buildRaidPileFooterEmbed(liveUserCount: number): EmbedBuilder {
    return new EmbedBuilder()
        .setDescription(`**Status:** Tracking ${liveUserCount} live member(s) in the pile.`)
        .setColor(0x5865F2)
        .setFooter({ text: 'Next update in ~7 minutes.'})
        .setTimestamp();
}

async function checkRaidPile(client: Client, guildId: string) {
    const config = await loadRaidPileChannelConfig(guildId);
    if (!config || !config.channelId) return;

    const channel = await client.channels.fetch(config.channelId).catch(() => null) as TextChannel | null;
    if (!channel) return;
    
    try {
        const userIds = await getRaidPileTwitchIds(guildId);
        const [liveStreams, dbUsers, leaderboardPayload] = await Promise.all([
            getTwitchStreams(userIds),
            getUsersFromDb(guildId, userIds),
            buildLeaderboardPayload(guildId)
        ]);
        
        const liveStreamMap = new Map(liveStreams.map(s => [s.user_id, s]));
        const liveUsers: LiveUser[] = dbUsers
            .map(user => {
                const streamData = liveStreamMap.get(user.twitchId);
                if (!streamData) return null;
                return { ...user, ...streamData, latestGameName: streamData.game_name, latestViewerCount: streamData.viewer_count, latestStreamTitle: streamData.title };
            })
            .filter((u): u is LiveUser => u !== null)
            .sort((a, b) => new Date(a.started_at as string).getTime() - new Date(b.started_at as string).getTime());

        const holder = liveUsers.length > 0 ? liveUsers[0] : null;
        const queue = liveUsers.slice(1);

        const store = messageStore[guildId];
        if (!store) return;

        // --- Holder Clip Logic ---
        const oldClipId = store.clipId;
        let newClipId: string | undefined = undefined;

        // Delete old clip first if it exists
        if (oldClipId) {
            await channel.messages.delete(oldClipId).catch(() => {});
            store.clipId = undefined;
        }

        // If there's a new holder, post a new clip.
        if (holder) {
            const clipMessageOptions = await buildClipGifMessageOptions(holder.twitchId, guildId);
            if (clipMessageOptions) {
                const clipMsg = await channel.send(clipMessageOptions).catch(() => null);
                if (clipMsg) {
                    newClipId = clipMsg.id;
                }
            }
        }
        store.clipId = newClipId;
        // --- End Clip Logic ---


        const holderEmbed = buildHolderEmbed(holder);
        const leaderboardMessagePayload = toLeaderboardMessagePayload(leaderboardPayload);
        const queueEmbed = buildQueueEmbed(queue);
        const footerEmbed = buildRaidPileFooterEmbed(liveUsers.length);
        
        const holderMsg = store.holderId ? await channel.messages.fetch(store.holderId).catch(() => null) : null;
        if(holderMsg) await holderMsg.edit({ embeds: [holderEmbed] });

        const leaderboardMsg = store.leaderboardId ? await channel.messages.fetch(store.leaderboardId).catch(() => null) : null;
        if(leaderboardMsg) await leaderboardMsg.edit(leaderboardMessagePayload);

        const queueMsg = store.queueId ? await channel.messages.fetch(store.queueId).catch(() => null) : null;
        if(queueMsg) await queueMsg.edit({ embeds: [queueEmbed] });

        const footerMsg = store.footerId ? await channel.messages.fetch(store.footerId).catch(() => null) : null;
        if(footerMsg) await footerMsg.edit({ embeds: [footerEmbed] });

        // Persist the new clip ID when the core message identifiers are known
        if (store.headerId && store.holderId && store.leaderboardId && store.queueId && store.footerId) {
            await setRaidPileChannel(guildId, config.channelId, {
                headerId: store.headerId,
                holderId: store.holderId,
                leaderboardId: store.leaderboardId,
                queueId: store.queueId,
                footerId: store.footerId,
                clipId: newClipId,
            });
        }

    } catch (error) {
        console.error(`Error during raid pile check for guild ${guildId}:`, error);
    }
}


export function startRaidPileTracking(client: Client, guildId: string) {
    if (activeTrackers[guildId]) return;
    
    const interval = setInterval(() => checkRaidPile(client, guildId), CHECK_INTERVAL);
    activeTrackers[guildId] = interval;
    console.log(`Started raid pile tracking interval for guild ${guildId}.`);
}

export async function runInitialRaidPileCheck(client: Client, guildId: string, channel: TextChannel) {
    if (activeTrackers[guildId]) {
        clearInterval(activeTrackers[guildId]);
        delete activeTrackers[guildId];
    }
    messageStore[guildId] = {};
    
    // Fetch initial data
    const userIds = await getRaidPileTwitchIds(guildId);
    const [liveStreams, dbUsers, leaderboardPayload] = await Promise.all([
        getTwitchStreams(userIds),
        getUsersFromDb(guildId, userIds),
        buildLeaderboardPayload(guildId)
    ]);
     const liveStreamMap = new Map(liveStreams.map(s => [s.user_id, s]));
    const liveUsers: LiveUser[] = dbUsers
        .map(user => {
            const streamData = liveStreamMap.get(user.twitchId);
            if (!streamData) return null;
            return { ...user, ...streamData, latestGameName: streamData.game_name, latestViewerCount: streamData.viewer_count, latestStreamTitle: streamData.title };
        })
        .filter((u): u is LiveUser => u !== null)
        .sort((a, b) => new Date(a.started_at as string).getTime() - new Date(b.started_at as string).getTime());

    const holder = liveUsers.length > 0 ? liveUsers[0] : null;
    const queue = liveUsers.slice(1);

    // Post clip first if holder exists
    let clipMsgId: string | undefined = undefined;
    if (holder) {
        const clipMessageOptions = await buildClipGifMessageOptions(holder.twitchId, guildId);
        if (clipMessageOptions) {
            const clipMsg = await channel.send(clipMessageOptions).catch(() => null);
            if (clipMsg) {
                clipMsgId = clipMsg.id;
            }
        }
    }


    // Create embeds
    const headerEmbed = buildRaidPileHeaderEmbed();
    const holderEmbed = buildHolderEmbed(holder);
    const leaderboardMessagePayload = toLeaderboardMessagePayload(leaderboardPayload);
    const queueEmbed = buildQueueEmbed(queue);
    const footerEmbed = buildRaidPileFooterEmbed(liveUsers.length);
    const components = [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('raid_join')
            .setLabel('Join Raid Pile')
            .setStyle(ButtonStyle.Success)
            .setEmoji('⚔️')
    )];

    // Post messages
    const headerMsg = await channel.send({ embeds: [headerEmbed] });
    const holderMsg = await channel.send({ embeds: [holderEmbed] });
    const leaderboardMsg = await channel.send(leaderboardMessagePayload);
    const queueMsg = await channel.send({ embeds: [queueEmbed] });
    const footerMsg = await channel.send({ embeds: [footerEmbed], components });
    
    // Save configuration
    await setRaidPileChannel(guildId, channel.id, {
        headerId: headerMsg.id,
        holderId: holderMsg.id,
        clipId: clipMsgId,
        leaderboardId: leaderboardMsg.id,
        queueId: queueMsg.id,
        footerId: footerMsg.id,
    });
    
    console.log(`Initial raid pile check complete for guild ${guildId}.`);
    startRaidPileTracking(client, guildId);
}


export async function stopRaidPileTracking(client: Client, guildId: string): Promise<boolean> {
    if (activeTrackers[guildId]) {
        clearInterval(activeTrackers[guildId]);
        delete activeTrackers[guildId];
        console.log(`Stopped raid pile tracking for guild ${guildId}.`);
    }

    const configDocRef = db.collection(`communities/${guildId}/settings`).doc('raidPileChannel');
    const configDoc = await configDocRef.get();
    if (!configDoc.exists) return false;
    
    const config = configDoc.data();
    if (!config || !config.channelId) return false;

    const channel = await client.channels.fetch(config.channelId).catch(() => null) as TextChannel | null;
    if (channel) {
        const messageIdsToDelete = [config.headerId, config.holderId, config.clipId, config.leaderboardId, config.queueId, config.footerId].filter(Boolean);
        try {
            if (messageIdsToDelete.length > 1) {
                await channel.bulkDelete(messageIdsToDelete as string[], true).catch(() => {
                    for(const id of messageIdsToDelete) {
                        channel.messages.delete(id as string).catch(() => {});
                    }
                });
            } else if (messageIdsToDelete.length === 1) {
                 await channel.messages.delete(messageIdsToDelete[0] as string);
            }
        } catch (e: any) {
            console.error(`Could not delete old raid pile messages in guild ${guildId}:`, e.message);
        }
    }

    await configDocRef.delete();
    if (messageStore[guildId]) delete messageStore[guildId];
    return true;
}

    