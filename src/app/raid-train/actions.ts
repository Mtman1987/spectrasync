
// src/app/raid-train/actions.ts
"use server";

import { getAdminDb } from "@/lib/firebase-admin";
import type { LiveUser } from "../raid-pile/types";
import { format, addDays, getHours, parse, startOfDay } from "date-fns";
import { getLiveUsersFromTwitch, getUsersFromDb, getTwitchUserByUsername } from "../actions";
import { FieldValue, Timestamp, FieldPath } from "firebase-admin/firestore";
import { getSettings } from "../settings/actions";
import { getCalendarEvents, getTodaysAnnouncer } from "../calendar/actions";

type TwitchUser = {
    id: string;
    login: string;
    displayName: string;
    avatar: string;
}

export type Signup = { id: string; name: string, avatar: string, game: string, signedUpAt?: string };
export type EmergencySignup = { id: 'emergency'; name: 'Emergency Fill', avatar: string, game: string };
export type BlockedSignup = { id: 'blocked'; name: 'Blocked', avatar: string; game: 'Slot unavailable' };


function parseDateString(dateString: string): Date {
    if (dateString.toLowerCase() === 'tomorrow') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
    }
    if (dateString.toLowerCase() === 'today') {
        return new Date();
    }
    // Try parsing formats like 'July 30' or '2024-07-30'
    const parsedDate = new Date(dateString);
    if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
    }
    return new Date(); // Fallback
}


/**
 * Fetches the raid train schedule for a specific date from Firestore.
 */
export async function getRaidTrainSchedule(guildId: string, dateKey: string): Promise<{ [key: string]: Signup | EmergencySignup }> {
    if (!guildId) {
        console.error("No guildId provided to getRaidTrainSchedule");
        return {};
    }
    try {
        const db = getAdminDb();
        const scheduleRef = db.collection(`communities/${guildId}/raidTrain`).doc(dateKey);
        const doc = await scheduleRef.get();

        if (!doc.exists) {
            return {};
        }
        
        const data = doc.data();
        if (!data) return {};

        const serializableData: { [key: string]: Signup | EmergencySignup } = {};
        for (const key in data) {
            const signup = data[key];
            serializableData[key] = {
                ...signup,
                signedUpAt: signup.signedUpAt instanceof Timestamp 
                    ? signup.signedUpAt.toDate().toISOString() 
                    : undefined,
            };
        }
        return serializableData;

    } catch (error) {
        console.error(`Error getting raid train schedule for guild ${guildId}, date ${dateKey}:`, error);
        return {};
    }
}

/**
 * Signs a user up for a specific raid train slot in Firestore.
 */
