// src/bot/raid-train-tracker.ts
import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, type MessageCreateOptions } from 'discord.js';
import { getAdminDb } from '@/lib/firebase-admin';
import { getRaidTrainSchedule, getLiveRaidTrainUsers } from '@/app/raid-train/actions';
import { buildLeaderboardEmbed as buildLeaderboardPayload } from '@/app/leaderboard/actions';
import type { LiveUser } from '@/app/raid-pile/types';
import type { Signup, EmergencySignup } from '@/app/raid-train/actions';
import { format, getHours } from 'date-fns';
import { buildClipGifMessageOptions } from './clip-gif-message';

const CHECK_INTERVAL = 7 * 60 * 1000; // 7 minutes
const activeTrackers: { [guildId: string]: NodeJS.Timeout } = {};

const messageStore: {
    [guildId: string]: {
        headerId?: string;
        conductorId?: string;
        clipId?: string; // New: To store the conductor's clip message ID
        leaderboardId?: string;
        scheduleId?: string;
        footerId?: string;
    }
} = {};

const db = getAdminDb();

async function loadRaidTrainChannelConfig(guildId: string) {
    const doc = await db.collection(`communities/${guildId}/settings`).doc('raidTrainChannel').get();
    if (doc.exists) {
        const data = doc.data();
        if (data) {
            if (!messageStore[guildId]) messageStore[guildId] = {};
            messageStore[guildId].headerId = data.headerId;
            messageStore[guildId].conductorId = data.conductorId;
            messageStore[guildId].clipId = data.clipId;
            messageStore[guildId].leaderboardId = data.leaderboardId;
            messageStore[guildId].scheduleId = data.scheduleId;
            messageStore[guildId].footerId = data.footerId;
            return data;
        }
    }
    return null;
}

export async function setRaidTrainChannel(guildId: string, channelId: string, messageIds: { headerId: string; conductorId: string; clipId?: string, leaderboardId: string; scheduleId: string; footerId: string; }) {
    await db.collection(`communities/${guildId}/settings`).doc('raidTrainChannel').set({ channelId, ...messageIds });
    messageStore[guildId] = messageIds;
}

function buildRaidTrainHeaderEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle('🚂 The Raid Train 🚂')
        .setDescription('This is the schedule for today\'s raid train. The user in the current time slot is the **Conductor**.')
        .setColor(0x8A2BE2);
}

function buildConductorEmbed(user: LiveUser | null, slot: string): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setAuthor({ name: `Current Conductor: ${slot}`, iconURL: 'https://em-content.zobj.net/source/microsoft/379/steam-locomotive_1f682.png' });

    if (user) {
        embed.setTitle(user.displayName)
            .setURL(`https://twitch.tv/${user.twitchLogin}`)
            .setColor(0x8A2BE2)
            .setThumbnail(user.avatarUrl)
            .addFields(
                { name: 'Playing', value: user.latestGameName || 'N/A', inline: true },
                { name: 'Viewers', value: user.latestViewerCount.toString(), inline: true }
            )
            .setImage(`https://static-cdn.jtvnw.net/previews-ttv/live_user_${user.twitchLogin}-440x248.jpg?t=${Date.now()}`)
            .setTimestamp();
    } else {
        embed.setTitle("No Conductor Live")
             .setDescription("The scheduled user for this time slot is not currently live on Twitch.")
             .setColor(0x5865F2);
    }
    return embed;
}

function generateScheduleGrid(signups: { [key: string]: Signup | EmergencySignup }): { grid: string, legend: string } {
    const columns = 6;
    const rows = 4;
    const cellWidth = 7;
    const topRow =    '╔' + '═'.repeat(cellWidth) + ('╦' + '═'.repeat(cellWidth)).repeat(columns - 1) + '╗';
    const middleRow = '╠' + '═'.repeat(cellWidth) + ('╬' + '═'.repeat(cellWidth)).repeat(columns - 1) + '╣';
    const bottomRow = '╚' + '═'.repeat(cellWidth) + ('╩' + '═'.repeat(cellWidth)).repeat(columns - 1) + '╝';
    
    let grid = topRow + '\n';
    let legendItems = new Map<string, string>();
    let legendCounter = 0;
    const legendMap = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?*&#@$';

    for (let row = 0; row < rows; row++) {
        let timeRow = '║';
        let userRow = '║';
        for (let col = 0; col < columns; col++) {
            const hour = row * columns + col;
            const timeSlot = `${hour.toString().padStart(2, '0')}:00`;
            const signup = signups[timeSlot];
            
            const timeContent = timeSlot.padStart(5).padEnd(cellWidth);
            timeRow += timeContent + '║';

            let userContent: string;
            if (signup) {
                if (signup.id === 'emergency') {
                    userContent = `  [ E ]`;
                } else {
                    let initial = legendItems.get(signup.name);
                    if (!initial) {
                        initial = legendMap[legendCounter++] || '?';
                        legendItems.set(signup.name, initial);
                    }
                    userContent = `  [ ${initial} ]`;
                }
            } else {
                 userContent = ' ';
            }
            userRow += userContent.padEnd(cellWidth) + '║';
        }
        grid += timeRow + '\n';
        grid += userRow + '\n';

        if (row < rows - 1) {
            grid += middleRow + '\n';
        }
    }
    grid += bottomRow;
    
    const legendText = Array.from(legendItems.entries()).map(([name, initial]) => `[${initial}] = ${name}`).join('\n');
    let legend = '```\n' + 'Legend:\n' + (legendText || "No signups yet.") + '\n[E] = Emergency Spot\n```';
    
    return { grid: '```' + grid + '```', legend };
}

