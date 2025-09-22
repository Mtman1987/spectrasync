
// src/app/api/chat/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    // Update to accept and use the new fields from the bot
    const { guildId, userName, userAvatar, message, channelName, serverName } = await request.json();

    // Using guildId to route messages to the correct community chat.
    if (!guildId || !userName || !message) {
      return NextResponse.json({ success: false, error: 'Missing required fields: guildId, userName, and message are required.' }, { status: 400 });
    }

    const db = getAdminDb();
    const chatCollectionRef = db.collection(`communities/${guildId}/chat`);
    
    const newMessage = {
      userName: userName,
      userAvatar: userAvatar || null, // Avatar can be optional, default to null
      message: message,
      channelName: channelName || 'Unknown Channel', // Store channel name
      serverName: serverName || 'Unknown Server',   // Store server name
      timestamp: FieldValue.serverTimestamp(),
    };

    await chatCollectionRef.add(newMessage);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in chat API route:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
