
"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Eye, Heart, Star, Link2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import type { LiveUser } from "../raid-pile/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { getSettings } from "@/app/settings/actions";
import { useCommunity } from "@/context/community-context";

interface CommunityPoolClientPageProps {
  initialUsers: LiveUser[];
  spotlightTwitchId: string | null;
  isLoading: boolean;
  guildId: string;
}

function QuickLinkCard() {
    const { toast } = useToast();
    const [quickLink, setQuickLink] = useState("");
    const { selectedGuild: guildId } = useCommunity();

    useEffect(() => {
        if (guildId) {
            getSettings(guildId).then(settings => {
                const url = new URL("/join?action=community-pool", settings.appBaseUrl);
                setQuickLink(url.toString());
            });
        }
    }, [guildId]);

    const copyLink = () => {
        navigator.clipboard.writeText(quickLink);
        toast({
            title: "Link Copied!",
            description: "The quick join link has been copied to your clipboard.",
        });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Quick Join Link</CardTitle>
                <CardDescription>Share this link with members for an easy way to join the community pool.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
                <Input value={quickLink} readOnly />
                <Button onClick={copyLink} variant="outline" size="icon">
                    <Link2 />
                </Button>
            </CardContent>
        </Card>
    );
}

export function CommunityPoolClientPage({
  initialUsers,
  spotlightTwitchId,
  isLoading,
  guildId,
}: CommunityPoolClientPageProps) {
  const [liveUsers, setLiveUsers] = useState<LiveUser[]>(initialUsers);
  
  useEffect(() => {
      setLiveUsers(initialUsers);
  }, [initialUsers]);
  
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-headline flex items-center gap-3">
          <Heart className="h-8 w-8 text-pink-500" />
          Community Pool
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          An admin-focused view of community members who have opted-in to the Community Pool and are currently live.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
            <CardHeader>
                <CardTitle>How Members Join</CardTitle>
                <CardDescription>Members can join via the community pool embed in Discord or using the quick join link.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Opting-in means they will appear on this page and in the Discord embed whenever they go live.</p>
            </CardContent>
        </Card>
        <QuickLinkCard />
      </div>


       <Card>
            <CardHeader>
                <CardTitle>Live in the Community Pool ({isLoading ? '...' : liveUsers.length})</CardTitle>
                 <CardDescription>Community members who are currently live and in the pool.</CardDescription>
            </CardHeader>
            <CardContent>
                 {isLoading && (
                     <div className="text-center py-8 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <p>Loading streamers...</p>
                    </div>
                 )}
                {!isLoading && liveUsers.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {liveUsers.map((streamer) => {
                             const isSpotlight = streamer.twitchId === spotlightTwitchId;
                             return (
                                 <Card key={streamer.twitchId} className={cn("flex flex-col overflow-hidden transition-all", isSpotlight && "border-primary ring-2 ring-primary")}>
                                    <div className="aspect-video bg-muted rounded-t-lg relative">
                                        <Image
                                          src={`https://static-cdn.jtvnw.net/previews-ttv/live_user_${streamer.twitchLogin}-440x248.jpg`}
                                          alt={`Thumbnail for ${streamer.displayName}`}
                                          layout="fill"
                                          objectFit="cover"
                                          data-ai-hint="stream thumbnail"
                                        />
                                        {isSpotlight && (
                                            <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs font-bold py-1 px-2 rounded-full flex items-center gap-1">
                                                <Star className="h-3 w-3" />
                                                Spotlight
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-4 flex-1 flex flex-col">
                                        <div className="flex items-start gap-3">
                                            <Avatar>
                                                <AvatarImage src={streamer.avatarUrl} alt={streamer.displayName} data-ai-hint="streamer avatar" />
                                                <AvatarFallback>{streamer.displayName.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 truncate">
                                                <p className="font-bold truncate">{streamer.displayName}</p>
                                                <p className="text-xs text-muted-foreground truncate" title={streamer.latestGameName}>
                                                    {streamer.latestGameName || 'No game specified'}
                                                </p>
                                            </div>
                                        </div>
                                        <Button asChild className="w-full mt-4">
                                           <Link href={`https://twitch.tv/${streamer.twitchLogin}`} target="_blank" rel="noopener noreferrer">
                                                <Eye className="mr-2 h-4 w-4" />
                                                Watch Stream
                                            </Link>
                                        </Button>
                                    </div>
                                </Card>
                            )
                        })}
                    </div>
                ) : (
                   !isLoading && <div className="col-span-full text-center py-16">
                        <p className="text-muted-foreground">
                            No one from the community pool is live right now.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    </div>
  );
}
