
import { NextResponse, type NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const { code } = await req.json();

  if (!code) {
    return NextResponse.json(
      { error: "Missing authorization code" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
        console.error("Discord token exchange failed:", data);
        return NextResponse.json({ error: data.error_description || "Token exchange failed" }, { status: response.status });
    }

    return NextResponse.json({ access_token: data.access_token });
  } catch (error) {
    console.error("Discord token API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
