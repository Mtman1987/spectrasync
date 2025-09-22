
"use client"

import { getLiveVipUsers } from "@/app/actions";
import { VipLiveClientPage } from "@/app/vip-live/vip-live-client-page";
import { AppLayout } from "@/components/layout/app-layout";
import { useEffect, useState, Suspense, useCallback } from "react";
import type { LiveUser } from "@/app/raid-pile/types";
import { useSearchParams } from "next/navigation";
import { useCommunity } from "@/context/community-context";
import { getAdminDb } from "@/lib/firebase-admin"; // Cannot be used on client
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";
import { getClientApp } from "@/lib/firebase";


function VipLivePageContent() {
    const { selectedGuild: guildId, loading: communityLoading } = useCommunity();
    const [liveVips, setLiveVips] = useState<LiveUser[]>([]);
    const [allVips, setAllVips] = useState<any[]>([]); // To store all VIP user docs
    const [isLoading, setIsLoading] = useState(true);
    const [parentDomain, setParentDomain] = useState("");
    const searchParams = useSearchParams();
    const isEmbedded = searchParams.has("frame_id");

    const fetchData = useCallback(async () => {
        if (!guildId) {
            console.log("No guild ID found, skipping data fetch.");
            setIsLoading(false);
            return;
        };
        setIsLoading(true);

        const db = getFirestore(getClientApp());
        const usersRef = collection(db, `communities/${guildId}/users`);
        const q = query(usersRef, where("isVip", "==", true));
        const vipSnapshot = await getDocs(q);
        const vipDocs = vipSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        setAllVips(vipDocs);
        
        const liveVipUsers = await getLiveVipUsers(guildId);
        setLiveVips(liveVipUsers);

        setIsLoading(false);
    }, [guildId]);

    useEffect(() => {
        setParentDomain(window.location.hostname);
        if (!communityLoading) {
            fetchData();
        }
    }, [communityLoading, fetchData]);
    
    const pageContent = (
         <VipLiveClientPage
            liveVips={liveVips}
            allVips={allVips}
            isLoading={isLoading}
            parentDomain={parentDomain}
            guildId={guildId || ""}
            onVipChanged={fetchData}
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


function VipLivePageWrapper() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center">Loading VIPs...</div>}>
      <VipLivePageContent />
    </Suspense>
  );
}

export default VipLivePageWrapper;
