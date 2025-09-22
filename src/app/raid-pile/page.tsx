
"use client"

import { getLiveRaidPiles } from "@/app/actions";
import { RaidPileClientPage } from "@/app/raid-pile/raid-pile-client-page";
import { AppLayout } from "@/components/layout/app-layout";
import { useEffect, useState, Suspense } from "react";
import type { RaidPile } from "@/app/raid-pile/types";
import { useSearchParams } from "next/navigation";
import { getLeaderboard, type LeaderboardUser } from "@/app/leaderboard/actions";
import { useCommunity } from "@/context/community-context";

function RaidPilePageContent() {
    const { selectedGuild: guildId, loading: communityLoading } = useCommunity();
    const [initialRaidPiles, setInitialRaidPiles] = useState<RaidPile[]>([]);
    const [leaderboardData, setLeaderboardData] = useState<LeaderboardUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [parentDomain, setParentDomain] = useState("");
    const searchParams = useSearchParams();
    const isEmbedded = searchParams.has("frame_id");

    useEffect(() => {
        setParentDomain(window.location.hostname);
    }, []);

    useEffect(() => {
        async function fetchData() {
            if (!guildId) {
                console.log("No guild ID found, skipping data fetch.");
                setIsLoading(false);
                return;
            };
            setIsLoading(true);
            const [piles, leaderboard] = await Promise.all([
                getLiveRaidPiles(guildId),
                getLeaderboard(guildId)
            ]);
            setInitialRaidPiles(piles);
            setLeaderboardData(leaderboard);
            setIsLoading(false);
        }

        if (!communityLoading) {
            fetchData();
        }
    }, [guildId, communityLoading]);
    
    const pageContent = (
         <RaidPileClientPage
            initialRaidPiles={initialRaidPiles}
            leaderboardData={leaderboardData}
            isLoading={isLoading}
            parentDomain={parentDomain}
          />
    );

    if (isEmbedded) {
        return <div className="p-4 bg-background">{pageContent}</div>;
    }

    return (
        <AppLayout>
           {pageContent}
        </AppLayout>
    );
}

function RaidPilePageWrapper() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center">Loading Raid Pile...</div>}>
      <RaidPilePageContent />
    </Suspense>
  );
}

export default RaidPilePageWrapper;
    
    
