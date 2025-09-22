

// src/app/actions.ts
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, FieldPath } from 'firebase-admin/firestore';
import type { LiveUser } from './raid-pile/types';
import { getSettings } from './settings/actions';
import { getTwitchUserByUsername, getTwitchStreams, getTwitchClips } from '@/bot/twitch-actions';


// --- USER-FOCUSED ACTIONS ---

/**
 * Saves or updates information for a specific user (community member) using their Discord ID as the primary key.
 * This will create/update a document at `communities/{guildId}/users/{discordId}`.
 */
export async function saveUserInfoByDiscordId(guildId: string, discordId: string, data: any) {
  if (!guildId || !discordId) {
    console.error("Error saving user info: guildId and discordId are required.");
    return { success: false, error: "Community ID and Discord User ID are required." };
  }
  try {
    const adminDb = getAdminDb();
    const userRef = adminDb.collection('communities').doc(guildId).collection('users').doc(discordId);
    await userRef.set(data, { merge: true });
    console.log(`User info saved for user ${discordId} in guild ${guildId}`);
    return { success: true };
  } catch (e) {
    console.error(`Error saving user info for user ${discordId} in guild ${guildId}: `, e);
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, error: errorMessage };
  }
}

/**
 * Retrieves all information for a specific user (community member) using their Discord ID.
 */
export async function getUserInfoByDiscordId(guildId: string, discordId: string): Promise<{ value: any | null, error?: string }> {
    if (!guildId || !discordId) {
        return { value: null, error: "Community ID and Discord User ID are required." };
    }
    try {
        const adminDb = getAdminDb();
        const docRef = adminDb.collection('communities').doc(guildId).collection('users').doc(discordId);
        const doc = await docRef.get();

        if (!doc.exists) {
            console.log(`User document does not exist at path: ${docRef.path}`);
            return { value: null }; 
        }
        
        return { value: doc.data() || null };

    } catch (e) {
        console.error(`Error getting user info for discordId ${discordId} in guild ${guildId}: `, e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return { value: null, error: errorMessage };
    }
}


// --- ADMIN-FOCUSED ACTIONS ---

/**
 * Saves or updates information for an ADMIN using their Discord ID as the primary key.
 * This will create/update a document at the global `admins/{discordId}` path.
 */
export async function saveAdminInfo(discordId: string, data: any) {
  if (!discordId) {
    return { success: false, error: "Discord ID is required." };
  }
  try {
    const adminDb = getAdminDb();
    const adminRef = adminDb.collection('admins').doc(discordId);
    await adminRef.set(data, { merge: true });
    return { success: true };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, error: errorMessage };
  }
}

/**
 * Retrieves all information for a specific ADMIN using their Discord ID.
 */
export async function getAdminInfo(discordId: string): Promise<{ value: any | null, error?: string }> {
  if (!discordId) {
    return { value: null, error: "Discord ID is required." };
  }
  try {
    const adminDb = getAdminDb();
    const docRef = adminDb.collection('admins').doc(discordId);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.log(`Admin document does not exist at path: ${docRef.path}`);
      return { value: null };
    }

    return { value: doc.data() || null };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`Error getting admin info for discordId ${discordId}:`, errorMessage);
    return { value: null, error: errorMessage };
  }
}

/**
 * Retrieves the currently selected guild for the admin from their global admin document.
 */
export async function getSelectedGuildId(adminDiscordId: string): Promise<string | null> {
    if (!adminDiscordId) return null;
    try {
        const { value, error } = await getAdminInfo(adminDiscordId);
        if (error) {
            console.error("Error getting selected guild ID:", error);
            return null;
        }
        return value?.selectedGuild || null;
    } catch (error) {
        console.error("Error in getSelectedGuildId:", error);
        return null;
    }
}


// --- TWITCH-RELATED ACTIONS ---
// Note: The core Twitch API functions have been moved to src/bot/twitch-actions.ts
// to ensure they can be used by both the bot and the web app without bundling issues.
export { getTwitchUserByUsername, getTwitchStreams, getTwitchClips };


/**
 * Saves a user's Twitch info to the specific `communities/{guildId}/users` collection.
 * This is used during the initial setup flow triggered by the bot.
 */
