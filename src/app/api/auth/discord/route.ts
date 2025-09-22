// src/app/api/auth/discord/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

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

export function GET(request: NextRequest) {
    // Generate a random state for CSRF protection
    const state = randomBytes(16).toString('hex');

    const baseUrl = resolveBaseUrl(request);
    const redirectUri =
        process.env.DISCORD_REDIRECT_URI ||
        new URL('/api/auth/discord/callback', baseUrl).toString();

    const discordAuthUrl = new URL("https://discord.com/oauth2/authorize");
    discordAuthUrl.searchParams.set("client_id", process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!);
    discordAuthUrl.searchParams.set("redirect_uri", redirectUri);
    discordAuthUrl.searchParams.set("response_type", "code");
    discordAuthUrl.searchParams.set("scope", "identify guilds");
    discordAuthUrl.searchParams.set("state", state);

    // Store the state in a cookie to verify it on callback
    const response = NextResponse.redirect(discordAuthUrl.toString());
    response.cookies.set('discord_oauth_state', state, { path: '/', httpOnly: true, maxAge: 300 }); // Expires in 5 minutes

    return response;
}
