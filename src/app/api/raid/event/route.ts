import { type NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { getSettings } from '@/app/settings/actions';
import { FieldValue, type CollectionReference, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getCurrentRaidTrainConductorId } from '@/app/raid-train/actions';
import { getTwitchChatParticipants, getTwitchUsersByLogins, getTwitchUserById, type BasicTwitchUser } from '@/lib/twitch';

interface ParticipantRecord {
  id: string;
  login: string;
  displayName: string;
}

interface UpdateTarget {
  ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  docId: string;
  twitchId?: string;
  twitchLogin?: string;
  displayName?: string;
  isRaider: boolean;
  isParticipant: boolean;
  wasInPile: boolean;
}

interface TrackedPools {
  communityPool: boolean;
  raidPile: boolean;
  raidTrain: boolean;
}

async function getUserDocByTwitchId(
  collection: CollectionReference<FirebaseFirestore.DocumentData>,
  twitchId: string
): Promise<QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null> {
  const snapshot = await collection.where('twitchInfo.id', '==', twitchId).limit(1).get();
  return snapshot.docs[0] ?? null;
}

async function getUserDocsByTwitchIds(
  collection: CollectionReference<FirebaseFirestore.DocumentData>,
  twitchIds: string[]
): Promise<Map<string, QueryDocumentSnapshot<FirebaseFirestore.DocumentData>>> {
  const results = new Map<string, QueryDocumentSnapshot<FirebaseFirestore.DocumentData>>();
  const uniqueIds = Array.from(new Set(twitchIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return results;
  }

  const chunkSize = 10;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const snapshot = await collection.where('twitchInfo.id', 'in', chunk).get();
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const id = data?.twitchInfo?.id;
      if (id) {
        results.set(id, doc);
      }
    });
  }

  return results;
}

function toParticipantRecord(user: BasicTwitchUser): ParticipantRecord {
  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name,
  };
}

function buildTrackedPoolList(flags: TrackedPools): string[] {
  return Object.entries(flags)
    .filter(([, value]) => value)
    .map(([key]) => key);
}

