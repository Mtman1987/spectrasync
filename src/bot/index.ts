
// src/bot/index.ts
import http from 'node:http';

import { config } from 'dotenv';
config(); // This loads your .env file

// IMPORTANT: We will now initialize Firebase Admin inside the functions that need it.
import { getAdminDb } from '@/lib/firebase-admin';

import { Client, GatewayIntentBits, ChannelType, Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, SlashCommandBuilder, REST, Routes, TextChannel, Guild, PermissionFlagsBits, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getUserInfoByDiscordId, saveUserTwitchInfo, joinPile, joinCommunityPool } from '@/app/actions';
import { addCalendarEventFromBot, claimAnnouncementSpotFromBot, buildCalendarEmbed, setCalendarControlMessage } from '@/app/calendar/actions';
import { signUpForRaidTrain, findUserRaidTrainSlot, giveAwayRaidTrainSpot, getRaidTrainSchedule } from '@/app/raid-train/actions';
import { buildLeaderboardEmbed, setLeaderboardControlMessage, getLeaderboard } from '@/app/leaderboard/actions';
import { startVipTracking, runInitialVipCheck, stopVipTracking } from './vip-tracker';
import { startCommunityPoolTracking, runInitialCommunityPoolCheck, stopCommunityPoolTracking } from './community-pool-tracker';
import { startRaidPileTracking, runInitialRaidPileCheck, stopRaidPileTracking } from './raid-pile-tracker';
import { startRaidTrainTracking, runInitialRaidTrainCheck, stopRaidTrainTracking, buildScheduleEmbed as buildRaidTrainScheduleEmbed } from './raid-train-tracker';
import { startClipGifProcessing } from './clip-gif-processor';
import { format, addDays } from 'date-fns';


// --- CONFIGURATION ---
const {
    DISCORD_BOT_TOKEN,
    NEXT_PUBLIC_DISCORD_CLIENT_ID,
    PORT,
} = process.env;

if (!DISCORD_BOT_TOKEN || !NEXT_PUBLIC_DISCORD_CLIENT_ID) {
    console.error("Error: Missing required environment variables (DISCORD_BOT_TOKEN, NEXT_PUBLIC_DISCORD_CLIENT_ID). Please check your .env file.");
    process.exit(1);
}

// --- BOT INITIALIZATION ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const serverPort = Number(PORT ?? 8080);

http
    .createServer((req, res) => {
        if (!req.url) {
            res.statusCode = 400;
            res.end('Bad Request');
            return;
        }

        if (req.url === '/healthz' || req.url === '/readyz') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ status: 'ok' }));
            return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('CosmicRaid bot is running');
    })
    .listen(serverPort, () => {
        console.log(`Health server listening on port ${serverPort}`);
    });

const activityChannelMap: { [key: string]: string } = {
    'View Raid Pile': '/raid-pile',
    'View Raid Train': '/raid-train',
    'View Community Pool': '/community-pool',
    'View VIPs Live': '/vip-live',
    'View Calendar': '/calendar',
};

