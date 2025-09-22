
"use client"

import { getLiveCommunityPoolUsers } from "@/app/actions";
import { CommunityPoolClientPage } from "@/app/community-pool/community-pool-client-page";
import { AppLayout } from "@/components/layout/app-layout";
import { useEffect, useState, Suspense } from "react";
import type { LiveUser } from "@/app/raid-pile/types";
import { useSearchParams } from "next/navigation";
import { getAdminDb } from "@/lib/firebase-admin"; // This is a server import, can't be used directly
import { doc, getDoc, getFirestore } from "firebase/firestore";
import { getClientApp } from "@/lib/firebase";


function CommunityPoolPageContent() {
    const [guildId, setGuildId] = useState<string | null>(null);
    const [initialUsers, setInitialUsers] = useState<LiveUser[]>([]);
    const [spotlightTwitchId, setSpotlightTwitchId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const searchParams = useSearchParams();
    const isEmbedded = searchParams.has("frame_id");

    useEffect(() => {
        const selectedGuildId = localStorage.getItem('selectedGuildId');
        setGuildId(selectedGuildId);

        async function fetchData() {
            if (!selectedGuildId) {
                console.log("No guild ID found, skipping data fetch.");
                setIsLoading(false);
                return;
            };
            setIsLoading(true);

            // Fetch users and spotlight info in parallel
            const users = await getLiveCommunityPoolUsers(selectedGuildId);
            setInitialUsers(users);

            try {
                const db = getFirestore(getClientApp());
                const settingsDocRef = doc(db, `communities/${selectedGuildId}/settings/communityPoolChannel`);
                const settingsDoc = await getDoc(settingsDocRef);
                if (settingsDoc.exists()) {
                    setSpotlightTwitchId(settingsDoc.data().spotlightTwitchId || null);
                }
            } catch (error) {
                console.error("Error fetching spotlight user:", error);
                setSpotlightTwitchId(null);
            }

            setIsLoading(false);
        }

        fetchData();
    }, []);
    
    const pageContent = (
         <CommunityPoolClientPage
            initialUsers={initialUsers}
            spotlightTwitchId={spotlightTwitchId}
            isLoading={isLoading}
            guildId={guildId || ""}
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


function CommunityPoolPageWrapper() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center">Loading Community Pool...</div>}>
      <CommunityPoolPageContent/>
    </Suspense>
  );
}

export default CommunityPoolPageWrapper
    
    
