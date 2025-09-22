
"use client"

import React, { useState, useEffect, useCallback, useTransition, Suspense } from "react"
import { Calendar } from "@/components/ui/calendar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Users, Crown, Rocket, Loader2, Shield, Megaphone, UserPlus, AlertCircle } from "lucide-react"
import { AppLayout } from "@/components/layout/app-layout"
import { getCalendarEvents, type CalendarEvent, getAnnouncementSignups, signUpForAnnouncement, type AnnouncementSignup } from "@/app/calendar/actions"
import { AddEventForm } from "@/app/calendar/add-event-form"
import { Button } from "@/components/ui/button"
import { format, startOfDay } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { DayContent, DayContentProps } from "react-day-picker"
import { useSearchParams } from "next/navigation"
import { useCommunity } from "@/context/community-context"


const eventIcons = {
  Community: Users,
  VIP: Crown,
  Raid: Rocket,
  Admin: Shield,
};

function CalendarPageContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const { selectedGuild: guildId, adminId: adminDiscordId, loading: communityLoading } = useCommunity();
  
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [signups, setSignups] = useState<{ [day: string]: AnnouncementSignup }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const fetchData = useCallback(async (gId: string, date: Date) => {
    setIsLoading(true);
    const monthKey = format(date, 'yyyy-MM');
    const [fetchedEvents, fetchedSignups] = await Promise.all([
        getCalendarEvents(gId),
        getAnnouncementSignups(gId, monthKey)
    ]);
    setEvents(fetchedEvents);
    setSignups(fetchedSignups);
    setIsLoading(false);
  }, []);


  useEffect(() => {
    if (guildId && !communityLoading) {
        fetchData(guildId, currentMonth);
    } else if (!communityLoading) {
        setIsLoading(false);
    }
  }, [fetchData, currentMonth, guildId, communityLoading]);

  const handleMonthChange = (month: Date) => {
    setCurrentMonth(month);
    // This will trigger the useEffect to refetch data for the new month
  };
  
  const executeSignUp = async (discordId: string) => {
     if (!selectedDate) {
        toast({ title: "No Date Selected", description: "Please select an available date.", variant: "destructive" });
        return;
    }
    
    if (!guildId) {
        toast({ title: "Error", description: "Guild ID not configured.", variant: "destructive" });
        return;
    }

    startTransition(async () => {
        const monthKey = format(selectedDate, 'yyyy-MM');
        const dayKey = format(selectedDate, 'dd');
        // The emoji is no longer needed here.
        const result = await signUpForAnnouncement(guildId, monthKey, dayKey, discordId);

        if (result.success) {
            toast({ title: "Spot Claimed!", description: `You signed up for announcements on ${format(selectedDate, 'MMMM do')}. ${result.message}` });
            if (guildId) {
                fetchData(guildId, currentMonth); // Refresh data
            }
        } else {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        }
    });
  }

  const handleSignUp = () => {
    if (adminDiscordId) {
        executeSignUp(adminDiscordId);
    } else {
        toast({ title: "Error", description: "Could not find your user ID. Please log in again.", variant: "destructive" });
    }
  }
  
  const userSignupsThisMonth = adminDiscordId ? Object.values(signups).filter(s => s.userId === adminDiscordId).length : 0;
  const isDateTaken = selectedDate && signups[format(selectedDate, 'dd')];
  const canSignUp = adminDiscordId && userSignupsThisMonth < 5 && !isDateTaken;
  
  const CustomDay = (props: DayContentProps) => {
    const dayKey = format(props.date, 'dd');
    const signup = signups[dayKey];
    if (signup) {
      return (
        <div className="relative w-full h-full flex items-center justify-center">
            <DayContent {...props} />
            <Avatar className="absolute bottom-0 right-0 h-4 w-4 z-0 opacity-80" title={signup.userName}>
                <AvatarImage src={signup.userAvatar} alt={signup.userName} />
                <AvatarFallback>{signup.userName.charAt(0)}</AvatarFallback>
            </Avatar>
        </div>
      )
    }
    return <DayContent {...props} />;
  }

  const isEmbedded = searchParams.has("frame_id");
  const pageContent = (
      <div className="flex flex-col gap-8">
      <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-headline">
              Community Calendar
            </h1>
            <p className="text-muted-foreground">
              Schedule of community events and announcement roster.
            </p>
          </div>
      </div>

       {!guildId && !isLoading && !communityLoading && (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Community Not Found</AlertTitle>
                <AlertDescription>
                    Could not find a community ID. Please select a community from the sidebar or link one in settings.
                </AlertDescription>
            </Alert>
        )}

      {adminDiscordId && (
          <Alert variant={userSignupsThisMonth >= 5 ? "destructive" : "default"}>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Your Announcement Signups</AlertTitle>
              <AlertDescription>
                  You have claimed {userSignupsThisMonth} out of 5 available announcement spots for {format(currentMonth, 'MMMM')}.
              </AlertDescription>
          </Alert>
      )}

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
             <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-headline">
                      <Megaphone className="text-primary"/>
                      Captain&apos;s Log Roster
                  </CardTitle>
                  <CardDescription>
                      {adminDiscordId ? "Select an available day to sign up for announcement duties. Mods can claim up to 5 spots per month." : "Admin ID not configured."}
                  </CardDescription>
              </CardHeader>
            <CardContent className="p-0 flex justify-center">
                <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    month={currentMonth}
                    onMonthChange={handleMonthChange}
                    disabled={(date) => date < startOfDay(new Date()) || !!signups[format(date, 'dd')] || !guildId}
                    footer={
                      <div className="mt-4 flex flex-col gap-4 p-4 pt-0">
                          <div className="flex flex-col sm:flex-row justify-center gap-2">
                              <AddEventForm onEventAdded={() => guildId && fetchData(guildId, currentMonth)} guildId={guildId} />
                              <Button onClick={handleSignUp} disabled={(!canSignUp && !!adminDiscordId) || isPending} className="w-full sm:w-auto">
                                  {isPending ? <Loader2 className="mr-2 animate-spin" /> : <UserPlus className="mr-2" />}
                                  {isDateTaken ? "Spot Taken" : (!canSignUp && !!adminDiscordId) ? "Limit Reached" : "Claim Announcement Spot"}
                              </Button>
                          </div>
                      </div>
                    }
                    components={{
                      DayContent: CustomDay,
                   }}
                />
            </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="font-headline">Upcoming Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading && (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            )}
            {!isLoading && events.length === 0 && (
              <p className="text-muted-foreground text-center">No upcoming events.</p>
            )}
            {!isLoading && events.map((event) => {
              const Icon = eventIcons[event.type as keyof typeof eventIcons] || Users;
              return (
                  <div key={event.id} className="flex items-start gap-4">
                    {Icon && <Icon className="h-5 w-5 text-primary mt-1" />}
                    <div>
                      <p className="font-semibold">{event.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(event.date).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          timeZone: "UTC",
                        })}{" "}
                        at {event.time}
                      </p>
                    </div>
                  </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  if (isEmbedded) {
    return <div className="p-4 bg-background">{pageContent}</div>;
  }

  return <AppLayout>{pageContent}</AppLayout>;
}

function CalendarPageWrapper() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center">Loading Calendar...</div>}>
      <CalendarPageContent/>
    </Suspense>
  );
}

export default CalendarPageWrapper;