// --- SLASH COMMANDS DEFINITION ---
const commands = [
    new SlashCommandBuilder()
        .setName('calendar')
        .setDescription('Posts the interactive community calendar embed in this channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Posts the interactive community leaderboard embed in this channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    new SlashCommandBuilder()
        .setName('vip-live')
        .setDescription('Sets this channel for automatic VIP live announcements.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    new SlashCommandBuilder()
        .setName('community-pool')
        .setDescription('Sets this channel for automatic community pool live announcements.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    new SlashCommandBuilder()
        .setName('raid-pile')
        .setDescription('Sets this channel for the live-updating Raid Pile embed.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    new SlashCommandBuilder()
        .setName('raid-train')
        .setDescription('Sets this channel for the live-updating Raid Train embed.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    new SlashCommandBuilder()
        .setName('disable-feature')
        .setDescription('Disables a feature and cleans up its channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addStringOption(option => 
            option.setName('feature')
                .setDescription('The feature to disable')
                .setRequired(true)
                .addChoices(
                    { name: 'VIP Live', value: 'vip-live' },
                    { name: 'Community Pool', value: 'community-pool' },
                    { name: 'Raid Pile', value: 'raid-pile' },
                    { name: 'Raid Train', value: 'raid-train' },
                    { name: 'Calendar', value: 'calendar' },
                    { name: 'Leaderboard', value: 'leaderboard' }
                )
        ),
    new SlashCommandBuilder()
        .setName('points')
        .setDescription('Check your current points and rank on the leaderboard.')
        .setDMPermission(false),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

async function registerCommandsForGuild(guild: Guild) {
    if (!NEXT_PUBLIC_DISCORD_CLIENT_ID) return;
    try {
        await rest.put(
            Routes.applicationGuildCommands(NEXT_PUBLIC_DISCORD_CLIENT_ID, guild.id),
            { body: commands },
        );
        console.log(`Successfully registered commands for guild: ${guild.name} (${guild.id})`);
    } catch (error) {
        console.error(`Failed to register commands for guild ${guild.id}:`, error);
    }
}

// --- NEW FUNCTION TO START TRACKERS ---
function startTrackers(guildId: string) {
    console.log(`Starting all trackers and listeners for guild: ${guildId}`);
    
    // Start all background listeners
    updateCalendarEmbed(guildId); 
    listenForCalendarUpdates(guildId);
    
    updateLeaderboardEmbed(guildId);
    listenForLeaderboardUpdates(guildId);

    // Start all real-time trackers
    startVipTracking(client, guildId);
    startCommunityPoolTracking(client, guildId);
    startRaidPileTracking(client, guildId);
    startRaidTrainTracking(client, guildId);
    startClipGifProcessing(guildId);
}

// --- BOT EVENT HANDLERS ---
client.on('ready', async () => {
    if (client.user) {
        console.log(`Logged in as ${client.user.tag}!`);
        
        const guilds = await client.guilds.fetch();
        for (const [_, oauth2guild] of guilds) {
            try {
                const guild = await oauth2guild.fetch();
                await registerCommandsForGuild(guild);
                startTrackers(guild.id); // Start trackers for each guild
            } catch(e) {
                console.error("Could not fetch a guild to register commands or start trackers.", e);
            }
        }
    } else {
        console.error("Bot user is not available.");
    }
});


// Register commands for any new guilds the bot joins.
client.on('guildCreate', async (guild) => {
    console.log(`Joined new guild: ${guild.name} (${guild.id})`);
    await registerCommandsForGuild(guild);
    startTrackers(guild.id); // Start trackers for the new guild
});


client.on('channelCreate', async channel => {
    if (channel.type !== ChannelType.GuildVoice || !NEXT_PUBLIC_DISCORD_CLIENT_ID) return;
    
    const pagePath = activityChannelMap[channel.name];
    if (!pagePath) return;

    console.log(`New activity voice channel created: ${channel.name} (${channel.id}).`);
    try {
        await createActivityInvite(channel, pagePath);
    } catch (error) {
        console.error(`Failed to create activity invite for channel ${channel.id}:`, error);
    }
});

async function createActivityInvite(channel: any, pagePath: string) {
    if (!NEXT_PUBLIC_DISCORD_CLIENT_ID) throw new Error("Discord Client ID is not configured.");

    const invite = await channel.createInvite({
        target_type: 2,
        target_application_id: NEXT_PUBLIC_DISCORD_CLIENT_ID,
        custom: encodeURIComponent(JSON.stringify({ 
            pagePath: pagePath
        })) 
    });
    
    console.log(`Successfully created activity invite for ${channel.name}: ${invite.url}`);
    return invite;
}


async function handleInteraction(interaction: Interaction) {
    if (!interaction.guildId) return;

    const db = getAdminDb(); // Initialize DB connection for this interaction

    if (interaction.isChatInputCommand()) {
        const { commandName, guildId, channel, channelId, user } = interaction;
        
        // Handle /points command which doesn't require a text channel
        if (commandName === 'points') {
            await interaction.deferReply({ ephemeral: true });
            try {
                const { value: userInfo } = await getUserInfoByDiscordId(guildId, user.id);
                const userPoints = userInfo?.points || 0;

                const fullLeaderboard = await getLeaderboard(guildId);
                const userRank = fullLeaderboard.findIndex(u => u.discordId === user.id);

                let rankText = "Not on leaderboard";
                if (userRank !== -1) {
                    rankText = `#${userRank + 1} of ${fullLeaderboard.length}`;
                }

                const embed = new EmbedBuilder()
                    .setTitle(`${user.username}'s Stats`)
                    .setColor(0x5865F2)
                    .addFields(
                        { name: 'Points', value: `**${userPoints}**`, inline: true },
                        { name: 'Rank', value: `**${rankText}**`, inline: true }
                    )
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [embed] });

            } catch (e) {
                console.error("Failed to get user points:", e);
                await interaction.editReply('An error occurred while fetching your points.');
            }
            return; // End execution for this command
        }


        if (!channelId || !channel || channel.type !== ChannelType.GuildText) {
             await interaction.reply({ content: 'This command can only be used in a text channel.', ephemeral: true });
             return;
        }
        
        if (commandName === 'calendar') {
             await interaction.deferReply({ ephemeral: true });
            try {
                const payload = await buildCalendarEmbed(guildId);
                if (!payload) throw new Error("Failed to build calendar embed.");
                
                const message = await (channel as TextChannel).send(payload);
                await setCalendarControlMessage(guildId, channelId, message.id);
                await interaction.editReply('Calendar embed posted!');
            } catch (e) {
                console.error("Failed to post calendar embed:", e);
                await interaction.editReply('An error occurred while posting the calendar.');
            }
        } else if (commandName === 'leaderboard') {
            await interaction.deferReply({ ephemeral: true });
            try {
                const payload = await buildLeaderboardEmbed(guildId);
                 if (!payload) throw new Error("Failed to build leaderboard embed.");

                const message = await (channel as TextChannel).send(payload);
                await setLeaderboardControlMessage(guildId, channelId, message.id);
                await interaction.editReply('Leaderboard embed posted!');
            } catch(e) {
                 console.error("Failed to post leaderboard embed:", e);
                await interaction.editReply('An error occurred while posting the leaderboard.');
            }
        } else if (commandName === 'vip-live') {
            await interaction.deferReply({ ephemeral: true });
            try {
                await runInitialVipCheck(client, guildId, channel as TextChannel);
                startVipTracking(client, guildId);
                await interaction.editReply(`This channel has been set up for VIP live announcements. The tracker is now active for this community.`);
            } catch (e) {
                console.error("Failed to set VIP live channel:", e);
                await interaction.editReply('An error occurred while setting up the VIP live channel.');
            }
        } else if (commandName === 'community-pool') {
            await interaction.deferReply({ ephemeral: true });
            try {
                await runInitialCommunityPoolCheck(client, guildId, channel as TextChannel);
                startCommunityPoolTracking(client, guildId);
                await interaction.editReply(`This channel has been set up for Community Pool announcements. The tracker is now active.`);
            } catch (e) {
                console.error("Failed to set Community Pool channel:", e);
                await interaction.editReply('An error occurred while setting up the Community Pool channel.');
            }
        } else if (commandName === 'raid-pile') {
            await interaction.deferReply({ ephemeral: true });
            try {
                await runInitialRaidPileCheck(client, guildId, channel as TextChannel);
                await interaction.editReply(`This channel has been set up for the Raid Pile embed. The tracker is now active.`);
            } catch (e: any) {
                console.error("Failed to set Raid Pile channel:", e);
                await interaction.editReply(`An error occurred while setting up the Raid Pile channel: ${e.message}`);
            }
        } else if (commandName === 'raid-train') {
             await interaction.deferReply({ ephemeral: true });
            try {
                await runInitialRaidTrainCheck(client, guildId, channel as TextChannel);
                await interaction.editReply(`This channel has been set up for the Raid Train embed. The tracker is now active.`);
            } catch (e: any) {
                console.error("Failed to set Raid Train channel:", e);
                await interaction.editReply(`An error occurred while setting up the Raid Train channel: ${e.message}`);
            }
        } else if (commandName === 'disable-feature') {
            await interaction.deferReply({ ephemeral: true });
            const feature = interaction.options.getString('feature', true);
            let success = false;
            try {
                switch(feature) {
                    case 'vip-live':
                        success = await stopVipTracking(client, guildId);
                        break;
                    case 'community-pool':
                        success = await stopCommunityPoolTracking(client, guildId);
                        break;
                    case 'raid-pile':
                         success = await stopRaidPileTracking(client, guildId);
                        break;
                    case 'raid-train':
                         success = await stopRaidTrainTracking(client, guildId);
                        break;
                    case 'calendar':
                        await db.collection(`communities/${guildId}/settings`).doc('calendarControl').delete();
                        success = true;
                        break;
                    case 'leaderboard':
                        await db.collection(`communities/${guildId}/settings`).doc('leaderboardControl').delete();
                        success = true;
                        break;
                }
                if (success) {
                    await interaction.editReply(`The "${feature}" feature has been disabled and its configuration has been removed.`);
                } else {
                     await interaction.editReply(`Could not disable the "${feature}" feature. It might not have been configured.`);
                }
            } catch (e: any) {
                 await interaction.editReply(`An error occurred while disabling the feature: ${e.message}`);
            }
        }
    }

    if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
    }

    if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction);
    }
}

async function handleButtonInteraction(interaction: any) {
    if (!interaction.isButton() || !interaction.guildId) return;
    
    const { customId, user, guildId } = interaction;

    try {
        // Handle raid train signup flow separately as it's more complex
        if (customId.startsWith('raid-train_signup_view')) {
             await interaction.deferUpdate();
             const dateKey = customId.split('_')[3];
             const date = new Date(dateKey);

             const schedule = await getRaidTrainSchedule(guildId, dateKey);
             const scheduleEmbed = await buildRaidTrainScheduleEmbed(schedule);
             const components = createRaidTrainSignupComponents(dateKey);

             await interaction.editReply({
                 content: `Showing schedule for **${format(date, 'EEEE, MMMM d')}**. Select a time and claim your spot!`,
                 embeds: [scheduleEmbed],
                 components: components
             });
            return;
        }

         if (customId.startsWith('raid-train_signup_claim')) {
             const dateKey = customId.split('_')[3];
             const modal = new ModalBuilder()
                 .setCustomId(`raid-train_modal_signup_${dateKey}`)
                 .setTitle(`Sign up for ${format(new Date(dateKey), 'MMMM d')}`);

             modal.addComponents(
                 new ActionRowBuilder<TextInputBuilder>().addComponents(
                     new TextInputBuilder()
                         .setCustomId('raidTime')
                         .setLabel("Time slot to claim (e.g., 14:00)")
                         .setStyle(TextInputStyle.Short)
                         .setRequired(true)
                 )
             );
             await interaction.showModal(modal);
             return;
         }


        // Prerequisite check for other commands
        const { value: userInfo, error: userInfoError } = await getUserInfoByDiscordId(guildId, user.id);
        
        if (userInfoError) {
             await interaction.reply({ content: `There was an error fetching your profile: ${userInfoError}`, ephemeral: true});
             return;
        }

        if (!userInfo || !userInfo.twitchInfo?.login) {
            const setupModal = new ModalBuilder()
                .setCustomId(`user_setup_${customId}`)
                .setTitle('Twitch Account Setup');
            
            setupModal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId('twitchUsername')
                        .setLabel("What's your Twitch username?")
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('e.g., cosmic_raid_fan')
                        .setRequired(true)
                )
            );
            await interaction.showModal(setupModal);
            return;
        }

        const [action, type, ...rest] = customId.split('_');
        const eventGuildId = rest.join('_');

        if (action === 'calendar' && type === 'add') {
             const addEventModal = new ModalBuilder()
                .setCustomId(`calendar_modal_add_${eventGuildId}`)
                .setTitle('Add Calendar Event');
            addEventModal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                     new TextInputBuilder().setCustomId('eventName').setLabel("Event Name").setStyle(TextInputStyle.Short).setRequired(true)
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                     new TextInputBuilder().setCustomId('eventDate').setLabel("Date (e.g., 'today', 'tomorrow', 'July 26')").setStyle(TextInputStyle.Short).setRequired(true)
                ),
                 new ActionRowBuilder<TextInputBuilder>().addComponents(
                     new TextInputBuilder().setCustomId('eventTime').setLabel("Time (e.g., 8:00 PM EST)").setStyle(TextInputStyle.Short).setRequired(true)
                )
            );
            await interaction.showModal(addEventModal);
        
        } else if (action === 'calendar' && type === 'claim') {
            const claimSpotModal = new ModalBuilder()
                .setCustomId(`calendar_modal_claim_${eventGuildId}`)
                .setTitle("Claim Captain's Log");
            claimSpotModal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                     new TextInputBuilder().setCustomId('announcementDate').setLabel("Date to claim (e.g., 'today', 'July 28')").setStyle(TextInputStyle.Short).setRequired(true)
                ),
            );
            await interaction.showModal(claimSpotModal);

        } else if (action === 'raid' && type === 'join') {
            await interaction.deferReply({ ephemeral: true });
            const result = await joinPile(guildId, user.id);
            if (result.success) {
                await interaction.editReply('You have been added to the raid pile! You will earn points when the raid happens.');
            } else {
                await interaction.editReply(`Error: ${result.error}`);
            }
        } else if (action === 'community' && type === 'pool' && rest[0] === 'join') {
            await interaction.deferReply({ ephemeral: true });
            const result = await joinCommunityPool(guildId, user.id);
            if (result.success) {
                await interaction.editReply('You have successfully joined the community pool! You will appear on the page whenever you go live.');
            } else {
                await interaction.editReply(`Error joining pool: ${result.error}`);
            }
        } else if (action === 'raid-train' && type === 'signup-button') {
            await interaction.deferReply({ ephemeral: true });
            const today = new Date();
            const dateKey = format(today, 'yyyy-MM-dd');
            const schedule = await getRaidTrainSchedule(guildId, dateKey);
            const scheduleEmbed = await buildRaidTrainScheduleEmbed(schedule);
            const components = createRaidTrainSignupComponents(dateKey);

            await interaction.editReply({
                content: `Showing schedule for **Today, ${format(today, 'MMMM d')}**. Select a day to view its schedule or claim a spot for today.`,
                embeds: [scheduleEmbed],
                components: components,
            });

        } else if (action === 'raid-train' && type === 'giveaway-button') {
             await interaction.deferReply({ ephemeral: true });
             const dateKey = format(new Date(), 'yyyy-MM-dd');
             const twitchUserId = userInfo.twitchInfo.id;
             const userSlot = await findUserRaidTrainSlot(guildId, dateKey, twitchUserId);
             if (userSlot) {
                 const result = await giveAwayRaidTrainSpot(guildId, dateKey, userSlot);
                 if (result.success) {
                     await interaction.editReply(`You have given up your spot for ${userSlot}. It is now an emergency fill slot.`);
                 } else {
                     await interaction.editReply(`Error giving up your spot: ${result.error}`);
                 }
             } else {
                 await interaction.editReply("Could not find your spot on today's raid train schedule.");
             }
        } else {
             if (!interaction.replied && !interaction.deferred) {
                 await interaction.reply({ content: 'This button is not recognized or is no longer active.', ephemeral: true });
            }
        }
    } catch (error) {
        console.error("Error in handleButtonInteraction:", error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An unexpected error occurred.', ephemeral: true }).catch(() => {});
        } else {
             await interaction.editReply({ content: 'An unexpected error occurred while handling this button click.' }).catch(() => {});
        }
    }
}