export function buildScheduleEmbed(signups: { [key:string]: Signup | EmergencySignup }): EmbedBuilder {
    const { grid, legend } = generateScheduleGrid(signups);

    return new EmbedBuilder()
        .setAuthor({ name: `Schedule for ${format(new Date(), 'MMMM do')} (All times are in UTC)` })
        .setColor(0x5865F2)
        .setDescription(grid + '\n' + legend);
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

function buildFooterEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setFooter({ text: 'Next update in ~7 minutes.' })
        .setTimestamp();
}

async function checkRaidTrain(client: Client, guildId: string) {
    const config = await loadRaidTrainChannelConfig(guildId);
    if (!config || !config.channelId) return;

    const channel = await client.channels.fetch(config.channelId).catch(() => null) as TextChannel | null;
    if (!channel) return;

    try {
        const dateKey = format(new Date(), 'yyyy-MM-dd');
        const [schedule, liveUsers, leaderboardPayload] = await Promise.all([
            getRaidTrainSchedule(guildId, dateKey),
            getLiveRaidTrainUsers(guildId, dateKey),
            buildLeaderboardPayload(guildId)
        ]);

        const currentHour = getHours(new Date());
        const currentSlot = `${currentHour.toString().padStart(2, '0')}:00`;
        const currentSignup = schedule[currentSlot];
        
        let conductor: LiveUser | null = null;
        if (currentSignup && currentSignup.id !== 'emergency') {
            conductor = liveUsers.find(u => u.twitchId === currentSignup.id) || null;
        }

        const store = messageStore[guildId];
        if (!store) return;

        // --- Conductor Clip Logic ---
        const oldClipId = store.clipId;
        let newClipId: string | undefined = undefined;

        if (oldClipId) {
            await channel.messages.delete(oldClipId).catch(() => {});
            store.clipId = undefined;
        }

        if (conductor) {
            const clipMessageOptions = await buildClipGifMessageOptions(conductor.twitchId, guildId);
            if (clipMessageOptions) {
                const clipMsg = await channel.send(clipMessageOptions).catch(() => null);
                if (clipMsg) {
                    newClipId = clipMsg.id;
                }
            }
        }
        store.clipId = newClipId;
        // --- End Clip Logic ---


        const conductorEmbed = buildConductorEmbed(conductor, currentSlot);
        const leaderboardMessagePayload = toLeaderboardMessagePayload(leaderboardPayload);
        const scheduleEmbed = buildScheduleEmbed(schedule);
        const footerEmbed = buildFooterEmbed();

        
        const conductorMsg = store.conductorId ? await channel.messages.fetch(store.conductorId).catch(() => null) : null;
        if(conductorMsg) await conductorMsg.edit({ embeds: [conductorEmbed] });

        const leaderboardMsg = store.leaderboardId ? await channel.messages.fetch(store.leaderboardId).catch(() => null) : null;
        if(leaderboardMsg) await leaderboardMsg.edit(leaderboardMessagePayload);

        const scheduleMsg = store.scheduleId ? await channel.messages.fetch(store.scheduleId).catch(() => null) : null;
        if(scheduleMsg) await scheduleMsg.edit({ embeds: [scheduleEmbed] });

        const footerMsg = store.footerId ? await channel.messages.fetch(store.footerId).catch(() => null) : null;
        if(footerMsg) await footerMsg.edit({ embeds: [footerEmbed] });

        if (store.headerId && store.conductorId && store.leaderboardId && store.scheduleId && store.footerId) {
            await setRaidTrainChannel(guildId, config.channelId, {
                headerId: store.headerId,
                conductorId: store.conductorId,
                leaderboardId: store.leaderboardId,
                scheduleId: store.scheduleId,
                footerId: store.footerId,
                clipId: newClipId,
            });
        }

    } catch (error) {
        console.error(`Error during raid train check for guild ${guildId}:`, error);
    }
}

