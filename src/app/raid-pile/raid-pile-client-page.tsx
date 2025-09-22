
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
import { Loader2, Swords, Crown, Eye, Link2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import type { RaidPile, LiveUser } from "./types";
import { LeaderboardCard } from "@/components/leaderboard-card";
import type { LeaderboardUser } from "@/app/leaderboard/actions";
import { Twitch } from "@/components/icons";
import { useCommunity } from "@/context/community-context";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import { getSettings } from "@/app/settings/actions";

interface RaidPileClientPageProps {
  initialRaidPiles: RaidPile[];
  leaderboardData: LeaderboardUser[];
  isLoading: boolean;
  parentDomain: string;
}

function QuickLinkCard() {
    const { toast } = useToast();
    const [quickLink, setQuickLink] = useState("");
    const { selectedGuild: guildId } = useCommunity();

    useEffect(() => {
        if (guildId) {
            getSettings(guildId).then(settings => {
                const url = new URL("/join?action=raid-pile", settings.appBaseUrl);
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
                <CardDescription>
                    Share this link with community members for a quick and easy way to join the raid pile.
                </CardDescription>
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

export function RaidPileClientPage({
  initialRaidPiles,
  leaderboardData,
  isLoading: initialIsLoading,
  parentDomain,
}: RaidPileClientPageProps) {
  const { selectedGuild: guildId } = useCommunity();
  const [raidPiles, setRaidPiles] = useState<RaidPile[]>(initialRaidPiles);
  const [isLoading, setIsLoading] = useState(initialIsLoading);
  
  useEffect(() => {
    setRaidPiles(initialRaidPiles);
    setIsLoading(initialIsLoading);
  }, [initialRaidPiles, initialIsLoading]);

  const pileHolder = raidPiles.length > 0 ? raidPiles[0].holder : null;
  const otherLiveUsers =
    raidPiles.length > 0
      ? raidPiles[0].liveUsers.filter((u) => u.twitchId !== pileHolder?.twitchId)
      : [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-headline flex items-center gap-3">
          <Swords className="h-8 w-8 text-primary" />
          Raid Pile
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          The dynamic queue to be the next one raided by the community. Join the
          pile by interacting with the bot in Discord!
        </p>
      </div>
      
       {isLoading && (
        <div className="text-center py-8 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          <p>Loading streamers...</p>
        </div>
      )}

      {!isLoading && pileHolder && (
        <Card key={pileHolder.twitchId} className="overflow-hidden bg-gradient-to-tr from-primary/10 to-card border-primary/20">
          <div className="grid md:grid-cols-3">
            <div className="md:col-span-2 aspect-video bg-muted">
              {parentDomain && (
                <iframe
                  src={`https://player.twitch.tv/?channel=${pileHolder.twitchLogin.toLowerCase()}&parent=${parentDomain}&autoplay=true&muted=true`}
                  height="100%"
                  width="100%"
                  allowFullScreen={true}
                  className="border-0"
                ></iframe>
              )}
            </div>
            <div className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                    <Crown className="text-accent h-6 w-6" />
                    <h3 className="font-headline text-lg">
                       Raid Pile Holder
                    </h3>
                </div>
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12 border-2 border-accent">
                    <AvatarImage
                      src={pileHolder.avatarUrl}
                      alt={pileHolder.displayName}
                      data-ai-hint="streamer avatar"
                    />
                    <AvatarFallback>
                      {pileHolder.displayName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 truncate">
                    <p className="font-bold font-headline text-lg truncate">
                      {pileHolder.displayName}
                    </p>
                    <p
                      className="text-sm text-muted-foreground truncate"
                      title={pileHolder.latestGameName}
                    >
                      {pileHolder.latestGameName || "No game specified"}
                    </p>
                  </div>
                </div>
                <p
                  className="text-xs text-muted-foreground mt-2 truncate"
                  title={pileHolder.latestStreamTitle}
                >
                  {pileHolder.latestStreamTitle || "No title"}
                </p>
              </div>
              <Button asChild className="w-full mt-4">
                <Link
                  href={`https://twitch.tv/${pileHolder.twitchLogin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Twitch className="mr-2 h-4 w-4" />
                  Watch on Twitch
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      )}

       <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <QuickLinkCard />
             <LeaderboardCard leaderboardData={leaderboardData} isLoading={isLoading} />
        </div>


      {!isLoading && otherLiveUsers.length > 0 && (
         <Card>
            <CardHeader>
                <CardTitle>Next in the Pile ({otherLiveUsers.length})</CardTitle>
                <CardDescription>Other members who are live and waiting.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {otherLiveUsers.map((streamer) => (
                    <Card key={streamer.twitchId} className="flex flex-col overflow-hidden">
                        <div className="relative aspect-video bg-muted rounded-t-lg">
                             <Image
                                src={`https://static-cdn.jtvnw.net/previews-ttv/live_user_${streamer.twitchLogin}-440x248.jpg`}
                                alt={`Thumbnail for ${streamer.displayName}`}
                                fill
                                sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 100vw"
                                className="object-cover"
                                data-ai-hint="stream thumbnail"
                               />
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
                ))}
            </CardContent>
        </Card>
      )}

      {!isLoading && !pileHolder && (
         <Card>
            <CardContent>
                 <div className="col-span-full text-center py-16">
                    <p className="text-muted-foreground">
                        No one is in the pile right now.
                    </p>
                </div>
            </CardContent>
         </Card>
      )}
    </div>
  );
}