function createRaidTrainSignupComponents(dateKey: string): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    const dateButtons: ButtonBuilder[] = [];

    // Create buttons for the next 5 days
    for (let i = 0; i < 5; i++) {
        const date = addDays(new Date(), i);
        const key = format(date, 'yyyy-MM-dd');
        dateButtons.push(
            new ButtonBuilder()
                .setCustomId(`raid-train_signup_view_${key}`)
                .setLabel(format(date, 'EEE, MMM d'))
                .setStyle(key === dateKey ? ButtonStyle.Primary : ButtonStyle.Secondary)
        );
    }
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(dateButtons));
    
    // Create action buttons row
    const actionButtons = [
        new ButtonBuilder()
            .setCustomId(`raid-train_signup_claim_${dateKey}`)
            .setLabel(`Claim Spot for ${format(new Date(dateKey), 'MMM d')}`)
            .setStyle(ButtonStyle.Success)
            .setEmoji('🎟️'),
    ];
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(actionButtons));


    return rows;
}


async function handleModalSubmit(interaction: any) {
    if (!interaction.isModalSubmit() || !interaction.guildId) return;

    const { customId, user, guildId } = interaction;
    const parts = customId.split('_');
    const mainAction = parts[0];
    const subAction = parts[1];

    try {
        if (mainAction === 'user' && subAction === 'setup') {
            await interaction.deferReply({ ephemeral: true });
            const twitchUsername = interaction.fields.getTextInputValue('twitchUsername');
            
            const avatarURL = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null;
            const saveResult = await saveUserTwitchInfo(guildId, user.id, user.username, avatarURL, twitchUsername);

            if (saveResult.success) {
                await interaction.editReply('Thanks! Your Twitch username is saved. Please click the original button again to complete your action.');
            } else {
                await interaction.editReply(`Error saving your info: ${saveResult.error}`);
            }
            return;
        }
        
        if (mainAction === 'calendar' && subAction === 'modal') {
            await interaction.deferReply({ ephemeral: true });
            
            const type = parts[2];
            const eventGuildId = parts.slice(3).join('_');
            
            if (!eventGuildId) {
                await interaction.editReply('Error: Could not determine the community for this action.');
                return;
            };

            if (type === 'add') {
                const eventName = interaction.fields.getTextInputValue('eventName');
                const eventDateStr = interaction.fields.getTextInputValue('eventDate');
                const eventTime = interaction.fields.getTextInputValue('eventTime');
                
                const result = await addCalendarEventFromBot(eventGuildId, { name: eventName, date: eventDateStr, time: eventTime, type: 'Community' });
                if (result.success) {
                    await interaction.editReply('Event added successfully! The embed will update shortly.');
                } else {
                    await interaction.editReply(`Error: ${result.error}`);
                }
            } else if (type === 'claim') {
                 const announcementDateStr = interaction.fields.getTextInputValue('announcementDate');
                 const result = await claimAnnouncementSpotFromBot(eventGuildId, announcementDateStr, user.id);
                 if (result.success) {
                    await interaction.editReply('Spot claimed! The embed will update shortly.');
                 } else {
                    await interaction.editReply(`Error: ${result.error}`);
                 }
            } else {
                 await interaction.editReply('Sorry, I did not understand that command.');
            }
            return;
        }
        
         if (mainAction === 'raid-train' && subAction === 'modal') {
             await interaction.deferReply({ ephemeral: true });
             const type = parts[2];
             
             if (type === 'signup') {
                 const dateKey = parts.slice(3).join('_');
                 const raidTime = interaction.fields.getTextInputValue('raidTime');
                 const { value: userInfo } = await getUserInfoByDiscordId(guildId, user.id);

                 if (!userInfo?.twitchInfo?.login) {
                     await interaction.editReply('Your Twitch account is not linked. Please link it and try again.');
                     return;
                 }
                
                 // We pass the dateKey directly now instead of a string like 'today'
                 const result = await signUpForRaidTrain(guildId, dateKey, raidTime, userInfo.twitchInfo.login);
                 if(result.success) {
                     await interaction.editReply(`You've signed up for the raid train on ${format(new Date(dateKey), 'MMMM d')} at ${raidTime}! ${result.message}`);
                 } else {
                      await interaction.editReply(`Error signing up: ${result.error}`);
                 }
             }
             return;
         }


        console.warn(`Unhandled modal submission with customId: ${customId}`);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'This interaction is no longer valid or has expired.', ephemeral: true });
        }

    } catch (e) {
        console.error("Error processing modal submission:", e);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An unexpected error occurred.', ephemeral: true }).catch(() => {});
        } else {
            await interaction.editReply('An unexpected error occurred while processing your request.').catch(() => {});
        }
    }
}


