
// src/app/api/community/event/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { getSettings } from '@/app/settings/actions';
import { FieldValue } from 'firebase-admin/firestore';

// This endpoint is called by the bot to report various community events.
export async function POST(request: NextRequest) {
  try {
    const { guildId, eventType, userId, eventData } = await request.json();

    const safeEventData = eventData ?? {};

    if (!guildId || !eventType || !userId) {
      return NextResponse.json({ success: false, error: 'Missing required fields: guildId, eventType, and userId are required.' }, { status: 400 });
    }

    // In a production environment, you might add a shared secret check here
    // to ensure only your bot can call this endpoint.

    const db = getAdminDb();
    const settings = await getSettings(guildId);
    const userRef = db.collection(`communities/${guildId}/users`).doc(userId);
    let pointsToAward = 0;
    let eventLog: any = {
        type: eventType,
        timestamp: FieldValue.serverTimestamp(),
    };

    switch (eventType) {
      case 'follow':
        pointsToAward = settings.newFollowerPoints;
        if (safeEventData.targetUserId) {
          eventLog.followed = safeEventData.targetUserId;
        }
        break;
      case 'subscribe':
        pointsToAward = settings.subscriptionPoints;
        if (safeEventData.targetUserId) {
          eventLog.subscribedTo = safeEventData.targetUserId;
        }
        eventLog.tier = safeEventData.tier || '1000';
        break;
      case 'cheer':
        const bits = Number(safeEventData.bits) || 0;
        pointsToAward = bits * settings.cheerPointsPerBit;
        if (safeEventData.targetUserId) {
          eventLog.cheeredOn = safeEventData.targetUserId;
        }
        eventLog.bits = bits;
        break;
      case 'hypeTrain':
        pointsToAward = settings.hypeTrainContributionPoints;
        if (safeEventData.targetUserId) {
          eventLog.contributedTo = safeEventData.targetUserId;
        }
        break;
      default:
        return NextResponse.json({ success: false, error: 'Invalid eventType.' }, { status: 400 });
    }
    
    if (pointsToAward > 0) {
        // Use a transaction to ensure atomicity
        await db.runTransaction(async (transaction) => {
            const userDataToMerge: Record<string, unknown> = {
                points: FieldValue.increment(pointsToAward),
                lastPointsUpdateAt: FieldValue.serverTimestamp(),
            };

            const twitchProfileFields = {
                id: safeEventData.twitchUserId,
                displayName: safeEventData.twitchDisplayName,
                login: safeEventData.twitchLogin,
                avatar: safeEventData.twitchAvatar,
            };

            if (Object.values(twitchProfileFields).some(Boolean)) {
                userDataToMerge.twitchInfo = {
                    ...(safeEventData.twitchInfo || {}),
                    ...Object.fromEntries(
                        Object.entries(twitchProfileFields).filter(([, value]) => Boolean(value))
                    ),
                };
            }

            if (safeEventData.discordId || safeEventData.discordUsername || safeEventData.discordAvatar) {
                userDataToMerge.discordInfo = {
                    ...(safeEventData.discordInfo || {}),
                    ...(safeEventData.discordId ? { id: safeEventData.discordId } : {}),
                    ...(safeEventData.discordUsername ? { username: safeEventData.discordUsername } : {}),
                    ...(safeEventData.discordAvatar ? { avatar: safeEventData.discordAvatar } : {}),
                };
            }

            transaction.set(userRef, userDataToMerge, { merge: true });

            // Log the event for analytics
            const eventRef = userRef.collection('events').doc(`${eventType}-${Date.now()}`);
            transaction.set(eventRef, { ...eventLog, points: pointsToAward });
        });
    }

    return NextResponse.json({ success: true, message: `Processed '${eventType}' event for user ${userId}. Awarded ${pointsToAward} points.` });

  } catch (error) {
    console.error('Error in community event API route:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
