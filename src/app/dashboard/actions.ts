
// src/app/dashboard/actions.ts
"use server";

import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { format } from "date-fns";

export type ActivityEvent = {
    id: string;
    user: {
        name: string;
        avatar: string;
    };
    action: string;
    target?: string;
    timestamp: number; // Changed to number for serialization
};

// Helper to safely get a sub-collection
async function getCollection(guildId: string, collectionName: string) {
    if (!guildId) return null;
    const db = getAdminDb();
    return db.collection(`communities/${guildId}/${collectionName}`);
}

// Helper to convert Timestamp to number
function serializeTimestamp(timestamp: any): number {
    if (timestamp instanceof Timestamp) {
        return timestamp.toMillis();
    }
    if (timestamp instanceof Date) {
        return timestamp.getTime();
    }
    // Fallback for already serialized or other types
    return new Date().getTime();
}


export async function getActivityFeed(guildId: string): Promise<ActivityEvent[]> {
    if (!guildId) {
        console.error("No guildId provided for activity feed");
        return [];
    }
    
    let allActivities: ActivityEvent[] = [];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    try {
        const db = getAdminDb();
        // 1. Get recent Raid Pile joins and VIP additions from the users collection
        const usersCollection = await getCollection(guildId, 'users');
        if (usersCollection) {
            // Pile Joins
            const pileJoinsSnapshot = await usersCollection
                .orderBy('lastJoinedPile', 'desc')
                .limit(20)
                .get();
                
            pileJoinsSnapshot.forEach(doc => {
                const data = doc.data();
                 if (data.lastJoinedPile && data.lastJoinedPile.toDate() >= sevenDaysAgo) {
                    allActivities.push({
                        id: doc.id + '-pilejoin',
                        user: { name: data.displayName, avatar: data.avatarUrl },
                        action: "joined the raid pile.",
                        timestamp: serializeTimestamp(data.lastJoinedPile)
                    });
                }
            });

             // VIP Additions
            const vipsSnapshot = await usersCollection
                .orderBy('vipAddedAt', 'desc')
                .limit(10)
                .get();
            
            vipsSnapshot.forEach(doc => {
                const data = doc.data();
                 if (data.vipAddedAt && data.vipAddedAt.toDate() >= sevenDaysAgo) {
                    allActivities.push({
                        id: doc.id + '-vipadd',
                        user: { name: "Admin", avatar: "" }, // Placeholder name
                        action: `added ${data.displayName} as a new VIP.`,
                        timestamp: serializeTimestamp(data.vipAddedAt)
                    });
                }
            });
        }


        // 2. Get recent Raid Train signups
        const raidTrainCollection = await getCollection(guildId, 'raidTrain');
        if (raidTrainCollection) {
            for (let i = 0; i < 7; i++) {
                const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                const dateKey = format(date, 'yyyy-MM-dd');
                const scheduleDoc = await raidTrainCollection.doc(dateKey).get();
                if (scheduleDoc.exists) {
                    const data = scheduleDoc.data();
                    if(data) {
                        Object.entries(data).forEach(([time, signup]: [string, any]) => {
                             if (signup.id !== 'emergency' && signup.signedUpAt) {
                                allActivities.push({
                                    id: scheduleDoc.id + '-' + time,
                                    user: { name: signup.name, avatar: signup.avatar },
                                    action: "signed up for the raid train on",
                                    target: format(new Date(`${dateKey}T00:00:00`), "MMM d"),
                                    timestamp: serializeTimestamp(signup.signedUpAt)
                                });
                            }
                        })
                    }
                }
            }
        }

        // 3. Get recent Captain's Log signups
         const logCollection = await getCollection(guildId, 'captainsLog');
         if(logCollection) {
            const monthKey = format(now, 'yyyy-MM');
            const logDoc = await logCollection.doc(monthKey).get();

             if (logDoc.exists) {
                 const data = logDoc.data();
                  if(data) {
                    Object.entries(data).forEach(([day, signup]: [string, any]) => {
                        if (signup.signedUpAt && signup.signedUpAt.toDate() >= sevenDaysAgo) {
                            allActivities.push({
                                id: logDoc.id + '-' + day,
                                user: { name: signup.userName, avatar: signup.userAvatar },
                                action: "signed up for the Captain's Log on",
                                target: format(new Date(now.getFullYear(), now.getMonth(), parseInt(day)), "MMM d"),
                                timestamp: serializeTimestamp(signup.signedUpAt)
                            });
                        }
                    })
                }
             }
         }
        
    } catch (error) {
        console.error("Error fetching activity feed:", error);
        return []; // Return empty on error
    }

    // Sort all activities by timestamp descending and take the most recent ones
    return allActivities
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 25);
}


/**
 * Gets the raid attendance count for a specific user.
 */
export async function getAttendanceRecord(guildId: string, userId: string): Promise<{ success: boolean; count?: number; error?: string; userName?: string }> {
    if (!guildId || !userId) {
        return { success: false, error: "Community ID and User ID are required." };
    }
    try {
        const db = getAdminDb();
        const userRef = db.collection(`communities/${guildId}/users`).doc(userId);
        
        // First get user's display name
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            return { success: false, error: `User with ID ${userId} not found.` };
        }
        const userData = userDoc.data();
        const userName = userData?.twitchInfo?.displayName || userData?.discordInfo?.username || userId;

        const count = userData?.raidAttendance || 0;
        
        return { success: true, count: count, userName: userName };

    } catch (error) {
        console.error(`Error getting attendance for user ${userId}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
    }
}