export async function signUpForRaidTrain(guildId: string, dateString: string, timeSlot: string, twitchUsername: string) {
    if (!guildId || !dateString || !timeSlot || !twitchUsername) {
        return { success: false, error: "Missing required information for signup." };
    }
    try {
        const db = getAdminDb();
        
        const targetDate = parseDateString(dateString);
        if (isNaN(targetDate.getTime())) {
            return { success: false, error: "Invalid date format. Please use 'today', 'tomorrow', or 'July 30'." };
        }
        const dateKey = format(targetDate, 'yyyy-MM-dd');

        const parsedTime = parse(timeSlot, 'HH:mm', new Date());
        if (isNaN(parsedTime.getTime())) {
            return { success: false, error: "Invalid time format. Please use 24-hour format like '14:00'." };
        }
        const formattedTimeSlot = format(parsedTime, 'HH:00');


        const twitchUser = await getTwitchUserByUsername(twitchUsername);
        if (!twitchUser) {
            return { success: false, error: `Could not find a Twitch user named "${twitchUsername}".` };
        }
        const user: TwitchUser = { id: twitchUser.id, login: twitchUser.login, displayName: twitchUser.display_name, avatar: twitchUser.profile_image_url };
        
        const scheduleRef = db.collection(`communities/${guildId}/raidTrain`).doc(dateKey);
        const userQuery = await db.collection(`communities/${guildId}/users`).where('twitchInfo.id', '==', user.id).limit(1).get();
        if (userQuery.empty) {
            return { success: false, error: "User profile not found." };
        }
        const userRef = userQuery.docs[0].ref;

        const settings = await getSettings(guildId);
        const pointsAward = settings.raidTrainPoints || 25;

        const newSignup: Omit<Signup, 'signedUpAt'> & { signedUpAt: FieldValue } = {
            id: user.id, name: user.displayName, avatar: user.avatar, game: 'TBD', signedUpAt: FieldValue.serverTimestamp()
        };

        let claimedEmergencySlot = false;

        await db.runTransaction(async (transaction) => {
            const scheduleDoc = await transaction.get(scheduleRef);
            const userDoc = await transaction.get(userRef);
            const currentSignupsOnDate = scheduleDoc.exists ? scheduleDoc.data()! : {};
            const userData = userDoc.exists ? userDoc.data()! : {};

            const slotToClaim = currentSignupsOnDate[formattedTimeSlot];
            const isEmergencySlot = slotToClaim && slotToClaim.id === 'emergency';
            claimedEmergencySlot = Boolean(isEmergencySlot);
            
            // Determine requirement type (points or attendance)
            const requirementValue = settings.useAttendanceForRaidTrain ? (userData.raidAttendance || 0) : (userData.points || 0);
            const requirementType = settings.useAttendanceForRaidTrain ? 'attendance' : 'points';
            
            let requirementAmount = settings.raidTrainRequiredPoints;
            let emergencyRequirementAmount = settings.raidTrainEmergencyRequiredPoints;

            if (isEmergencySlot) {
                if (requirementValue < emergencyRequirementAmount) {
                    throw new Error(`You need ${emergencyRequirementAmount} ${requirementType} to claim an emergency slot. You have ${requirementValue}.`);
                }
            } else {
                if (requirementValue < requirementAmount) {
                    throw new Error(`You need ${requirementAmount} ${requirementType} to sign up. You have ${requirementValue}.`);
                }
            }
            
            if (slotToClaim && !isEmergencySlot) {
                throw new Error("This slot has already been claimed.");
            }

            const userSlotsToday = Object.values(currentSignupsOnDate).filter((s: any) => s.id === user.id).length;

            let maxSlotsPerDay = settings.raidTrainBaseSlots;
            const bonusRequirementValue = settings.useAttendanceForRaidTrain ? (userData.raidAttendance || 0) : (userData.points || 0);

            if (bonusRequirementValue >= settings.raidTrainBonusSlotsRequiredPoints) {
                maxSlotsPerDay += settings.raidTrainBonusSlots;
            }

            if (!isEmergencySlot) {
                if (userSlotsToday >= maxSlotsPerDay) {
                    throw new Error(`You have reached your daily limit of ${maxSlotsPerDay} slots.`);
                }
            } else { 
                if (userSlotsToday > 0 && !settings.raidTrainAllowEmergencyWithSlot) {
                    throw new Error("You already have a slot today and this community does not allow claiming emergency slots in that case.");
                }
            }

            transaction.set(scheduleRef, { [formattedTimeSlot]: newSignup }, { merge: true });
            
            if (!isEmergencySlot && !settings.useAttendanceForRaidTrain) {
                 transaction.set(
                    userRef,
                    {
                        points: FieldValue.increment(pointsAward),
                        lastPointsUpdateAt: FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                );
            }
        });

        const message = claimedEmergencySlot
            ? "You've filled the emergency slot!"
            : (!settings.useAttendanceForRaidTrain ? `You earned ${pointsAward} points!` : 'Signup successful!');
        return { success: true, message: message };
    } catch (error) {
        console.error("Error signing up for raid train:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
    }
}

/**
 * Marks a user's spot as available for emergency fill.
 */
export async function giveAwayRaidTrainSpot(guildId: string, dateKey: string, timeSlot: string) {
    if (!guildId || !dateKey || !timeSlot) {
        return { success: false, error: "Missing required information." };
    }
    try {
        const db = getAdminDb();
        const scheduleRef = db.collection(`communities/${guildId}/raidTrain`).doc(dateKey);
        
        const emergencySignup: EmergencySignup = {
            id: 'emergency', name: 'Emergency Fill', avatar: '', game: 'Needs Filling!'
        };

        await scheduleRef.set({ [timeSlot]: emergencySignup }, { merge: true });

        return { success: true };

    } catch (error) {
        console.error("Error giving away raid train spot:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
    }
}



export type RaidTrainEmergency = {
    date: string;
    time: string;
    fullDate: Date;
};

/**
 * Fetches any raid train slots marked as 'emergency' for the next 7 days.
 */
export async function getRaidTrainEmergencies(guildId: string): Promise<RaidTrainEmergency[]> {
    if (!guildId) {
        console.error("No guildId provided to getRaidTrainEmergencies");
        return [];
    }
    try {
        const db = getAdminDb();
        const scheduleCollection = db.collection(`communities/${guildId}/raidTrain`);
        const emergencies: RaidTrainEmergency[] = [];
        const today = new Date();

        for (let i = 0; i < 7; i++) {
            const dateToCheck = addDays(today, i);
            const dateKey = format(dateToCheck, 'yyyy-MM-dd');
            const doc = await scheduleCollection.doc(dateKey).get();

            if (doc.exists) {
                const data = doc.data();
                if (data) {
                    for (const time in data) {
                        if (data[time].id === 'emergency') {
                            emergencies.push({
                                date: format(dateToCheck, 'MMM d'),
                                time: time,
                                fullDate: dateToCheck,
                            });
                        }
                    }
                }
            }
        }
        
        emergencies.sort((a, b) => a.fullDate.getTime() - b.fullDate.getTime());
        
        return emergencies;

    } catch (error) {
        console.error(`Error getting raid train emergencies for guild ${guildId}:`, error);
        return [];
    }
}

export type RaidTrainNoShow = {
    name: string;
    time: string;
};

/**
 * Checks the current raid train schedule for a no-show.
 */
export async function getRaidTrainNoShows(guildId: string): Promise<RaidTrainNoShow[]> {
    if (!guildId) return [];

    try {
        const today = new Date();
        const dateKey = format(today, 'yyyy-MM-dd');
        const currentHour = getHours(today);
        const currentTimeSlot = `${currentHour.toString().padStart(2, '0')}:00`;

        const schedule = await getRaidTrainSchedule(guildId, dateKey);
        const currentSignup = schedule[currentTimeSlot];

        if (!currentSignup || currentSignup.id === 'emergency') {
            return [];
        }

        const liveUsers = await getLiveRaidTrainUsers(guildId, dateKey);
        const liveUserIds = new Set(liveUsers.map(u => u.twitchId));

        if (!liveUserIds.has(currentSignup.id)) {
            return [{
                name: currentSignup.name,
                time: currentTimeSlot
            }];
        }

        return [];
    } catch (error) {
        console.error(`Error checking for raid train no-shows for guild ${guildId}:`, error);
        return [];
    }
}


export async function getLiveRaidTrainUsers(guildId: string, dateKey: string): Promise<LiveUser[]> {
    if (!guildId) {
        return [];
    }
    try {
        const schedule = await getRaidTrainSchedule(guildId, dateKey);
        const userIdsInSchedule = Object.values(schedule)
            .map(s => s.id)
            .filter(id => id !== 'emergency' && id !== 'blocked');
        
        if (userIdsInSchedule.length === 0) {
            return [];
        }
        
        const [dbUsers, liveTwitchData] = await Promise.all([
             getUsersFromDb(guildId, userIdsInSchedule),
             getLiveUsersFromTwitch(userIdsInSchedule)
        ]);

        const liveUsers = dbUsers.map(user => {
            const twitchData = liveTwitchData[user.twitchId];
            return twitchData ? { ...user, ...twitchData } : null;
        }).filter((u): u is LiveUser => u !== null);

        return liveUsers;

    } catch (error) {
        console.error(`Error getting live raid train users for guild ${guildId}:`, error);
        return [];
    }
}

export async function getCurrentRaidTrainConductorId(guildId: string, referenceDate: Date = new Date()): Promise<string | null> {
    if (!guildId) {
        return null;
    }

    try {
        const dateKey = format(referenceDate, 'yyyy-MM-dd');
        const schedule = await getRaidTrainSchedule(guildId, dateKey);
        const currentHour = getHours(referenceDate);
        const currentSlot = `${currentHour.toString().padStart(2, '0')}:00`;
        const currentSignup = schedule[currentSlot];

        if (!currentSignup || currentSignup.id === 'emergency' || currentSignup.id === 'blocked') {
            return null;
        }

        return currentSignup.id;
    } catch (error) {
        console.error(`Error getting current raid train conductor for guild ${guildId}:`, error);
        return null;
    }
}

/**
 * Finds the slot a user is signed up for on a given day.
 */
export async function findUserRaidTrainSlot(guildId: string, dateKey: string, userId: string): Promise<string | null> {
    if (!guildId || !dateKey || !userId) return null;
    
    try {
        const schedule = await getRaidTrainSchedule(guildId, dateKey);
        for (const time in schedule) {
            if (schedule[time].id === userId) {
                return time;
            }
        }
        return null;
    } catch (error) {
        console.error("Error finding user raid train slot:", error);
        return null;
    }
}

export async function manualOverrideSlot(
    guildId: string, 
    dateKey: string, 
    timeSlot: string, 
    action: 'assign' | 'block' | 'clear', 
    twitchUsername?: string
) {
    if (!guildId || !dateKey || !timeSlot) {
        return { success: false, error: "Missing required information." };
    }
    try {
        const db = getAdminDb();
        const scheduleRef = db.collection(`communities/${guildId}/raidTrain`).doc(dateKey);

        if (action === 'clear') {
            await scheduleRef.set({ [timeSlot]: FieldValue.delete() }, { merge: true });
            return { success: true, message: `Slot ${timeSlot} cleared.` };
        }
        
        if (action === 'block') {
            const blockedSignup: BlockedSignup = { id: 'blocked', name: 'Blocked', avatar: '', game: 'Slot unavailable' };
            await scheduleRef.set({ [timeSlot]: blockedSignup }, { merge: true });
            return { success: true, message: `Slot ${timeSlot} blocked.` };
        }

        if (action === 'assign') {
            if (!twitchUsername) {
                return { success: false, error: "Twitch username is required to assign a slot." };
            }
            const twitchUser = await getTwitchUserByUsername(twitchUsername);
            if (!twitchUser) {
                return { success: false, error: `Could not find Twitch user "${twitchUsername}".` };
            }

            const newSignup: Signup = {
                id: twitchUser.id,
                name: twitchUser.display_name,
                avatar: twitchUser.profile_image_url,
                game: 'TBD', // This will be updated when they go live
            };

            await scheduleRef.set({ [timeSlot]: newSignup }, { merge: true });
            return { success: true, message: `${twitchUser.display_name} assigned to ${timeSlot}.` };
        }

        return { success: false, error: "Invalid action." };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
    }
}
