// src/app/settings/actions.ts
"use server";

import { getAdminDb } from "@/lib/firebase-admin";
import type { ConvertMp4ToGifOptions } from "@/lib/convertVideoToGif";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, unlink } from "node:fs/promises";

export type CommunitySettings = {
    // App Base URL
    appBaseUrl: string;

    // Point Requirements
    raidTrainRequiredPoints: number; 
    raidTrainEmergencyRequiredPoints: number;
    raidTrainBonusSlotsRequiredPoints: number;

    // Point Awards
    raidTrainPoints: number;
    captainLogPoints: number;
    raidParticipationPoints: number;
    newFollowerPoints: number;
    subscriptionPoints: number;
    cheerPointsPerBit: number;
    hypeTrainContributionPoints: number;

    // Raid Train Rules
    raidTrainBaseSlots: number;
    raidTrainBonusSlots: number;
    raidTrainAllowEmergencyWithSlot: boolean;
    useAttendanceForRaidTrain: boolean;

    // Clip Conversion Settings
    clipGifWidth: number;
    clipGifFps: number;
    clipGifLoop: number;
    clipGifMaxDurationSeconds: number;
};

export type Webhook = {
    id: string;
    name: string;
    url: string;
    enabled: boolean;
};


const defaultSettings: CommunitySettings = {
    // App Base URL
    appBaseUrl: "http://localhost:9002",

    // Point Requirements
    raidTrainRequiredPoints: 150,
    raidTrainEmergencyRequiredPoints: 0,
    raidTrainBonusSlotsRequiredPoints: 1000,
    
    // Point Awards
    raidTrainPoints: 25,
    captainLogPoints: 10,
    raidParticipationPoints: 5,
    newFollowerPoints: 5,
    subscriptionPoints: 50,
    cheerPointsPerBit: 1,
    hypeTrainContributionPoints: 10,

    // Raid Train Rules
    raidTrainBaseSlots: 1,
    raidTrainBonusSlots: 1,
    raidTrainAllowEmergencyWithSlot: false,
    useAttendanceForRaidTrain: false,

    // Clip Conversion Settings
    clipGifWidth: 480,
    clipGifFps: 15,
    clipGifLoop: 0,
    clipGifMaxDurationSeconds: 0,
};

// Saves the settings for a specific community.
export async function saveSettings(guildId: string, settings: Partial<CommunitySettings>) {
    if (!guildId) {
        return { success: false, error: "Community ID is required." };
    }
    try {
        const db = getAdminDb();
        const settingsRef = db.collection('communities').doc(guildId).collection('settings').doc('points');
        await settingsRef.set(settings, { merge: true });
        return { success: true };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return { success: false, error: errorMessage };
    }
}

// Retrieves the settings for a specific community.
export async function getSettings(guildId: string): Promise<CommunitySettings> {
    if (!guildId) {
        return defaultSettings;
    }
    try {
        const db = getAdminDb();
        const doc = await db.collection('communities').doc(guildId).collection('settings').doc('points').get();

        if (!doc.exists) {
            return defaultSettings;
        }
        
        return { ...defaultSettings, ...doc.data() } as CommunitySettings;

    } catch (e) {
        console.error(`Error getting settings for guild ${guildId}: `, e);
        return defaultSettings;
    }
}

// --- Webhook Management Actions ---

export async function addWebhook(guildId: string, name: string, url: string) {
    if (!guildId || !name || !url) {
        return { success: false, error: "Missing required fields." };
    }
    try {
        const db = getAdminDb();
        const webhooksCollection = db.collection(`communities/${guildId}/webhooks`);
        await webhooksCollection.add({
            name,
            url,
            enabled: true,
        });
        return { success: true };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return { success: false, error: errorMessage };
    }
}

