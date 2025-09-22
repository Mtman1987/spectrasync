
"use client"

import React, { useState, useEffect, useTransition, useMemo, Suspense, useCallback } from "react"
import { format, isSameDay, getHours } from "date-fns"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Train, Crown, CalendarDays, Loader2, Link2 } from "lucide-react"
import { AppLayout } from "@/components/layout/app-layout"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { useToast } from "@/hooks/use-toast"
import { useRouter, useSearchParams } from "next/navigation"
import { getRaidTrainSchedule, getLiveRaidTrainUsers } from "@/app/raid-train/actions";
import { getLeaderboard } from "@/app/leaderboard/actions";
import { LeaderboardCard } from "@/components/leaderboard-card"
import type { LeaderboardUser } from "@/app/leaderboard/actions"
import type { Signup, EmergencySignup, BlockedSignup } from "@/app/raid-train/actions"
import type { LiveUser } from "@/app/raid-pile/types"
import Link from "next/link"
import { Twitch } from "@/components/icons"
import { useCommunity } from "@/context/community-context"
import { RaidTrainSettingsForm } from "./raid-train-settings-form"
import { AttendanceCard } from "../dashboard/attendance-card"
import { Input } from "@/components/ui/input"
import { getSettings } from "@/app/settings/actions"

function QuickLinkCard() {
    const { toast } = useToast();
    const [quickLink, setQuickLink] = useState("");
    const { selectedGuild: guildId } = useCommunity();

    useEffect(() => {
        if (guildId) {
            getSettings(guildId).then(settings => {
                const url = new URL("/join?action=raid-train", settings.appBaseUrl);
                setQuickLink(url.toString());
            });
        }
    }, [guildId]);

    const copyLink = () => {
        navigator.clipboard.writeText(quickLink);
        toast({
            title: "Link Copied!",
            description: "The quick sign up link has been copied to your clipboard.",
        });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Quick Sign Up Link</CardTitle>
                <CardDescription>Share this link with members for an easy way to sign up for the raid train.</CardDescription>
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

function RaidTrainPageContent() {
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const { selectedGuild: guildId, loading: communityLoading } = useCommunity();

    const [isPending, startTransition] = useTransition();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [signups, setSignups] = useState<{ [key: string]: Signup | EmergencySignup }>({});
    const [leaderboardData, setLeaderboardData] = useState<LeaderboardUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [liveUsers, setLiveUsers] = useState<LiveUser[]>([]);
    const [parentDomain, setParentDomain] = useState("");
    const isEmbedded = searchParams.has("frame_id");
    
    useEffect(() => {
        setParentDomain(window.location.hostname);
    }, []);

    const fetchRaidTrainData = useCallback(() => {
         const dateKey = format(selectedDate, 'yyyy-MM-dd');
        if (guildId && !communityLoading) {
             setIsLoading(true);
             startTransition(async () => {
                const [scheduleData, boardData, liveTrainUsers] = await Promise.all([
                    getRaidTrainSchedule(guildId, dateKey),
                    getLeaderboard(guildId),
                    getLiveRaidTrainUsers(guildId, dateKey),
                ]);
                
                setSignups(scheduleData);
                setLeaderboardData(boardData);
                setLiveUsers(liveTrainUsers);
                setIsLoading(false);
            });
        } else if (!communityLoading) {
            setIsLoading(false);
        }
    }, [selectedDate, guildId, communityLoading])

    useEffect(() => {
       fetchRaidTrainData();
    }, [fetchRaidTrainData]);

    
    const raidTrainHolder = useMemo(() => {
        if (!isSameDay(new Date(), selectedDate)) return null;

        const signupsForDay = signups || {};
        const liveUserIds = new Set(liveUsers.map(u => u.twitchId));

        for (let i = getHours(new Date()); i >= 0; i--) {
            const slot = `${i.toString().padStart(2, '0')}:00`;
            const signup = signupsForDay[slot];
            if (signup && signup.id !== 'emergency' && liveUserIds.has(signup.id)) {
                const liveUser = liveUsers.find(u => u.twitchId === signup.id);
                return liveUser;
            }
        }
        return null;
    }, [signups, liveUsers, selectedDate]);


     const pageContent = (
        <div className="flex flex-col gap-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight font-headline flex items-center gap-3">
                    <Train className="h-8 w-8 text-primary" />
                    Raid Train
                </h1>
                <p className="text-muted-foreground">
                    Start or join a sequential chain of raids, passing the hype from one streamer to the next.
                </p>
            </div>
            
            <Card className="bg-gradient-to-br from-primary/10 to-card border-primary/20 overflow-hidden">
                 {raidTrainHolder ? (
                    <CardContent className="p-0 grid md:grid-cols-3">
                         <div className="md:col-span-2 aspect-video bg-muted">
                           {parentDomain && (
                               <iframe
                                   src={`https://player.twitch.tv/?channel=${raidTrainHolder.twitchLogin.toLowerCase()}&parent=${parentDomain}&autoplay=true&muted=true`}
                                   height="100%"
                                   width="100%"
                                   allowFullScreen={true}
                                   className="border-0"
                               ></iframe>
                           )}
                       </div>
                        <div className="p-6 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <Crown className="text-accent h-6 w-6" />
                                    <h3 className="font-headline text-lg">
                                       Current Raid Train Holder
                                    </h3>
                                </div>
                               <div className="flex items-center gap-4">
                                   <Avatar className="h-12 w-12 border-2 border-accent">
                                       <AvatarImage src={raidTrainHolder.avatarUrl} alt={raidTrainHolder.displayName} data-ai-hint="streamer avatar" />
                                       <AvatarFallback>{raidTrainHolder.displayName.charAt(0)}</AvatarFallback>
                                   </Avatar>
                                   <div>
                                       <h3 className="text-xl font-bold text-accent font-headline">{raidTrainHolder.displayName}</h3>
                                       <p className="text-sm text-muted-foreground">
                                           Playing <span className="font-semibold text-foreground">{raidTrainHolder.latestGameName || 'N/A'}</span>
                                       </p>
                                   </div>
                               </div>
                           </div>
                           <div className="flex flex-col sm:flex-row gap-2 mt-4">
                                <Button asChild className="w-full">
                                   <Link href={`https://twitch.tv/${raidTrainHolder.twitchLogin.toLowerCase()}`} target="_blank" rel="noopener noreferrer">
                                       <Twitch className="mr-2 h-4 w-4" />
                                       Watch on Twitch
                                   </Link>
                               </Button>
                           </div>
                       </div>
                   </CardContent>
                ) : (
                     <CardContent className="p-6 flex items-center justify-center min-h-[250px]">
                        <div className="text-center">
                            <p className="text-lg font-semibold text-muted-foreground">
                                 The Raid Train is currently empty.
                            </p>
                            <p className="text-sm text-muted-foreground">No scheduled streamers are live in the current or previous time slots for today.</p>
                        </div>
                    </CardContent>
                )}
            </Card>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                 <RaidTrainSettingsForm onSettingsSaved={fetchRaidTrainData} />
                 <LeaderboardCard leaderboardData={leaderboardData} isLoading={isLoading} />
                 <AttendanceCard />
                 <QuickLinkCard />
            </div>
        </div>
    );

    if (isEmbedded) {
        return pageContent;
    }
    
    return <AppLayout>{pageContent}</AppLayout>
}

export function RaidTrainPageWrapper() {
    return (
      <Suspense fallback={<div className="flex h-screen w-full items-center justify-center">Loading Raid Train...</div>}>
        <RaidTrainPageContent />
      </Suspense>
    )
}
      
export default RaidTrainPageWrapper;





