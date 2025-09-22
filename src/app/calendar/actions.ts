
// src/app/calendar/actions.ts
"use server";

import { getAdminDb } from "@/lib/firebase-admin";
import { format, startOfDay, parseISO, startOfMonth, getDaysInMonth, getDay, parse } from "date-fns";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getSettings } from "../settings/actions";
import { getAdminInfo, getUserInfoByDiscordId } from "../actions";


export type CalendarEvent = {
    id: string;
    name: string;
    date: string; // ISO string for date
    time: string; // e.g., "4:00 PM PST"
    type: 'Admin' | 'VIP' | 'Community';
    description?: string;
};

export type AnnouncementSignup = {
    userId: string;
    userName: string;
    userAvatar: string;
    emoji?: string; 
    signedUpAt?: string; // Changed to string for serialization
};

export type TodaysAnnouncer = {
    userName: string;
    emoji?: string;
};


export async function addCalendarEvent(guildId: string, eventData: Omit<CalendarEvent, 'id' | 'type'> & { type: 'Admin' | 'VIP' | 'Community' }) {
    if (!guildId) {
        return { success: false, error: "Community ID is missing." };
    }
    try {
        const db = getAdminDb();
        const calendarCollectionRef = db.collection(`communities/${guildId}/calendar`);
        const docRef = await calendarCollectionRef.add(eventData);
        
        return { success: true, id: docRef.id };

    } catch (error) {
        console.error("Error adding calendar event:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
    }
}

function parseDateString(dateString: string): Date {
    if (dateString.toLowerCase() === 'tomorrow') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
    }
    if (dateString.toLowerCase() === 'today') {
        return new Date();
    }
    return new Date(dateString);
}


export async function addCalendarEventFromBot(guildId: string, eventData: { name: string; date: string; time: string; type: 'Community' }) {
    const targetDate = parseDateString(eventData.date);

    if (isNaN(targetDate.getTime())) {
        return { success: false, error: "Invalid date format. Please use a format like 'July 26', 'today', or 'tomorrow'." };
    }

    return addCalendarEvent(guildId, {
        ...eventData,
        date: targetDate.toISOString(),
        type: 'Community', 
    });
}


export async function getCalendarEvents(guildId: string): Promise<CalendarEvent[]> {
     if (!guildId) {
        console.error("No guildId provided to getCalendarEvents");
        return [];
    }
    try {
        const db = getAdminDb();
        const calendarCollectionRef = db.collection(`communities/${guildId}/calendar`);
        const q = calendarCollectionRef.orderBy("date", "asc");
        const querySnapshot = await q.get();

        if (querySnapshot.empty) {
            return [];
        }
        
        const events: CalendarEvent[] = [];
        querySnapshot.forEach(doc => {
            events.push({ id: doc.id, ...doc.data() } as CalendarEvent);
        });

        return events;

    } catch (error) {
        console.error(`Error getting calendar events for guild ${guildId}:`, error);
        return [];
    }
}


/**
 * Fetches the announcement log signups for a specific month.
 * The monthKey should be in 'yyyy-MM' format.
 */
export async function getAnnouncementSignups(guildId: string, monthKey: string): Promise<{ [day: string]: AnnouncementSignup }> {
    if (!guildId) {
        console.error("No guildId provided to getLogSignups");
        return {};
    }
    try {
        const db = getAdminDb();
        const logRef = db.collection(`communities/${guildId}/captainsLog`).doc(monthKey);
        const doc = await logRef.get();

        if (!doc.exists) {
            return {};
        }
        const data = doc.data();
        if (!data) return {};

        // Convert Timestamps to serializable strings
        const serializableData: { [day: string]: AnnouncementSignup } = {};
        for (const day in data) {
            if (Object.prototype.hasOwnProperty.call(data, day)) {
                const signup = data[day];
                if (signup && typeof signup === 'object' && signup.signedUpAt) {
                    serializableData[day] = {
                        ...signup,
                        signedUpAt: signup.signedUpAt instanceof Timestamp 
                            ? signup.signedUpAt.toDate().toISOString() 
                            : new Date().toISOString(), // Fallback
                    };
                }
            }
        }
        return serializableData;
        
    } catch (error) {
        console.error(`Error getting log signups for guild ${guildId}, month ${monthKey}:`, error);
        return {};
    }
}