export async function POST(request: NextRequest) {
  try {
    const {
      guildId,
      fromBroadcasterId,
      toBroadcasterId,
      fromBroadcasterName,
      toBroadcasterName,
    } = await request.json();

    if (!guildId || !fromBroadcasterId || !toBroadcasterId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: guildId, fromBroadcasterId, and toBroadcasterId are required.',
        },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const settings = await getSettings(guildId);
    const points = settings.raidParticipationPoints || 5;

    const usersCollection = db.collection(`communities/${guildId}/users`);
    const [fromUserDoc, toUserDoc] = await Promise.all([
      getUserDocByTwitchId(usersCollection, fromBroadcasterId),
      getUserDocByTwitchId(usersCollection, toBroadcasterId),
    ]);

    const fromUserData = fromUserDoc?.data();
    const toUserData = toUserDoc?.data();

    const trackedPools: TrackedPools = {
      communityPool: Boolean(fromUserData?.inCommunityPool),
      raidPile: Boolean(fromUserData?.inPile),
      raidTrain: false,
    };

    if (!trackedPools.raidTrain) {
      const currentConductorId = await getCurrentRaidTrainConductorId(guildId);
      trackedPools.raidTrain = currentConductorId === fromBroadcasterId;
    }

    if (!trackedPools.communityPool && !trackedPools.raidPile && !trackedPools.raidTrain) {
      return NextResponse.json({
        success: true,
        message: `Raid from ${fromBroadcasterName || fromBroadcasterId} ignored because the broadcaster is not part of the community pool, raid pile, or current raid train conductor.`,
      });
    }

    let raiderLogin = fromUserData?.twitchInfo?.login || undefined;
    let raiderDisplayName =
      fromUserData?.twitchInfo?.displayName || fromBroadcasterName || fromUserData?.discordInfo?.username || fromBroadcasterId;

    if (!raiderLogin) {
      const twitchUser = await getTwitchUserById(fromBroadcasterId);
      if (twitchUser) {
        raiderLogin = twitchUser.login;
        raiderDisplayName = twitchUser.display_name;
      }
    }

    const raiderLoginLower = raiderLogin?.toLowerCase();

    let participantLogins: string[] = [];
    if (raiderLoginLower) {
      const chatParticipants = await getTwitchChatParticipants(raiderLoginLower);
      participantLogins = chatParticipants.slice(0, 200);
    }

    const participantLookup = new Map<string, ParticipantRecord>();

    if (participantLogins.length > 0) {
      const users = await getTwitchUsersByLogins(participantLogins);
      users.forEach((user) => {
        participantLookup.set(user.id, toParticipantRecord(user));
      });
    }

    if (!participantLookup.has(fromBroadcasterId)) {
      participantLookup.set(fromBroadcasterId, {
        id: fromBroadcasterId,
        login: raiderLoginLower || fromBroadcasterId,
        displayName: raiderDisplayName,
      });
    }

    const participants = Array.from(participantLookup.values());
    const participantTwitchIds = participants.map((participant) => participant.id);

    const participantDocMap = await getUserDocsByTwitchIds(usersCollection, participantTwitchIds);

    const updateTargets: UpdateTarget[] = [];
    const seenDocIds = new Set<string>();

    if (fromUserDoc) {
      updateTargets.push({
        ref: fromUserDoc.ref,
        docId: fromUserDoc.id,
        twitchId: fromUserData?.twitchInfo?.id,
        twitchLogin: raiderLoginLower || fromUserData?.twitchInfo?.login,
        displayName: raiderDisplayName,
        isRaider: true,
        isParticipant: true,
        wasInPile: Boolean(fromUserData?.inPile),
      });
      seenDocIds.add(fromUserDoc.id);
    }

    for (const participant of participants) {
      const participantDoc = participantDocMap.get(participant.id);
      if (!participantDoc) continue;

      if (seenDocIds.has(participantDoc.id)) {
        const existing = updateTargets.find((target) => target.docId === participantDoc.id);
        if (existing) {
          existing.isParticipant = true;
          if (participant.id === fromBroadcasterId) {
            existing.isRaider = true;
          }
        }
        continue;
      }

      const data = participantDoc.data();
      updateTargets.push({
        ref: participantDoc.ref,
        docId: participantDoc.id,
        twitchId: data?.twitchInfo?.id,
        twitchLogin: participant.login,
        displayName: participant.displayName,
        isRaider: participant.id === fromBroadcasterId,
        isParticipant: true,
        wasInPile: Boolean(data?.inPile),
      });
      seenDocIds.add(participantDoc.id);
    }

    const batch = db.batch();
    const eventId = `raid-${Date.now()}`;
    const trackedPoolList = buildTrackedPoolList(trackedPools);

    for (const target of updateTargets) {
      const updatePayload: Record<string, FirebaseFirestore.FieldValue | boolean> = {
        raidAttendance: FieldValue.increment(1),
        lastRaidAttendanceAt: FieldValue.serverTimestamp(),
      };

      if (points > 0) {
        updatePayload.points = FieldValue.increment(points);
        updatePayload.lastPointsUpdateAt = FieldValue.serverTimestamp();
      }

      if (target.wasInPile) {
        updatePayload.inPile = false;
      }

      batch.set(target.ref, updatePayload, { merge: true });

      const eventRef = target.ref.collection('events').doc(eventId);
      batch.set(
        eventRef,
        {
          type: 'raid_participation',
          role: target.isRaider ? 'raider' : 'participant',
          pointsAwarded: points,
          timestamp: FieldValue.serverTimestamp(),
          raid: {
            from: {
              id: fromBroadcasterId,
              name: raiderDisplayName,
              login: raiderLoginLower || fromBroadcasterId,
            },
            to: {
              id: toBroadcasterId,
              name:
                toUserData?.twitchInfo?.displayName || toBroadcasterName || toUserData?.discordInfo?.username || toBroadcasterId,
              login: toUserData?.twitchInfo?.login || null,
            },
            participantCount: participants.length,
            participantIds: participantTwitchIds,
            participantLogins: participants.map((participant) => participant.login),
            trackedPools: trackedPoolList,
          },
        },
        { merge: true }
      );
    }

    const attendanceRef = db.collection(`communities/${guildId}/attendance`).doc(eventId);
    batch.set(attendanceRef, {
      eventId,
      guildId,
      createdAt: FieldValue.serverTimestamp(),
      from: {
        id: fromBroadcasterId,
        login: raiderLoginLower || null,
        displayName: raiderDisplayName,
        trackedPools: trackedPoolList,
      },
      to: {
        id: toBroadcasterId,
        login: toUserData?.twitchInfo?.login || null,
        displayName:
          toUserData?.twitchInfo?.displayName || toBroadcasterName || toUserData?.discordInfo?.username || toBroadcasterId,
      },
      participantCount: participants.length,
      participants,
      matchedMemberDocIds: updateTargets.map((target) => target.docId),
      matchedMemberCount: updateTargets.length,
      pointsAwardedPerUser: points,
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `Raid from ${raiderDisplayName} to ${toBroadcasterName || toBroadcasterId} processed. Awarded ${points} points to ${updateTargets.length} member(s) and recorded ${participants.length} participant(s).`,
    });
  } catch (error) {
    console.error('Error in raid event API route:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