client.on('interactionCreate', handleInteraction);


// --- HELPER FUNCTIONS ---
async function updateCalendarEmbed(guildId: string) {
    const db = getAdminDb();
    try {
        const controlRef = db.collection(`communities/${guildId}/settings`).doc('calendarControl');
        const controlDoc = await controlRef.get();
        
        if (!controlDoc.exists) return;
        
        const newPayload = await buildCalendarEmbed(guildId);

        if (newPayload) {
            const { channelId, messageId } = controlDoc.data() as { channelId: string; messageId: string };
            if (!channelId || !messageId) return;

            const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
            if (!channel) {
                 await controlRef.delete();
                 return;
            };

            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message) {
                await controlRef.delete();
                return;
            };

            await message.edit(newPayload);
        }
    } catch (e: any) {
        console.error(`Failed to update calendar embed for guild ${guildId}:`, e.message);
        if (e.code === 50001 || e.code === 10003 || e.code === 10008) { 
            await db.collection(`communities/${guildId}/settings`).doc('calendarControl').delete().catch(()=>{});
        }
    }
}

function listenForCalendarUpdates(guildId: string) {
    const db = getAdminDb();
    const eventsQuery = db.collection(`communities/${guildId}/calendar`);
    eventsQuery.onSnapshot(() => {
        updateCalendarEmbed(guildId)
    }, err => console.error(`Snapshot error on 'calendar' for guild ${guildId}:`, err));

    const signupsQuery = db.collection(`communities/${guildId}/captainsLog`);
    signupsQuery.onSnapshot(() => {
        updateCalendarEmbed(guildId);
    }, err => console.error(`Snapshot error on 'captainsLog' for guild ${guildId}:`, err));
}

