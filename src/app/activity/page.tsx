
"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import RaidPilePageWrapper from "@/app/raid-pile/page";
import CommunityPoolPageWrapper from "@/app/community-pool/page";
import VipLivePageWrapper from "@/app/vip-live/page";
import RaidTrainPageWrapper from "@/app/raid-train/page";
import CalendarPageWrapper from "@/app/calendar/page";
import { Loader2 } from "lucide-react";

function ActivityPageContent() {
    const searchParams = useSearchParams();
    const [pageContent, setPageContent] = useState<React.ReactNode | null>(null);

    useEffect(() => {
        const custom = searchParams.get('custom');
        const guildIdFromParams = searchParams.get('guild_id'); // Discord now passes this automatically

        // Store the guildId in localStorage for use by the embedded pages
        if (guildIdFromParams) {
            localStorage.setItem('selectedGuildId', guildIdFromParams);
        }

        if (custom) {
            try {
                const { pagePath } = JSON.parse(decodeURIComponent(custom));
                
                if (pagePath) {
                    switch (pagePath) {
                        case "/raid-pile":
                            setPageContent(<RaidPilePageWrapper />);
                            break;
                        case "/community-pool":
                            setPageContent(<CommunityPoolPageWrapper />);
                            break;
                        case "/vip-live":
                            setPageContent(<VipLivePageWrapper />);
                            break;
                        case "/raid-train":
                            setPageContent(<RaidTrainPageWrapper />);
                            break;
                        case "/calendar":
                            setPageContent(<CalendarPageWrapper />);
                            break;
                        default:
                            setPageContent(<div>Error: Unknown activity page requested.</div>);
                    }
                } else {
                     setPageContent(<div>Error: Invalid custom data from bot. Missing `pagePath`.</div>);
                }
            } catch (e) {
                console.error("Failed to parse custom activity params", e);
                setPageContent(<div>Error: Could not load activity. Invalid custom parameter.</div>);
            }
        } else {
            setPageContent(<div>Error: This page must be launched as a Discord Activity.</div>);
        }
    }, [searchParams]);

    if (!pageContent) {
        return (
            <div className="flex h-screen w-full items-center justify-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p>Loading Activity...</p>
            </div>
        )
    }

    return <>{pageContent}</>;
}


export default function ActivityPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ActivityPageContent />
        </Suspense>
    )
}
    