export async function saveUserTwitchInfo(guildId: string, discordId: string, discordUsername: string, discordAvatar: string | null, twitchUsername: string) {
    if (!guildId || !discordId || !twitchUsername) {
        return { success: false, error: "Community ID, Discord ID, and Twitch Username are required." };
    }
    
    try {
        const db = getAdminDb();
        const twitchUser = await getTwitchUserByUsername(twitchUsername);

        if (!twitchUser) {
            return { success: false, error: `Could not find a Twitch user with the username "${twitchUsername}". Please check the spelling.` };
        }

        const userData = {
            discordInfo: {
                id: discordId,
                username: discordUsername,
                avatar: discordAvatar,
            },
            twitchInfo: {
                id: twitchUser.id,
                displayName: twitchUser.display_name,
                avatar: twitchUser.profile_image_url,
                login: twitchUser.login,
            },
        };

        const userRef = db.collection('communities').doc(guildId).collection('users').doc(discordId);
        await userRef.set(userData, { merge: true });

        return { success: true };

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return { success: false, error: errorMessage };
    }
}

/**
 * Saves the ADMIN's Twitch info to their global admin profile.
 */
export async function saveAdminTwitchInfo(adminDiscordId: string, twitchUsername: string) {
    if (!adminDiscordId || !twitchUsername) {
        return { success: false, error: "Admin Discord ID and Twitch Username are required." };
    }

    try {
        const twitchUser = await getTwitchUserByUsername(twitchUsername);
        if (!twitchUser) {
            return { success: false, error: `Could not find a Twitch user with the username "${twitchUsername}". Please check the spelling.` };
        }

        const adminTwitchData = {
            twitchInfo: {
                id: twitchUser.id,
                displayName: twitchUser.display_name,
                avatar: twitchUser.profile_image_url,
                login: twitchUser.login,
            },
        };

        return await saveAdminInfo(adminDiscordId, adminTwitchData);
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return { success: false, error: errorMessage };
    }
}


// This is a placeholder for a more advanced function that would get live status from Twitch
export async function getLiveUsersFromTwitch(userIds: string[]): Promise<{ [key: string]: Pick<LiveUser, 'latestGameName' | 'latestViewerCount' | 'latestStreamTitle' | 'started_at'> }> {
    if (userIds.length === 0) return {};
    
    const streams = await getTwitchStreams(userIds);

    const liveData: { [key: string]: Pick<LiveUser, 'latestGameName' | 'latestViewerCount' | 'latestStreamTitle' | 'started_at'> } = {};

    streams.forEach(stream => {
        liveData[stream.user_id] = {
            latestGameName: stream.game_name,
            latestViewerCount: stream.viewer_count,
            latestStreamTitle: stream.title,
            started_at: stream.started_at,
        };
    });

    return liveData;
}


export async function getUsersFromDb(guildId: string, userIds: string[]): Promise<LiveUser[]> {
    if (userIds.length === 0) return [];
    const db = getAdminDb();
    const usersCollection = db.collection(`communities/${guildId}/users`);
    
    // Firestore 'in' queries are limited to 30 elements. We might need to chunk this.
    // For now, assuming userIds length is within limits.
    const userDocs = await usersCollection.where('twitchInfo.id', 'in', userIds).get();
    
    return userDocs.docs.map(doc => {
        const data = doc.data();
        // Fallback to discordInfo if twitchInfo is partial
        const twitchInfo = data.twitchInfo || {};
        const discordInfo = data.discordInfo || {};
        return {
            twitchId: twitchInfo.id,
            twitchLogin: twitchInfo.login || discordInfo.username,
            displayName: twitchInfo.displayName || discordInfo.username,
            avatarUrl: twitchInfo.avatar || discordInfo.avatar,
            latestGameName: '', // This will be filled by Twitch data
            latestViewerCount: 0, // This will be filled by Twitch data
            vipMessage: data.vipMessage || undefined,
            points: data.points || 0,
        }
    });
}

export async function getLiveRaidPiles(guildId: string) {
    if (!guildId) {
        console.error("No guildId provided to getLiveRaidPiles");
        return [];
    }
    try {
        const db = getAdminDb();
        const usersSnapshot = await db.collection(`communities/${guildId}/users`).where("inPile", "==", true).get();
        
        if (usersSnapshot.empty) {
            return [];
        }
        
        const userIds = usersSnapshot.docs.map(doc => doc.data().twitchInfo.id).filter(Boolean);
        
        const [dbUsers, liveTwitchData] = await Promise.all([
             getUsersFromDb(guildId, userIds),
             getLiveUsersFromTwitch(userIds)
        ]);

        const liveUsers = dbUsers.map(user => {
            const twitchData = liveTwitchData[user.twitchId];
            return twitchData ? { ...user, ...twitchData } : null;
        }).filter((u): u is LiveUser => u !== null)
         .sort((a, b) => new Date(a.started_at as string).getTime() - new Date(b.started_at as string).getTime());
        
        const pile = {
            holder: liveUsers.length > 0 ? liveUsers[0] : null,
            liveUsers: liveUsers,
            totalViewers: liveUsers.reduce((sum, user) => sum + user.latestViewerCount, 0),
        };

        return [pile];
    } catch (error) {
        console.error(`Error getting live raid piles for guild ${guildId}:`, error);
        return [];
    }
}

