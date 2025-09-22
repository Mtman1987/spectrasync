
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { CosmicRaidLogo, Twitch } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Link2, Loader2, Swords, Heart, Train } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// These actions will be called from the client
import { joinPile, joinCommunityPool, getTwitchUserByUsername } from "@/app/actions";
import { signUpForRaidTrain } from "../raid-train/actions";
import { format } from "date-fns";

type JoinAction = 'raid-pile' | 'community-pool' | 'raid-train';

const actionDetails: { [key in JoinAction]: { title: string, description: string, cta: string, icon: React.ReactNode } } = {
    'raid-pile': {
        title: "Join the Raid Pile",
        description: "Join the queue to be the next person raided by the community.",
        cta: "Join Raid Pile",
        icon: <Swords className="h-8 w-8 text-primary" />
    },
    'community-pool': {
        title: "Join the Community Pool",
        description: "Opt-in to be featured on the community pool page whenever you go live.",
        cta: "Join Community Pool",
        icon: <Heart className="h-8 w-8 text-pink-500" />
    },
    'raid-train': {
        title: "Join the Raid Train",
        description: "Sign up for a time slot in an upcoming raid train.",
        cta: "Sign Up for Raid Train",
        icon: <Train className="h-8 w-8 text-primary" />
    }
}

function JoinPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const action = searchParams.get('action') as JoinAction | null;
    const guildId = searchParams.get('guildId'); // Will be added during Discord auth redirect
    const discordId = searchParams.get('discordId');
    const [isLoading, setIsLoading] = useState(false);
    const [twitchUsername, setTwitchUsername] = useState("");
    const [error, setError] = useState<string | null>(null);

    // Step 1: Check if we have the necessary info. If not, redirect to Discord auth.
    useEffect(() => {
        if (!action || !guildId || !discordId) {
            // A simplified auth flow. A real app would use state for CSRF.
            const discordAuthUrl = new URL("https://discord.com/oauth2/authorize");
            discordAuthUrl.searchParams.set("client_id", process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!);
            
            // Construct the redirect URI with the original action
            const redirectUri = new URL('/api/join-callback', window.location.origin);
            redirectUri.searchParams.set('action', action || '');
            
            discordAuthUrl.searchParams.set("redirect_uri", redirectUri.toString());
            discordAuthUrl.searchParams.set("response_type", "code");
            discordAuthUrl.searchParams.set("scope", "identify guilds");
            
            window.location.href = discordAuthUrl.toString();
        }
    }, [action, guildId, discordId]);


    const handleTwitchSubmit = async () => {
        if (!twitchUsername) {
            setError("Please enter your Twitch username.");
            return;
        }
        setIsLoading(true);
        setError(null);
        // This is a simplified flow. A real app would have a dedicated action.
        const user = await getTwitchUserByUsername(twitchUsername);
        if (!user) {
            setError(`Could not find a Twitch user named "${twitchUsername}". Please check the spelling.`);
            setIsLoading(false);
            return;
        }
        // In a real app, you would now save this twitch info against the user's discordId.
        // For this demo, we'll just assume it's linked and try the action again.
        toast({ title: "Twitch Verified!", description: "Your Twitch account seems valid. Please try the action again."});
        setIsLoading(false);
        // A more robust solution would re-trigger the join action automatically.
    }
    
    const handleJoin = async () => {
        if (!action || !guildId || !discordId) return;

        setIsLoading(true);
        setError(null);
        let result: { success: boolean, error?: string | null, message?: string } | undefined;

        try {
             switch(action) {
                case 'raid-pile':
                    result = await joinPile(guildId, discordId);
                    break;
                case 'community-pool':
                    result = await joinCommunityPool(guildId, discordId);
                    break;
                case 'raid-train':
                    // This is a simplified example; a real implementation would need date/time inputs.
                    const today = format(new Date(), 'yyyy-MM-dd');
                    const time = "14:00"; // Example time
                     toast({ title: "Info", description: "Raid train sign up via link is a demo and uses a default time slot.", variant: "default" });
                    // We need the user's Twitch username which we don't have here yet.
                    // This demonstrates the need for the Twitch verification step.
                    result = { success: false, error: "Please verify your Twitch username first." };
                    break;
            }

            if (result?.success) {
                toast({ title: "Success!", description: `You have successfully joined the ${action.replace('-', ' ')}.` });
            } else {
                if (result?.error?.includes("Twitch account")) {
                    setError("Your Twitch account isn't linked. Please verify it below.");
                } else {
                    setError(result?.error || "An unknown error occurred.");
                }
            }
        } catch(e) {
            setError(e instanceof Error ? e.message : "An unexpected error occurred.");
        }
       
        setIsLoading(false);
    }
    
    if (!action || !guildId || !discordId) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center gap-4">
                <CosmicRaidLogo className="h-12 w-12 text-primary" />
                <Loader2 className="h-8 w-8 animate-spin" />
                <p>Redirecting to Discord for authentication...</p>
            </div>
        )
    }

    const details = actionDetails[action];

    return (
        <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit">
                       {details.icon}
                    </div>
                    <CardTitle className="mt-2">{details.title}</CardTitle>
                    <CardDescription>{details.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {error && (
                         <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {error?.includes("Twitch") && (
                        <div className="space-y-2 pt-4 border-t">
                            <p className="text-sm font-medium">Verify Twitch Account</p>
                            <div className="flex items-center gap-2">
                                <Input 
                                    placeholder="Enter your Twitch username" 
                                    value={twitchUsername}
                                    onChange={(e) => setTwitchUsername(e.target.value)}
                                />
                                <Button onClick={handleTwitchSubmit} disabled={isLoading}>
                                    {isLoading ? <Loader2 className="animate-spin" /> : <Twitch />}
                                </Button>
                            </div>
                        </div>
                    )}

                    <Button onClick={handleJoin} className="w-full" disabled={isLoading}>
                        {isLoading && <Loader2 className="animate-spin mr-2" />}
                        {details.cta}
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}

export default function JoinPage() {
    return (
        <Suspense fallback={<div className="flex h-screen w-full items-center justify-center">Loading...</div>}>
            <JoinPageContent />
        </Suspense>
    )
}