export function startRaidTrainTracking(client: Client, guildId: string) {
    if (activeTrackers[guildId]) {
        return;
    };
    
    // Defer the first check for 15 seconds to avoid race conditions on bot startup.
    const deferredCheck = () => {
        loadRaidTrainChannelConfig(guildId).then((config) => {
            if (config) { // Only check if a config exists
                checkRaidTrain(client, guildId);
            }
        });
    };
    setTimeout(deferredCheck, 15000);

    const interval = setInterval(() => checkRaidTrain(client, guildId), CHECK_INTERVAL);
    activeTrackers[guildId] = interval;
}

export async function runInitialRaidTrainCheck(client: Client, guildId: string, channel: TextChannel) {
     if (activeTrackers[guildId]) {
        clearInterval(activeTrackers[guildId]);
        delete activeTrackers[guildId];
    }
    messageStore[guildId] = {};
    
    try {
        const dateKey = format(new Date(), 'yyyy-MM-dd');
        // Fetch initial data but provide defaults on failure to prevent crash
        const schedule = await getRaidTrainSchedule(guildId, dateKey).catch(
            () => ({} as Record<string, Signup | EmergencySignup>)
        );
        const leaderboardPayload = await buildLeaderboardPayload(guildId).catch(() => null);
        const liveUsers = await getLiveRaidTrainUsers(guildId, dateKey).catch(() => ([]));

        const currentHour = getHours(new Date());
        const currentSlot = `${currentHour.toString().padStart(2, '0')}:00`;
        const currentSignup = schedule[currentSlot];
        
        let conductor: LiveUser | null = null;
        if (currentSignup && currentSignup.id !== 'emergency') {
            conductor = liveUsers.find(u => u.twitchId === currentSignup.id) || null;
        }

        // Post clip first if conductor exists
        let clipMsgId: string | undefined = undefined;
        if (conductor) {
            const clipMessageOptions = await buildClipGifMessageOptions(conductor.twitchId, guildId);
            if (clipMessageOptions) {
                const clipMsg = await channel.send(clipMessageOptions).catch(() => null);
                if (clipMsg) {
                    clipMsgId = clipMsg.id;
                }
            }
        }
        
        const headerMsg = await channel.send({ embeds: [buildRaidTrainHeaderEmbed()] });
        const conductorMsg = await channel.send({ embeds: [buildConductorEmbed(conductor, currentSlot)] });
        const leaderboardMsg = await channel.send(toLeaderboardMessagePayload(leaderboardPayload));
        const scheduleMsg = await channel.send({ embeds: [buildScheduleEmbed(schedule)] });
        const footerMsg = await channel.send({ 
            embeds: [buildFooterEmbed()],
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`raid-train_signup-button_${guildId}`)
                    .setLabel('Sign Up')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🚂'),
                new ButtonBuilder()
                    .setCustomId(`raid-train_giveaway-button_${guildId}`)
                    .setLabel('Give Away Spot')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🎟️')
            )]
        });

        await setRaidTrainChannel(guildId, channel.id, {
            headerId: headerMsg.id,
            conductorId: conductorMsg.id,
            clipId: clipMsgId,
            leaderboardId: leaderboardMsg.id,
            scheduleId: scheduleMsg.id,
            footerId: footerMsg.id
        });
        
        startRaidTrainTracking(client, guildId);

    } catch (e: any) {
         console.error(`CRITICAL: Failed to run initial raid train check for guild ${guildId}:`, e);
         try {
            await channel.send(`There was a critical error setting up the Raid Train embed. Please try the \`/disable-feature\` command and then try again. Error: ${e.message}`);
         } catch {}
    }
}

export async function stopRaidTrainTracking(client: Client, guildId: string): Promise<boolean> {
    if (activeTrackers[guildId]) {
        clearInterval(activeTrackers[guildId]);
        delete activeTrackers[guildId];
        console.log(`Stopped raid train tracking for guild ${guildId}.`);
    }

    const configDocRef = db.collection(`communities/${guildId}/settings`).doc('raidTrainChannel');
    const configDoc = await configDocRef.get();
    if (!configDoc.exists) return false;
    
    const config = configDoc.data();
    if (!config || !config.channelId) return false;

    const channel = await client.channels.fetch(config.channelId).catch(() => null) as TextChannel | null;
    if (channel) {
        const messageIdsToDelete = [config.headerId, config.conductorId, config.clipId, config.leaderboardId, config.scheduleId, config.footerId].filter(Boolean);
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
            console.error(`Could not delete old raid train messages in guild ${guildId}:`, e.message);
        }
    }
    
    await configDocRef.delete();

    if (messageStore[guildId]) {
        delete messageStore[guildId];
    }
    return true;
}