export async function getLiveCommunityPoolUsers(guildId: string): Promise<LiveUser[]> {
     if (!guildId) {
        console.error("No guildId provided to getLiveCommunityPoolUsers");
        return [];
    }
    try {
        const db = getAdminDb();
        const usersSnapshot = await db.collection(`communities/${guildId}/users`).where("inCommunityPool", "==", true).get();

        if (usersSnapshot.empty) {
            return [];
        }

        const userIds = usersSnapshot.docs.map(doc => doc.data().twitchInfo.id).filter(Boolean);
        const [dbUsers, liveTwitchData] = await Promise.all([
             getUsersFromDb(guildId, userIds),
             getLiveUsersFromTwitch(userIds)
        ]);

        const liveUsers = dbUsers.map(user => {
            const twitchData = liveTwitchData[user.twitchId];
            return twitchData ? { ...user, ...twitchData } : null;
        }).filter((u): u is LiveUser => u !== null);

        return liveUsers;

    } catch (error) {
        console.error(`Error getting live community pool users for guild ${guildId}:`, error);
        return [];
    }
}

export async function getLiveVipUsers(guildId: string): Promise<LiveUser[]> {
    if (!guildId) {
       console.error("No guildId provided to getLiveVipUsers");
       return [];
   }
   try {
        const db = getAdminDb();
        const usersSnapshot = await db.collection(`communities/${guildId}/users`).where("isVip", "==", true).get();

        if (usersSnapshot.empty) {
           return [];
        }

        const userIds = usersSnapshot.docs.map(doc => doc.data().twitchInfo?.id).filter(Boolean);

        if (userIds.length === 0) return [];
        
        const [dbUsers, liveTwitchData] = await Promise.all([
             getUsersFromDb(guildId, userIds),
             getLiveUsersFromTwitch(userIds)
        ]);

        const liveUsers = dbUsers.map(user => {
            const twitchData = liveTwitchData[user.twitchId];
            return twitchData ? { ...user, ...twitchData } : null;
        }).filter((u): u is LiveUser => u !== null);
       
       return liveUsers;

   } catch (error) {
       console.error(`Error getting live VIP users for guild ${guildId}:`, error);
       return [];
   }
}


