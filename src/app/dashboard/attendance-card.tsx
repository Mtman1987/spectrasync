
"use client";

import { useState, useTransition, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getAttendanceRecord } from "./actions";
import { Loader2, Search, History } from "lucide-react";
import { useCommunity } from "@/context/community-context";

export function AttendanceCard() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [userId, setUserId] = useState("");
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const { selectedGuild: guildId } = useCommunity();
  
  const handleSearch = async () => {
    if (!guildId) {
      toast({ title: "Error", description: "Community ID not found.", variant: "destructive" });
      return;
    }
    if (!userId.trim()) {
      toast({ title: "Error", description: "Please enter a User ID.", variant: "destructive" });
      return;
    }
    
    setSearchResult(null);
    startTransition(async () => {
      const result = await getAttendanceRecord(guildId, userId.trim());
      if (result.success) {
        setSearchResult(`${result.userName} has been in ${result.count} community raids.`);
      } else {
        setSearchResult(result.error || "An unknown error occurred.");
         toast({ title: "Error", description: result.error, variant: "destructive" });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-headline">
            <History />
            Raid Attendance
        </CardTitle>
        <CardDescription>
            Check a user&apos;s raid participation history by their Discord ID or Twitch ID.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex w-full items-center space-x-2">
            <Input
                type="text"
                placeholder="Enter User ID..."
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={isPending}
            />
            <Button type="button" size="icon" onClick={handleSearch} disabled={isPending || !guildId}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="sr-only">Search</span>
            </Button>
        </div>
        
        {searchResult && (
            <div className="p-4 bg-muted/50 rounded-lg text-center">
                <p className="font-semibold text-muted-foreground">{searchResult}</p>
            </div>
        )}
      </CardContent>
    </Card>
  );
}

