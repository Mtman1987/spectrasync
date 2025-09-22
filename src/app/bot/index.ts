
// src/bot/index.ts
import { config } from 'dotenv';
config(); // This loads your .env file

import { Client, GatewayIntentBits, ChannelType, Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, SlashCommandBuilder, REST, Routes, TextChannel, Guild, PermissionFlagsBits } from 'discord.js';
import { getAdminDb } from '@/lib/firebase-admin';
import { getUserInfoByDiscordId, saveUserTwitchInfo, joinPile } from '@/app/actions';
import { addCalendarEventFromBot, claimAnnouncementSpotFromBot, buildCalendarEmbed, setCalendarControlMessage } from '@/app/calendar/actions';
import { signUpForRaidTrain } from '@/app/raid-train/actions';
import { buildLeaderboardEmbed, setLeaderboardControlMessage } from '@/app/leaderboard/actions';
import { startVipTracking, runInitialVipCheck } from '@/bot/vip-tracker';
import { startCommunityPoolTracking, runInitialCommunityPoolCheck } from '@/bot/community-pool-tracker';
import { startRaidPileTracking, runInitialRaidPileCheck } from '@/bot/raid-pile-tracker';
import { startRaidTrainTracking, runInitialRaidTrainCheck } from '@/bot/raid-train-tracker';


