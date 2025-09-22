
// src/app/api/join-callback/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { saveUserInfoByDiscordId } from "@/app/actions";

const DEFAULT_BASE_URL = "https://cosmicbackend--cosmic-raid-app.us-central1.hosted.app";

function resolveBaseUrl(request: NextRequest) {
    if (process.env.NEXT_PUBLIC_BASE_URL) {
        return process.env.NEXT_PUBLIC_BASE_URL;
    }

    if (process.env.NODE_ENV === "development") {
        return request.nextUrl.origin;
    }

    return DEFAULT_BASE_URL;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const action = searchParams.get('action');

    const baseUrl = resolveBaseUrl(request);

    if (!code) {
        return NextResponse.redirect(new URL('/join?error=Missing authorization code', baseUrl));
    }
    if (!action) {
         return NextResponse.redirect(new URL('/join?error=Missing action parameter', baseUrl));
    }

    try {
        const redirectUri = new URL('/api/join-callback', baseUrl).toString();

        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
                client_secret: process.env.DISCORD_CLIENT_SECRET!,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
            }),
        });

        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok) {
            throw new Error(`Discord token exchange failed: ${tokenData.error_description || 'Unknown error'}`);
        }
        
        const accessToken = tokenData.access_token;
        const [guildsResponse, userResponse] = await Promise.all([
            fetch('https://discord.com/api/users/@me/guilds', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }),
            fetch('https://discord.com/api/users/@me', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            })
        ]);

        if (!guildsResponse.ok || !userResponse.ok) {
            throw new Error("Failed to fetch user's guilds or identity from Discord.");
        }
        
        const [guildsData, userData] = await Promise.all([guildsResponse.json(), userResponse.json()]);
        
        const discordId = userData.id;
        if (!discordId) {
            throw new Error("Could not resolve user's Discord ID.");
        }

        // Find a common guild between the user and the bot.
        // This is a simplified approach. A real app might have the bot query its own guilds.
        // For now, we assume the first guild the user is in is the target. This is a big assumption.
        // A better approach would be to pass the guildId in the original link, but that's complex.
        const targetGuildId = guildsData[0]?.id;

        if (!targetGuildId) {
            return NextResponse.redirect(new URL(`/join?action=${action}&error=Could not determine a community. Please join the Discord server first.`, baseUrl));
        }

        // Save basic user info
        await saveUserInfoByDiscordId(targetGuildId, discordId, {
            discordInfo: {
                id: userData.id,
                username: userData.username,
                avatar: userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png` : null,
            }
        });
        
        const redirectUrl = new URL('/join', baseUrl);
        redirectUrl.searchParams.set('action', action);
        redirectUrl.searchParams.set('guildId', targetGuildId);
        redirectUrl.searchParams.set('discordId', discordId);
        return NextResponse.redirect(redirectUrl);

    } catch (e) {
        console.error("Join callback error:", e);
        const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
        const errorRedirectUrl = new URL(`/join?action=${action}`, baseUrl);
        errorRedirectUrl.searchParams.set('error', errorMessage);
        return NextResponse.redirect(errorRedirectUrl);
    }
}