/**
 * Signs a user up for a specific day in the announcement log.
 * Now correctly handles admins and community members.
 */
export async function signUpForAnnouncement(guildId: string, monthKey: string, dayKey: string, discordId: string, emoji?: string) {
    if (!guildId || !monthKey || !dayKey || !discordId) {
        return { success: false, error: "Missing required information for signup." };
    }
    try {
        const db = getAdminDb();
        
        // Try to get admin info first.
        let { value: profileData, error } = await getAdminInfo(discordId);
        
        // If not an admin, try to get community user info.
        if (!profileData) {
             ({ value: profileData, error } = await getUserInfoByDiscordId(guildId, discordId));
        }
       
        if (error || !profileData) {
            return { success: false, error: `Could not find your user profile information. Please ensure you have linked your Twitch account.` };
        }
        
        const displayName = profileData.twitchInfo?.displayName || profileData.discordInfo?.username;
        const avatar = profileData.twitchInfo?.avatar || profileData.discordInfo?.avatar;

        if (!displayName || !avatar) {
             return { success: false, error: "Your profile is incomplete. Please ensure you have linked your Twitch account." };
        }

        const logRef = db.collection(`communities/${guildId}/captainsLog`).doc(monthKey);
        
        const newSignup: Omit<AnnouncementSignup, 'signedUpAt'> & { signedUpAt: FieldValue } = {
            userId: discordId,
            userName: displayName,
            userAvatar: avatar,
            emoji: '🎙️', // Use a consistent, default emoji.
            signedUpAt: FieldValue.serverTimestamp()
        };

        const settings = await getSettings(guildId);
        
        const userRef = db.collection(`communities/${guildId}/users`).doc(discordId);
        const pointsAward = settings.captainLogPoints ?? 0;

        await db.runTransaction(async (transaction) => {
            const logDoc = await transaction.get(logRef);
            const currentSignups = logDoc.exists ? logDoc.data() as { [day: string]: AnnouncementSignup } : {};

            if (currentSignups[dayKey]) {
                throw new Error("This spot has already been claimed by another user.");
            }

            const userSignupCount = Object.values(currentSignups).filter(s => s.userId === discordId).length;
            if (userSignupCount >= 5) {
                throw new Error("You have already claimed the maximum of 5 available spots for this month.");
            }

            transaction.set(logRef, { [dayKey]: newSignup }, { merge: true });

            if (pointsAward > 0) {
                const userDataToMerge: Record<string, unknown> = {};
                if (profileData.discordInfo) {
                    userDataToMerge.discordInfo = profileData.discordInfo;
                }
                if (profileData.twitchInfo) {
                    userDataToMerge.twitchInfo = profileData.twitchInfo;
                }

                transaction.set(
                    userRef,
                    {
                        ...userDataToMerge,
                        points: FieldValue.increment(pointsAward),
                        lastPointsUpdateAt: FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                );
            }
        });

        const successMessage = pointsAward > 0
            ? `You have successfully claimed the spot and earned ${pointsAward} points!`
            : `You have successfully claimed the spot.`;

        return { success: true, message: successMessage };

    } catch (error) {
        console.error("Error signing up for log:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
    }
}

export async function claimAnnouncementSpotFromBot(guildId: string, dateString: string, discordUserId: string) {
    const targetDate = parseDateString(dateString);

    if (isNaN(targetDate.getTime())) {
        return { success: false, error: "Invalid date format. Please use a format like 'today', 'tomorrow', or 'July 26'."};
    }

    const monthKey = format(targetDate, 'yyyy-MM');
    const dayKey = format(targetDate, 'dd');
    
    // The emoji parameter is no longer needed.
    return signUpForAnnouncement(guildId, monthKey, dayKey, discordUserId);
}

/**
 * Gets the user scheduled for today's announcement.
 */
export async function getTodaysAnnouncer(guildId: string): Promise<TodaysAnnouncer | null> {
    if (!guildId) {
        return null;
    }
    try {
        const db = getAdminDb();
        const today = new Date();
        const monthKey = format(today, 'yyyy-MM');
        const dayKey = format(today, 'dd');
        
        const logRef = db.collection(`communities/${guildId}/captainsLog`).doc(monthKey);
        const doc = await logRef.get();

        if (!doc.exists) {
            return null;
        }
        
        const signups = doc.data() as { [day: string]: AnnouncementSignup };
        const todaysSignup = signups[dayKey];

        if (todaysSignup) {
            return { userName: todaysSignup.userName, emoji: todaysSignup.emoji };
        }

        return null;

    } catch (error) {
        console.error(`Error getting today's announcer for guild ${guildId}:`, error);
        return null;
    }
}


/**
 * Generates a larger, centered, text-based calendar string for Discord.
 */
function generateTextCalendar(
    date: Date, 
    signups: { [day: string]: AnnouncementSignup },
    events: CalendarEvent[]
): string {
    const year = date.getFullYear();
    const month = date.getMonth();
    const monthName = format(date, 'MMMM').toUpperCase();

    // Create sets for faster lookups
    const signupDays = new Set(Object.keys(signups));
    const eventDays = new Set(events
        .filter(event => new Date(event.date).getMonth() === month)
        .map(event => new Date(event.date).getDate().toString())
    );

    const header = `         ${monthName} ${year}         `;
    const weekDays = '   Sun     Mon     Tue     Wed     Thu     Fri     Sat   ';
    let calendarBody = '';

    const firstDayOfMonth = getDay(startOfMonth(date));
    const daysInMonth = getDaysInMonth(date);

    let currentDay = 1;
    for (let i = 0; i < 6; i++) { // Max 6 weeks
        let weekString = '';
        for (let j = 0; j < 7; j++) {
            if (i === 0 && j < firstDayOfMonth) {
                weekString += '        ';
            } else if (currentDay > daysInMonth) {
                weekString += '        ';
            } else {
                const dayKey = currentDay.toString();
                const hasSignup = signupDays.has(dayKey);
                const hasEvent = eventDays.has(dayKey);

                let dayStr = currentDay.toString().padStart(2, ' ');
                let indicator = ' ';
                if(hasSignup) indicator = '●'; // Filled circle for Captain's Log
                else if (hasEvent) indicator = '○'; // Empty circle for other events
                
                // Example format: [● 23] or [  23]
                weekString += `   ${indicator}${dayStr}  `;
                
                currentDay++;
            }
        }
        calendarBody += weekString + '\n';
        if (currentDay > daysInMonth) break;
    }

    return '```' + `${header}\n${weekDays}\n${calendarBody}` + '```';
}


/**
 * This is a new helper function that the bot will use to generate the embed.
 * It now uses a text-based calendar.
 */
export async function buildCalendarEmbed(guildId: string) {
    try {
        if (!guildId) {
            return null;
        }
        const today = new Date();
        const monthKey = format(today, 'yyyy-MM');
        const now = startOfDay(new Date());

        const [allEvents, announcer, signups] = await Promise.all([
            getCalendarEvents(guildId),
            getTodaysAnnouncer(guildId),
            getAnnouncementSignups(guildId, monthKey)
        ]);

        const upcomingEvents = allEvents
            .filter(event => parseISO(event.date) >= now)
            .sort((a,b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
            
        const upcomingSignups = Object.entries(signups)
            .map(([day, signup]) => {
                const date = parse(day, 'dd', new Date(today.getFullYear(), today.getMonth()));
                return {
                    ...signup,
                    date: date
                }
            })
            .filter(signup => signup.date >= now)
            .sort((a,b) => a.date.getTime() - b.date.getTime());

        // --- Crew Spotlight & Tip of the Day (Static for now) ---
        const crewSpotlight = "Big shoutout to @Moderator for always keeping the community safe and fun! ✨";
        const tipOfTheDay = "Did you know you can earn points by cheering bits in community member streams? See #rules for details!";

        // --- ASCII Art Boxes ---
        let scheduleDescription = "╔════════════ Upcoming Schedule ════════════╗\n";
        
        const combinedSchedule = [
            ...upcomingEvents.map(e => ({ item: e, date: parseISO(e.date), type: 'event' })),
            ...upcomingSignups.map(s => ({ item: s, date: s.date, type: 'signup' }))
        ].sort((a, b) => a.date.getTime() - b.date.getTime())
         .slice(0, 5); // Limit the combined list

        if (combinedSchedule.length > 0) {
            scheduleDescription += "║\n";
            scheduleDescription += combinedSchedule.map(entry => {
                if (entry.type === 'event') {
                    const item = entry.item as CalendarEvent;
                    return `║  ○ **${item.name}**\n║      └ ${format(entry.date, "MMM d")} at ${item.time}`;
                } else {
                    const item = entry.item as (AnnouncementSignup & { date: Date });
                    return `║  ● **Captain's Log: ${item.userName}**\n║      └ ${format(entry.date, "MMM d")}`;
                }
            }).join('\n║\n');
             scheduleDescription += "\n║";
        } else {
            scheduleDescription += "║      No upcoming events or signups.      \n";
        }
        scheduleDescription += "\n╚══════════════════════════════════════════╝";

        const spotlightBox = `╔═══════════ Crew Spotlight ════════════╗\n║  ${crewSpotlight} \n╚═════════════════════════════════════════╝`;
        
        const calendarText = generateTextCalendar(today, signups, allEvents);
        
        let announcerText = "No one has claimed the Captain's Log for today! Use the button to sign up.";
        if (announcer) {
            announcerText = `Today's Captain's Log: 🎙️ by **${announcer.userName}**`;
        }
        
        const description = [
            spotlightBox,
            calendarText,
            announcerText,
            scheduleDescription,
        ].join('\n\n');

        const embedData = {
            title: '📅   C O M M U N I T Y   C A L E N D A R   📅',
            description: description,
            color: 0x5865F2, // Discord Blurple
            footer: {
                text: '● Captain\'s Log ○ Community Event',
            },
            timestamp: new Date().toISOString(),
        };

        const components = await createCalendarButtons(guildId);

        return {
            embeds: [embedData],
            components: components,
        };

    } catch(e) {
        console.error("Error building calendar embed:", e);
        return null;
    }
}


/**
 * Stores the message ID of the posted calendar embed for future updates.
 */
export async function setCalendarControlMessage(guildId: string, channelId: string, messageId: string) {
    if (!guildId || !channelId || !messageId) {
        return { success: false, error: "Missing required IDs." };
    }
    try {
        const db = getAdminDb();
        const settingsRef = db.collection('communities').doc(guildId).collection('settings').doc('calendarControl');
        await settingsRef.set({ channelId, messageId }, { merge: true });
        return { success: true };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return { success: false, error: errorMessage };
    }
}


// This helper needs to be here because buildCalendarEmbed uses it.
export async function createCalendarButtons(guildId: string) {
    const components = [
        {
            type: 2, // Button
            style: 1, // Primary for the main action
            label: "Add Community Event",
            custom_id: `calendar_add_${guildId}`
        },
        {
            type: 2, // Button
            style: 2, // Secondary for the other action
            label: "Claim Captain's Log",
            custom_id: `calendar_claim_${guildId}`
        }
    ];

    return [
        {
            type: 1, // Action Row
            components: components
        }
    ];
}




    

    