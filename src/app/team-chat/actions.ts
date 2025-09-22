
'use server';

import { getAdminInfo, getUserInfoByDiscordId } from "../actions";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type { Webhook } from "../settings/actions";

export type ChatMessage = {
    id: string;
    userName: string;
    userAvatar: string;
    message: string;
    timestamp: any;
    channelName?: string;
};

/**
 * Sends a message to all enabled Discord webhooks AND saves it to the Firestore database.
 * This ensures messages from the app UI are visible in the chat history and sent to multiple channels.
 */
export async function sendMessage(guildId: string, adminDiscordId: string, message: string) {
    if (!guildId || !adminDiscordId || !message) {
        return { success: false, error: "Missing required information." };
    }

    try {
        const db = getAdminDb();
        
        // 1. Get admin user info for the message payload using Discord ID
        const { value: adminInfo, error: adminInfoError } = await getAdminInfo(adminDiscordId);
        
        if (adminInfoError || !adminInfo) {
             console.error(`sendMessage failed: Could not get admin info for ${adminDiscordId}. Error: ${adminInfoError}`);
        }

        const discordInfo = adminInfo?.discordInfo;
        const twitchInfo = adminInfo?.twitchInfo;

        const userName = twitchInfo?.displayName || discordInfo?.username || `Admin (${adminDiscordId})`;
        const userAvatar = twitchInfo?.avatar || discordInfo?.avatar || null;

        // 2. Save the message directly to Firestore
        const chatCollectionRef = db.collection(`communities/${guildId}/chat`);
        const newMessage = {
            userName: userName,
            userAvatar: userAvatar,
            message: message,
            timestamp: FieldValue.serverTimestamp(),
            channelName: 'Team App', 
        };
        await chatCollectionRef.add(newMessage);

        // 3. Fetch all enabled webhooks for the guild
        const webhooksSnapshot = await db.collection(`communities/${guildId}/webhooks`).where('enabled', '==', true).get();
        const webhooks = webhooksSnapshot.docs.map(doc => doc.data() as Omit<Webhook, 'id'>);

        if (webhooks.length > 0) {
            const webhookPayload = {
                content: message,
                username: userName,
                avatar_url: userAvatar || undefined,
            };

            // 4. Send the message to all enabled webhooks in parallel
            const webhookPromises = webhooks.map(hook => 
                fetch(hook.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(webhookPayload),
                }).then(response => {
                    if (!response.ok) {
                        console.error(`Error sending to webhook ${hook.name}: ${response.status} ${response.statusText}`);
                    }
                }).catch(error => {
                    console.error(`Failed to fetch webhook ${hook.name}:`, error);
                })
            );
            await Promise.all(webhookPromises);

        } else {
            console.warn("No enabled webhooks found. Message saved to DB but not sent to Discord.");
        }

        return { success: true };

    } catch (error) {
        console.error('Error sending message:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
    }
}


/**
 * Retrieves chat messages from the database.
 */
export async function getChatMessages(guildId: string): Promise<ChatMessage[]> {
    if (!guildId) {
        return [];
    }
    
    try {
        const db = getAdminDb();
        const snapshot = await db.collection(`communities/${guildId}/chat`).orderBy('timestamp', 'asc').limit(100).get();
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                timestamp: data.timestamp.toMillis(),
            }
        }) as ChatMessage[];
    } catch(error) {
        console.error("Error fetching chat messages from Firestore: ", error);
        return [];
    }
}
