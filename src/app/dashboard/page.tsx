
"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar, Crown, Swords, Loader2, Activity } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { useEffect, useState } from "react";
import { getCalendarEvents, type CalendarEvent } from "@/app/calendar/actions";
import { getActivityFeed, type ActivityEvent } from "@/app/dashboard/actions";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PointSystemForm } from "@/app/settings/point-system-form";
import { Rocket, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AttendanceCard } from "@/app/dashboard/attendance-card";
import { redirect } from "next/navigation";
import { useCommunity } from "@/context/community-context";

const eventIcons = {
  Community: Users,
  VIP: Crown,
  Raid: Rocket,
  Admin: Swords,
};

export default function DashboardPage() {
  const { selectedGuild: guildId, loading: communityLoading } = useCommunity();
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);

  useEffect(() => {
    if (communityLoading) return; // Wait for context to load
    if (!guildId) {
        redirect('/');
        return;
    }
    
    const fetchEvents = async () => {
      if (guildId) {
        setIsLoadingEvents(true);
        const allEvents = await getCalendarEvents(guildId);
        const futureEvents = allEvents
          .filter(event => new Date(event.date) >= new Date())
          .slice(0, 4); 
        setUpcomingEvents(futureEvents);
        setIsLoadingEvents(false);
      } else {
        setIsLoadingEvents(false);
      }
    };
    
    const fetchActivity = async () => {
        if(guildId) {
            setIsLoadingActivity(true);
            const feed = await getActivityFeed(guildId);
            setActivityFeed(feed);
            setIsLoadingActivity(false);
        } else {
            setIsLoadingActivity(false);
        }
    };
    
    if (guildId) {
        fetchEvents();
        fetchActivity();
    } else {
        setIsLoadingActivity(false);
        setIsLoadingEvents(false);
    }
  }, [guildId, communityLoading]);
  
  if (communityLoading) {
    return (
       <AppLayout>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="ml-2">Loading Community...</p>
          </div>
       </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground">
            Welcome back! Here&apos;s what&apos;s happening in your community.
          </p>
        </div>
        
        <div className="grid gap-6 lg:grid-cols-4">
            <div className="lg:col-span-3 grid gap-6 md:grid-cols-3">
                 <Card>
                    <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-headline">
                        <Swords className="w-5 h-5 text-primary" />
                        Raid Pile
                    </CardTitle>
                    <CardDescription>
                        Manage the live raid queue for your members.
                    </CardDescription>
                    </CardHeader>
                    <CardContent>
                    <Button asChild>
                        <Link href="/raid-pile">View Raid Pile <ArrowRight /></Link>
                    </Button>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-headline">
                        <Rocket className="w-5 h-5 text-primary" />
                        Raid Train
                    </CardTitle>
                    <CardDescription>
                        Schedule and manage your next community raid.
                    </CardDescription>
                    </CardHeader>
                    <CardContent>
                    <Button asChild>
                        <Link href="/raid-train">View Raid Train <ArrowRight /></Link>
                    </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-headline">
                        <Crown className="w-5 h-5 text-primary" />
                        VIP Management
                    </CardTitle>
                    <CardDescription>
                        Add or remove designated community VIPs.
                    </CardDescription>
                    </CardHeader>
                    <CardContent>
                    <Button asChild>
                        <Link href="/settings">Manage VIPs <ArrowRight /></Link>
                    </Button>
                    </CardContent>
                </Card>

                 <Card className="md:col-span-3">
                    <CardHeader>
                    <CardTitle className="font-headline">Upcoming Events</CardTitle>
                    <CardDescription>
                        What&apos;s next on the community calendar.
                    </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                    {isLoadingEvents && (
                        Array.from({ length: 4 }).map((_, index) => (
                            <Card key={index}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
                        ))
                    )}
                    {!isLoadingEvents && upcomingEvents.length === 0 && (
                        <p className="text-muted-foreground text-center col-span-full py-4">No upcoming events scheduled.</p>
                    )}
                    {!isLoadingEvents && upcomingEvents.map((event) => {
                        const Icon = eventIcons[event.type] || Calendar;
                        return (
                        <Card key={event.id}>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">
                                {event.name}
                            </CardTitle>
                            <Icon className="w-4 h-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                            <div className="text-lg font-bold">
                                {new Date(event.date).toLocaleDateString("en-US", {
                                    month: "long",
                                    day: "numeric",
                                    timeZone: "UTC",
                                })}
                            </div>
                            <p className="text-xs text-muted-foreground">{event.time}</p>
                            </CardContent>
                        </Card>
                        )
                    })}
                    </CardContent>
                </Card>

            </div>
            <div className="lg:col-span-1">
                 <PointSystemForm />
            </div>

        </div>

         <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-headline">
                <Activity className="w-5 h-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-72">
                <div className="space-y-4 pr-4">
                  {isLoadingActivity && (
                      Array.from({ length: 5 }).map((_, index) => (
                        <div key={index} className="flex items-center gap-3">
                          <Skeleton className="h-10 w-10 rounded-full" />
                          <Skeleton className="h-4 w-3/4" />
                        </div>
                      ))
                  )}
                  {!isLoadingActivity && activityFeed.length === 0 && (
                      <p className="text-muted-foreground text-center py-4">No recent activity to show.</p>
                  )}
                  {!isLoadingActivity && activityFeed.map((item, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={item.user.avatar} alt={item.user.name} data-ai-hint="person face" />
                        <AvatarFallback>{item.user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{item.user.name}</span> {item.action} <span className="font-semibold text-primary">{item.target}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
      </div>
    </AppLayout>
  );
}


