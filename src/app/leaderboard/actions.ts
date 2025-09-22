// src/app/leaderboard/actions.ts
"use server";

import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getSettings } from "../settings/actions";

export type LeaderboardUser = {
    twitchId?: string;
    discordId?: string;
    displayName: string;
    avatarUrl?: string;
    points: number;
};

/**
 * Fetches the leaderboard data from Firestore, sorted by points.
 * Can be limited to a certain number of users.
 */
export async function getLeaderboard(guildId: string, limit?: number): Promise<LeaderboardUser[]> {
    if (!guildId) {
        console.error("No guildId provided to getLeaderboard");
        return [];
    }
    try {
        const db = getAdminDb();
        let query = db.collection(`communities/${guildId}/users`)
            .where('points', '>', 0) 
            .orderBy('points', 'desc');

        if (limit) {
            query = query.limit(limit);
        }
        
        const usersSnapshot = await query.get();

        if (usersSnapshot.empty) {
            return [];
        }

        const leaderboard: LeaderboardUser[] = [];
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            const displayName = data.twitchInfo?.displayName || data.discordInfo?.username || 'Unknown User';
            const avatarUrl = data.twitchInfo?.avatar || data.discordInfo?.avatar || undefined;
            
            leaderboard.push({
                discordId: data.discordInfo?.id || doc.id,
                twitchId: data.twitchInfo?.id,
                displayName: displayName,
                avatarUrl: avatarUrl,
                points: data.points || 0
            });
        });

        return leaderboard;
    } catch (error) {
        console.error(`Error getting leaderboard for guild ${guildId}:`, error);
        return [];
    }
}


function generateLeaderboardText(users: LeaderboardUser[]): string {
    const header = "╔═ C R E W   L E A D E R B O A R D ═╗\n";
    const footer = "╚═════════════════════════════════╝";
    const line =   "╟─────────────────────────────────╢\n";
    let body = "";

    if (users.length === 0) {
        body += "║    No one is on the board yet.    ║\n";
    } else {
        users.forEach((user, index) => {
            const rank = (index + 1).toString().padStart(2, ' ');
            const name = user.displayName.substring(0, 15).padEnd(15, ' ');
            const points = (user.points || 0).toString().padStart(6, ' ');
            
            let rankIcon = '  ';
            if (index === 0) rankIcon = '🥇';
            else if (index === 1) rankIcon = '🥈';
            else if (index === 2) rankIcon = '🥉';

            body += `║ ${rankIcon}#${rank}│${name}│${points} pts ║\n`;
        });
    }
    
    return '```' + `${header}${line}${body}${footer}` + '```';
}


export async function buildLeaderboardEmbed(guildId: string) {
    try {
        if (!guildId) return null;

        const [leaderboardUsers, settings] = await Promise.all([
             getLeaderboard(guildId, 10), // Only get top 10 for the embed
             getSettings(guildId),
        ]);
       
        const leaderboardText = generateLeaderboardText(leaderboardUsers);
        
        const pointsDescription = [
            '**How to Earn Points:**',
            `> • Raid Participation: **${settings.raidParticipationPoints} pts**`,
            `> • Raid Train Signup: **${settings.raidTrainPoints} pts**`,
            `> • Captain's Log Signup: **${settings.captainLogPoints} pts**`,
            `> • Community Follow: **${settings.newFollowerPoints} pts**`,
            `> • Subscription: **${settings.subscriptionPoints} pts**`,
            `> • Per Bit Cheered: **${settings.cheerPointsPerBit} pts**`,
            `> • Hype Train Contribution: **${settings.hypeTrainContributionPoints} pts**`,
        ].join('\n');

        const embedData = {
            title: '🏆   Community Leaderboard   🏆',
            description: `${leaderboardText}\n${pointsDescription}`,
            color: 0xFFD700, // Gold color
            footer: {
                text: 'This leaderboard updates automatically. Point values are set by the admin.',
            },
            timestamp: new Date().toISOString(),
        };

        // This embed has no buttons for now, so components are empty.
        const components: any[] = [];

        return {
            embeds: [embedData],
            components: components,
        };

    } catch(e) {
        console.error("Error building leaderboard embed:", e);
        return null;
    }
}


export async function setLeaderboardControlMessage(guildId: string, channelId: string, messageId: string) {
    if (!guildId || !channelId || !messageId) {
        return { success: false, error: "Missing required IDs." };
    }
    try {
        const db = getAdminDb();
        const settingsRef = db.collection('communities').doc(guildId).collection('settings').doc('leaderboardControl');
        await settingsRef.set({ channelId, messageId }, { merge: true });
        return { success: true };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return { success: false, error: errorMessage };
    }
}