export async function joinPile(guildId: string, discordId: string) {
  if (!guildId) return { success: false, error: "Community ID is missing." };
  if (!discordId) return { success: false, error: "User info is missing." };
  try {
    const db = getAdminDb();
    const userRef = db.collection(`communities/${guildId}/users`).doc(discordId);

    await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        
        if (!userDoc.exists || !userDoc.data()?.twitchInfo) {
            throw new Error("User has not linked their Twitch account yet.");
        }

        transaction.set(userRef, { inPile: true }, { merge: true });
    });

    return { success: true };

  } catch (error) {
    console.error("Error joining pile:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

export async function joinCommunityPool(guildId: string, discordId: string) {
  if (!guildId) return { success: false, error: "Community ID is missing." };
  if (!discordId) return { success: false, error: "User info is missing." };
  try {
    const db = getAdminDb();
    const userRef = db.collection(`communities/${guildId}/users`).doc(discordId);

     await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists || !userDoc.data()?.twitchInfo) {
            throw new Error("User has not linked their Twitch account yet.");
        }
        transaction.set(userRef, { inCommunityPool: true }, { merge: true });
     });

    return { success: true };
  } catch (error) {
    console.error("Error joining community pool:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}


export async function leavePile(guildId: string, userId: string) {
    if (!guildId) return { success: false, error: "Community ID is missing." };
    if (!userId) return { success: false, error: "User ID is missing." };
    try {
        const db = getAdminDb();
        const userRef = db.collection(`communities/${guildId}/users`).doc(userId);
        
        await userRef.update({ inPile: false });

        return { success: true };
    } catch (error) {
        console.error("Error leaving pile:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
    }
}

export async function addVip(guildId: string, twitchUsername: string, vipMessage: string) {
    if (!guildId || !twitchUsername) {
        return { success: false, error: "Community ID and Twitch Username are required." };
    }
    try {
        const db = getAdminDb();
        const twitchUser = await getTwitchUserByUsername(twitchUsername);

        if (!twitchUser) {
            return { success: false, error: `Could not find a Twitch user with the username "${twitchUsername}".` };
        }

        // We need to find the user's Discord ID to correctly update their document.
        // This assumes the user has already interacted with the bot and has an entry.
        const userQuery = await db.collection(`communities/${guildId}/users`).where('twitchInfo.id', '==', twitchUser.id).limit(1).get();
        
        let userRef;
        if (userQuery.empty) {
            // If the user doesn't exist, we can't make them a VIP through this flow yet.
            // A more robust implementation might create a shell user document here.
            return { success: false, error: "Cannot make a user a VIP until they have linked their account via the bot." };
        } else {
            userRef = userQuery.docs[0].ref;
        }

        await userRef.set({
            isVip: true,
            vipMessage: vipMessage,
            vipAddedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        return { success: true, message: `${twitchUser.display_name} has been added as a VIP.` };

    } catch (error) {
        console.error("Error adding VIP:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
    }
}

export async function createAndAddVip(guildId: string, discordId: string, twitchUsername: string, vipMessage: string) {
    if (!guildId || !discordId || !twitchUsername) {
        return { success: false, error: "Community ID, Discord ID, and Twitch Username are required." };
    }
    try {
        const db = getAdminDb();
        const twitchUser = await getTwitchUserByUsername(twitchUsername);

        if (!twitchUser) {
            return { success: false, error: `Could not find a Twitch user with the username "${twitchUsername}".` };
        }

        const userRef = db.collection('communities').doc(guildId).collection('users').doc(discordId);
        
        const userData = {
            discordInfo: {
                id: discordId,
                username: `user_${discordId.substring(0, 5)}`, // Placeholder
                avatar: null,
            },
            twitchInfo: {
                id: twitchUser.id,
                displayName: twitchUser.display_name,
                avatar: twitchUser.profile_image_url,
                login: twitchUser.login,
            },
            isVip: true,
            vipMessage: vipMessage,
            vipAddedAt: FieldValue.serverTimestamp(),
        };

        await userRef.set(userData, { merge: true });

        return { success: true, message: `${twitchUser.display_name} has been created and added as a VIP.` };

    } catch (error) {
        console.error("Error creating and adding VIP:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
    }
}

export async function removeVip(guildId: string, discordId: string) {
    if (!guildId || !discordId) {
        return { success: false, error: "Community ID and Discord ID are required." };
    }
    try {
        const db = getAdminDb();
        const userRef = db.collection(`communities/${guildId}/users`).doc(discordId);

        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            return { success: false, error: "User not found." };
        }

        await userRef.update({
            isVip: false,
            vipMessage: FieldValue.delete(),
            vipAddedAt: FieldValue.delete(),
        });

        const displayName = userDoc.data()?.twitchInfo?.displayName || 'The user';
        return { success: true, message: `${displayName} is no longer a VIP.` };

    } catch (error) {
        console.error("Error removing VIP:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
    }
}

/**
 * Updates a VIP's information, such as their custom message.
 */
export async function updateVip(guildId: string, discordId: string, vipMessage: string) {
    if (!guildId || !discordId) {
        return { success: false, error: "Community ID and Discord ID are required." };
    }
    try {
        const db = getAdminDb();
        const userRef = db.collection(`communities/${guildId}/users`).doc(discordId);
        
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            return { success: false, error: "VIP user not found." };
        }

        await userRef.update({ vipMessage: vipMessage });

        const displayName = userDoc.data()?.twitchInfo?.displayName || 'The user';
        return { success: true, message: `VIP message for ${displayName} has been updated.` };
    } catch (error) {
        console.error("Error updating VIP:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
    }
}


/**
 * Adds a specified number of points to the admin's user document for the given community.
 * This is intended as a testing/debugging tool.
 */
export async function addPointsToAdmin(guildId: string, adminDiscordId: string, pointsToAdd: number) {
  if (!guildId || !adminDiscordId) {
    return { success: false, error: "Community ID and Admin ID are required." };
  }
  try {
    const db = getAdminDb();
    // The admin's community-specific user data is in the `users` collection for that guild, keyed by their discord ID.
    const userRef = db.collection('communities').doc(guildId).collection('users').doc(adminDiscordId);
    
    const userDoc = await userRef.get();
    
    // An admin might not have a `users` document if they haven't linked their Twitch account via the bot flow yet.
    // We can create a shell document for them to add points to.
    if (!userDoc.exists) {
        const { value: adminInfo } = await getAdminInfo(adminDiscordId);
        if (adminInfo) {
             await userRef.set({
                discordInfo: adminInfo.discordInfo,
                points: pointsToAdd
             }, { merge: true });
        } else {
            throw new Error("Could not find global admin profile to create user document.");
        }
    } else {
        await userRef.update({
            points: FieldValue.increment(pointsToAdd)
        });
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error adding points to admin:", error);
    return { success: false, error: errorMessage };
  }
}