async function updateLeaderboardEmbed(guildId: string) {
    const db = getAdminDb();
    try {
        const controlRef = db.collection(`communities/${guildId}/settings`).doc('leaderboardControl');
        const controlDoc = await controlRef.get();

        if (!controlDoc.exists) return;

        const newPayload = await buildLeaderboardEmbed(guildId);
        if (newPayload) {
            const { channelId, messageId } = controlDoc.data() as { channelId: string; messageId: string };
            const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
            if (!channel) {
                await controlRef.delete();
                return;
            }
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message) {
                await controlRef.delete();
                return;
            }
            await message.edit(newPayload);
        }
    } catch (e: any) {
        console.error(`Failed to update leaderboard embed for guild ${guildId}:`, e.message);
    }
}


function listenForLeaderboardUpdates(guildId: string) {
    const db = getAdminDb();
    const usersQuery = db.collection(`communities/${guildId}/users`);
    usersQuery.onSnapshot((snapshot) => {
        const hasPointsChange = snapshot.docChanges().some(change => {
            if (change.type === 'modified') {
                const oldPoints = change.doc.data().points;
                const newPoints = snapshot.docs.find(d => d.id === change.doc.id)?.data().points;
                return oldPoints !== newPoints;
            }
            return change.type === 'added' || change.type === 'removed';
        });

        if (hasPointsChange) {
            updateLeaderboardEmbed(guildId);
        }
    }, err => console.error(`Snapshot error on 'users' for guild ${guildId}:`, err));
}



// --- LOGIN ---
console.log("Logging into Discord...");
client.login(DISCORD_BOT_TOKEN);
