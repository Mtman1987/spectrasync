
// src/app/page.tsx
"use client"

import { SetupClient } from "@/app/setup-client";
import { CosmicRaidLogo } from "@/components/icons";
import { getAdminInfo } from "./actions";
import { redirect, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useCommunity } from "@/context/community-context";


export default function HomePage() {
    const searchParams = useSearchParams();
    const errorFromQuery = searchParams.get('error');
    const adminIdFromQuery = searchParams.get('adminId');
    const { selectedGuild, adminId, setAdminId, loading: communityLoading } = useCommunity();

    useEffect(() => {
        // This effect handles setting the admin ID from the URL query param
        // on initial login, or loading it from localStorage on subsequent visits.
        if (adminIdFromQuery && adminIdFromQuery !== adminId) {
            setAdminId(adminIdFromQuery);
            // Clean the URL
            window.history.replaceState(null, '', '/');
        }
    }, [adminIdFromQuery, adminId, setAdminId]);
    
    // This effect handles redirecting an already-logged-in user to the dashboard.
    useEffect(() => {
        if (!communityLoading && selectedGuild) {
             redirect('/dashboard');
        }
    }, [selectedGuild, communityLoading]);

    if (communityLoading) {
        return <SetupPage><p>Loading Community...</p></SetupPage>
    }

    // If there is no adminId after loading, it means the user is logged out.
    // Show the setup client which contains the "Connect Discord" button.
    if (!adminId) {
         return (
            <SetupPage>
                <SetupClient 
                    user={null}
                    adminGuilds={[]}
                    error={errorFromQuery}
                    adminDiscordId={null}
                />
            </SetupPage>
        );
    }
    
    // If there is an adminId, we are in a logged-in state.
    // The SetupLoader will fetch the admin's guilds and show the selection UI.
    return (
        <SetupPage>
            <SetupLoader adminDiscordId={adminId} error={errorFromQuery} />
        </SetupPage>
    )
}

function SetupLoader({ adminDiscordId, error }: { adminDiscordId: string, error: string | null }) {
    const [data, setData] = useState<{ user: any, guilds: any[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(error);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            const { value: adminData, error: adminError } = await getAdminInfo(adminDiscordId);
            
            if (adminError) {
                setFetchError(adminError);
            } else if (adminData) {
                setData({
                    user: adminData.discordInfo || null,
                    guilds: adminData.discordUserGuilds || [],
                });
            } else {
                 setFetchError("Could not load your admin profile. Please try logging in again.");
            }
            setLoading(false);
        }
        fetchData();
    }, [adminDiscordId]);

    if (loading) {
        return <p>Loading your profile...</p>;
    }

    return (
        <SetupClient
            user={data?.user}
            adminGuilds={data?.guilds || []}
            error={fetchError}
            adminDiscordId={adminDiscordId}
        />
    )
}


function SetupPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-4">
      <div className="max-w-2xl text-center w-full">
        <CosmicRaidLogo className="h-16 w-16 mx-auto text-primary mb-4" />
        <h1 className="text-4xl font-bold font-headline mb-2">
            Welcome to Cosmic Raid
        </h1>
        {children}
      </div>
    </div>
  );
}
