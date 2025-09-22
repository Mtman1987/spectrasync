
"use client";

import { DiscordSDK, DiscordSDKMock } from "@discord/embedded-app-sdk";
import { useEffect, useState } from "react";
import { CosmicRaidLogo } from "@/components/icons";
import { Loader2 } from "lucide-react";

type Auth = {
  access_token: string;
  user: {
    username: string;
    discriminator: string;
    id: string;
    avatar?: string | null;
    public_flags: number;
  };
};

export default function DiscordActivity({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [discordSdk, setDiscordSdk] = useState<DiscordSDK | DiscordSDKMock | null>(null);

  useEffect(() => {
    // This code now runs only on the client
    const isEmbedded = new URLSearchParams(window.location.search).has("frame_id");
    let sdk: DiscordSDK | DiscordSDKMock;
    if (!isEmbedded) {
      console.log("Not running in an embedded context, using DiscordSDKMock.");
      sdk = new DiscordSDKMock(
        process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
        "123456789012345678", // mock guildId
        "112233445566778899", // mock channelId
        null
      );
    } else {
      console.log("Running in an embedded context, using DiscordSDK.");
      sdk = new DiscordSDK(process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!);
    }
    setDiscordSdk(sdk);
  }, []);

  useEffect(() => {
    if (!discordSdk) {
      return;
    }

    async function setup(sdk: DiscordSDK | DiscordSDKMock) {
      try {
        console.log("Waiting for Discord SDK to be ready...");
        await sdk.ready();
        console.log("Discord SDK is ready.");

        console.log("Authorizing with Discord...");
        const { code } = await sdk.commands.authorize({
          client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
          response_type: "code",
          state: "",
          prompt: "none",
          scope: ["identify", "guilds"],
        });
        console.log("Authorization code received.");

        console.log("Fetching access token from server...");
        const response = await fetch("/api/discord-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`Failed to get access token from server: ${data.error || 'Unknown error'}`);
        }
        
        const { access_token } = data;
        console.log("Access token received.");

        console.log("Authenticating with Discord SDK...");
        const newAuth = await sdk.commands.authenticate(access_token);

        if (!newAuth) {
          throw new Error("Discord SDK authenticate command failed.");
        }
        console.log("Authentication successful:", newAuth.user.username);

        // Store the user's Discord ID for use across the app
        localStorage.setItem('adminDiscordId', newAuth.user.id);

        const channelId = sdk.channelId;
        if (channelId) {
          const channel = await sdk.commands.getChannel({ channel_id: channelId });
          if (channel.voice_states?.some((vs) => vs.user.id === newAuth.user.id)) {
            console.log("User is in the correct voice channel.");
          }
        }

        setAuth(newAuth);
        setIsLoading(false);
      } catch (err) {
        console.error("Error setting up Discord Activity:", err);
        setError(err instanceof Error ? err.message : "An unknown error occurred.");
        setIsLoading(false);
      }
    }
    setup(discordSdk);
  }, [discordSdk]);

  if (isLoading || !discordSdk) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background text-foreground">
        <CosmicRaidLogo className="h-12 w-12 text-primary" />
        <Loader2 className="h-8 w-8 animate-spin" />
        <p>Connecting to Discord...</p>
      </div>
    );
  }

  if (error) {
     return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-destructive text-destructive-foreground p-4 text-center">
        <CosmicRaidLogo className="h-12 w-12" />
        <h1 className="font-headline text-xl">Connection Error</h1>
        <p>Could not connect to Discord. Please try relaunching the activity.</p>
        <p className="text-xs font-mono bg-black/20 p-2 rounded-md">{error}</p>
      </div>
    );
  }

  return <>{children}</>;
}
    