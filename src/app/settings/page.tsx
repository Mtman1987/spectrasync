
"use client";

import { Suspense, useEffect, useState } from "react";
import { SettingsClientPage } from "./settings-client";
import { redirect } from "next/navigation";
import { getAdminInfo } from "@/app/actions";
import { useCommunity } from "@/context/community-context";

export default function SettingsPage() {
    const { adminId, selectedGuild, loading: communityLoading } = useCommunity();
    const [initialCommunityInfo, setInitialCommunityInfo] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (communityLoading) {
            return; // Wait for community context to be ready
        }
        
        if (!adminId) {
            redirect('/');
            return;
        }

        if (!selectedGuild) {
            redirect('/');
            return;
        }
        
        async function fetchInfo() {
            const { value: adminData } = await getAdminInfo(adminId!);
            const communityInfo = adminData?.discordUserGuilds?.find((g: any) => g.id === selectedGuild) || null;
            setInitialCommunityInfo(communityInfo);
            setLoading(false);
        }

        fetchInfo();

    }, [adminId, selectedGuild, communityLoading]);

    if (loading || communityLoading) {
         return <div className="flex h-screen w-full items-center justify-center">Loading Settings...</div>;
    }

    return (
        <Suspense fallback={<div className="flex h-screen w-full items-center justify-center">Loading Settings...</div>}>
           <SettingsClientPage guildId={selectedGuild!} initialCommunityInfo={initialCommunityInfo} />
        </Suspense>
    )
}