// --- CONFIGURATION ---
const { 
    DISCORD_BOT_TOKEN, 
    NEXT_PUBLIC_DISCORD_CLIENT_ID,
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

const db = getAdminDb();

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


// --- BOT EVENT HANDLERS ---
client.on('ready', async () => {
    if (client.user) {
        console.log(`Logged in as ${client.user.tag}!`);
        
        const guilds = await client.guilds.fetch();
        for (const [_, oauth2guild] of guilds) {
            try {
                const guild = await oauth2guild.fetch();
                await registerCommandsForGuild(guild);
                
                // Also initialize trackers for each existing guild
                const guildId = guild.id;
                updateCalendarEmbed(guildId); 
                listenForCalendarUpdates(guildId);
                console.log(`Listening for calendar updates and forced a refresh for guild: ${guildId}`);
                
                updateLeaderboardEmbed(guildId);
                listenForLeaderboardUpdates(guildId);
                console.log(`Listening for leaderboard updates and forced a refresh for guild: ${guildId}`);

                startVipTracking(client, guildId);
                console.log(`Starting VIP tracking for guild: ${guildId}`);

                startCommunityPoolTracking(client, guildId);
                console.log(`Starting Community Pool tracking for guild: ${guildId}`);

                startRaidPileTracking(client, guildId);
                console.log(`Starting Raid Pile tracking for guild: ${guildId}`);

                startRaidTrainTracking(client, guildId);
                console.log(`Starting Raid Train tracking for guild: ${guildId}`);
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

    if (interaction.isChatInputCommand()) {
        const { commandName, guildId, channel, channelId } = interaction;

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
                await interaction.editReply(`This channel has been set up for VIP live announcements. The tracker is now active for this community.`);
                startVipTracking(client, guildId);
            } catch (e) {
                console.error("Failed to set VIP live channel:", e);
                await interaction.editReply('An error occurred while setting up the VIP live channel.');
            }
        } else if (commandName === 'community-pool') {
            await interaction.deferReply({ ephemeral: true });
            try {
                await runInitialCommunityPoolCheck(client, guildId, channel as TextChannel);
                await interaction.editReply(`This channel has been set up for Community Pool announcements. The tracker is now active.`);
                startCommunityPoolTracking(client, guildId);
            } catch (e) {
                console.error("Failed to set Community Pool channel:", e);
                await interaction.editReply('An error occurred while setting up the Community Pool channel.');
            }
        } else if (commandName === 'raid-pile') {
            await interaction.deferReply({ ephemeral: true });
            try {
                await runInitialRaidPileCheck(client, guildId, channel as TextChannel);
                await interaction.editReply(`This channel has been set up for the Raid Pile embed. The tracker is now active.`);
                startRaidPileTracking(client, guildId);
            } catch (e) {
                console.error("Failed to set Raid Pile channel:", e);
                await interaction.editReply('An error occurred while setting up the Raid Pile channel.');
            }
        } else if (commandName === 'raid-train') {
             await interaction.deferReply({ ephemeral: true });
            try {
                await runInitialRaidTrainCheck(client, guildId, channel as TextChannel);
                await interaction.editReply(`This channel has been set up for the Raid Train embed. The tracker is now active.`);
                startRaidTrainTracking(client, guildId);
            } catch (e) {
                console.error("Failed to set Raid Train channel:", e);
                await interaction.editReply('An error occurred while setting up the Raid Train channel.');
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
        // This is a prerequisite for most actions.
        const { value: userInfo, error: userInfoError } = await getUserInfoByDiscordId(guildId, user.id);
        
        if (userInfoError) {
             await interaction.reply({ content: `There was an error fetching your profile: ${userInfoError}`, ephemeral: true});
             return;
        }

        if (!userInfo || !userInfo.twitchInfo?.login) {
            // If no twitch info, show the modal to ask for it.
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

        // If we've reached here, the user is set up. Now we can handle the intended action.
        const [action, type, ...rest] = customId.split('_');
        const eventGuildId = rest.join('_'); // Re-join in case guild ID has underscores

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
        } else if (action === 'raid-train' && type === 'signup-button') {
             const signupModal = new ModalBuilder()
                .setCustomId(`raid-train_modal_signup_${eventGuildId}`)
                .setTitle('Sign Up For Raid Train');
            signupModal.addComponents(
                 new ActionRowBuilder<TextInputBuilder>().addComponents(
                     new TextInputBuilder().setCustomId('raidDate').setLabel("Date to raid (e.g., 'today', 'tomorrow')").setStyle(TextInputStyle.Short).setRequired(true)
                ),
                 new ActionRowBuilder<TextInputBuilder>().addComponents(
                     new TextInputBuilder().setCustomId('raidTime').setLabel("Time slot to claim (e.g., 14:00, 21:00)").setStyle(TextInputStyle.Short).setRequired(true)
                ),
            );
            await interaction.showModal(signupModal);

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
             const eventGuildId = parts.slice(3).join('_');

             if (!eventGuildId) {
                 await interaction.editReply('Error: Could not determine the community for this action.');
                 return;
             }
             if (type === 'signup') {
                 const raidDate = interaction.fields.getTextInputValue('raidDate');
                 const raidTime = interaction.fields.getTextInputValue('raidTime');
                 const { value: userInfo } = await getUserInfoByDiscordId(guildId, user.id);

                 if (!userInfo?.twitchInfo?.login) {
                     await interaction.editReply('Your Twitch account is not linked. Please link it and try again.');
                     return;
                 }
                
                 const result = await signUpForRaidTrain(eventGuildId, raidDate, raidTime, userInfo.twitchInfo.login);
                 if(result.success) {
                     await interaction.editReply(`You've signed up for the raid train on ${raidDate} at ${raidTime}! ${result.message}`);
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
    // console.log(`Attempting to update calendar for guild: ${guildId}`);
    try {
        const controlRef = db.collection(`communities/${guildId}/settings`).doc('calendarControl');
        const controlDoc = await controlRef.get();
        
        if (!controlDoc.exists) {
            // console.log(`No calendar control document found for guild ${guildId}. Skipping update.`);
            return;
        }
        
        const newPayload = await buildCalendarEmbed(guildId);

        if (newPayload) {
            const { channelId, messageId } = controlDoc.data() as { channelId: string; messageId: string };
            if (!channelId || !messageId) {
                console.log(`Incomplete calendar control data for guild ${guildId}.`);
                return;
            };

            const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
            if (!channel) {
                 console.log(`Calendar channel ${channelId} not found for guild ${guildId}, removing control doc.`);
                 await controlRef.delete();
                 return;
            };

            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message) {
                console.log(`Calendar message ${messageId} not found in channel ${channelId}, removing control doc.`);
                await controlRef.delete();
                return;
            };

            await message.edit(newPayload);
            // console.log(`Successfully updated calendar embed for guild ${guildId}`);
        } else {
             console.log(`Failed to build new calendar payload for guild ${guildId}.`);
        }
    } catch (e: any) {
        console.error(`Failed to update calendar embed for guild ${guildId}:`, e.message);
        if (e.code === 50001 || e.code === 10003 || e.code === 10008) { 
            console.log("Removing invalid calendar control document due to permissions or missing resource.");
            await db.collection(`communities/${guildId}/settings`).doc('calendarControl').delete().catch(delErr => console.error("Failed to delete control doc:", delErr));
        }
    }
}

function listenForCalendarUpdates(guildId: string) {
    const eventsQuery = db.collection(`communities/${guildId}/calendar`);
    eventsQuery.onSnapshot(() => {
        // console.log(`Calendar event change detected for guild ${guildId}.`);
        updateCalendarEmbed(guildId)
    }, err => {
        console.error(`Snapshot error on 'calendar' for guild ${guildId}:`, err);
    });

    const signupsQuery = db.collection(`communities/${guildId}/captainsLog`);
    signupsQuery.onSnapshot(() => {
        // console.log(`Captain's Log change detected for guild ${guildId}.`);
        updateCalendarEmbed(guildId);
    }, err => {
        console.error(`Snapshot error on 'captainsLog' for guild ${guildId}:`, err);
    });
}

async function updateLeaderboardEmbed(guildId: string) {
    // console.log(`Attempting to update leaderboard for guild: ${guildId}`);
    try {
        const controlRef = db.collection(`communities/${guildId}/settings`).doc('leaderboardControl');
        const controlDoc = await controlRef.get();

        if (!controlDoc.exists) {
            // console.log(`No leaderboard control document found for guild ${guildId}. Skipping update.`);
            return;
        }

        const newPayload = await buildLeaderboardEmbed(guildId);
        if (newPayload) {
            const { channelId, messageId } = controlDoc.data() as { channelId: string; messageId: string };
            const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
            if (!channel) {
                console.log(`Leaderboard channel ${channelId} not found, removing control doc.`);
                await controlRef.delete();
                return;
            }
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message) {
                console.log(`Leaderboard message ${messageId} not found, removing control doc.`);
                await controlRef.delete();
                return;
            }
            await message.edit(newPayload);
            // console.log(`Successfully updated leaderboard embed for guild ${guildId}`);
        }
    } catch (e: any) {
        console.error(`Failed to update leaderboard embed for guild ${guildId}:`, e.message);
    }
}


function listenForLeaderboardUpdates(guildId: string) {
    const usersQuery = db.collection(`communities/${guildId}/users`);
    // This is a bit inefficient, but it's the simplest way to catch any point changes.
    // A more optimized solution might use a separate 'events' collection.
    usersQuery.onSnapshot((snapshot) => {
        const hasPointsChange = snapshot.docChanges().some(change => {
            if (change.type === 'modified') {
                const oldPoints = change.doc.data().points;
                const newPoints = snapshot.docs.find(d => d.id === change.doc.id)?.data().points;
                return oldPoints !== newPoints;
            }
            // Also trigger on new users being added or removed
            return change.type === 'added' || change.type === 'removed';
        });

        if (hasPointsChange) {
            // console.log(`User points change detected for guild ${guildId}.`);
            updateLeaderboardEmbed(guildId);
        }
    }, err => {
        console.error(`Snapshot error on 'users' for guild ${guildId}:`, err);
    });
}



// --- LOGIN ---
console.log("Logging into Discord...");
client.login(DISCORD_BOT_TOKEN);