export async function getWebhooks(guildId: string): Promise<Webhook[]> {
    if (!guildId) return [];
    try {
        const db = getAdminDb();
        const snapshot = await db.collection(`communities/${guildId}/webhooks`).get();
        if (snapshot.empty) return [];
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Webhook));
    } catch (e) {
        console.error("Error getting webhooks:", e);
        return [];
    }
}

export async function updateWebhookStatus(guildId: string, webhookId: string, enabled: boolean) {
    if (!guildId || !webhookId) {
        return { success: false, error: "Missing required fields." };
    }
    try {
        const db = getAdminDb();
        await db.collection(`communities/${guildId}/webhooks`).doc(webhookId).update({ enabled });
        return { success: true };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return { success: false, error: errorMessage };
    }
}

export async function deleteWebhook(guildId: string, webhookId: string) {
    if (!guildId || !webhookId) {
        return { success: false, error: "Missing required fields." };
    }
    try {
        const db = getAdminDb();
        await db.collection(`communities/${guildId}/webhooks`).doc(webhookId).delete();
        return { success: true };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return { success: false, error: errorMessage };
    }
}

type GifTestOptions = {
    guildId: string;
    webhookId: string;
    mp4Url: string;
    width?: number;
    height?: number;
    fps?: number;
    loop?: number;
};

type GifTestResult = {
    success: true;
    details: {
        durationSeconds: number;
    };
} | {
    success: false;
    error: string;
};

export async function testGifWebhook({
    guildId,
    webhookId,
    mp4Url,
    width,
    height,
    fps,
    loop,
}: GifTestOptions): Promise<GifTestResult> {
    if (!guildId || !webhookId || !mp4Url) {
        return { success: false, error: "Community, webhook, and MP4 URL are required." };
    }

    const db = getAdminDb();
    const webhookSnap = await db.collection(`communities/${guildId}/webhooks`).doc(webhookId).get();
    if (!webhookSnap.exists) {
        return { success: false, error: "Webhook could not be found for this community." };
    }

    const webhookData = webhookSnap.data() as Webhook;
    if (!webhookData.enabled) {
        return { success: false, error: "Webhook is currently disabled." };
    }

    const tempInputPath = join(tmpdir(), `gif-test-${randomUUID()}.mp4`);
    const storageObjectPath = `webhook-previews/${guildId}/${randomUUID()}.gif`;

    try {
        const response = await fetch(mp4Url);
        if (!response.ok) {
            return { success: false, error: `Unable to download clip. HTTP ${response.status}` };
        }

        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength === 0) {
            return { success: false, error: "The downloaded clip was empty." };
        }

        await writeFile(tempInputPath, Buffer.from(arrayBuffer));

        const { convertMp4ToGif } = await import("@/lib/convertVideoToGif");

        const conversionOptions = Object.fromEntries(
            Object.entries({ width, height, fps, loop, storagePath: storageObjectPath }).filter(([, value]) => value !== undefined)
        ) as ConvertMp4ToGifOptions;

        const conversion = await convertMp4ToGif(tempInputPath, storageObjectPath, conversionOptions);

        const blob = new Blob([conversion.buffer], { type: 'image/gif' });
        const formData = new FormData();
        formData.append('content', `GIF conversion test triggered from Cosmic Raid settings. Source: ${mp4Url}`);
        formData.append('file', blob, 'cosmic-raid-preview.gif');

        const webhookResponse = await fetch(`${webhookData.url}?wait=true`, {
            method: 'POST',
            body: formData,
        });

        if (!webhookResponse.ok) {
            const body = await webhookResponse.text();
            return {
                success: false,
                error: `Discord webhook responded with ${webhookResponse.status}: ${body}`,
            };
        }

        return {
            success: true,
            details: {
                durationSeconds: conversion.durationSeconds ?? 0,
            },
        };
    } catch (error) {
        console.error('Failed to run GIF test webhook', error);
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
    } finally {
        try {
            await unlink(tempInputPath);
        } catch {
            // ignore cleanup errors
        }
    }
}
