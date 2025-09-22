
"use client";

import { useEffect, useState } from "react";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { getRaidTrainEmergencies, getRaidTrainNoShows } from "@/app/raid-train/actions";
import { getCalendarEvents, getTodaysAnnouncer } from "@/app/calendar/actions";
import { format } from "date-fns";
import { useCommunity } from "@/context/community-context";

type Notification = {
    title: string;
    description: string;
    href: string;
}

// This is a new server action to consolidate all notification fetching
async function getNotifications(guildId: string): Promise<Notification[]> {
    if (!guildId) return [];

    try {
        const [announcer, emergencies, noShows, events] = await Promise.all([
            getTodaysAnnouncer(guildId),
            getRaidTrainEmergencies(guildId),
            getRaidTrainNoShows(guildId),
            getCalendarEvents(guildId),
        ]);

        const allNotifications: Notification[] = [];

        if (announcer) {
            allNotifications.push({
                title: `Captain's Log Duty: @${announcer.userName}`,
                description: `Today's announcements are by ${announcer.userName}.`,
                href: `/calendar`
            });
        } else {
             allNotifications.push({
                title: "Captain's Log spot is open for today!",
                description: "Click here to go to the calendar and sign up.",
                href: `/calendar`
            });
        }

        emergencies.forEach(e => allNotifications.push({
            title: "Raid Train Emergency!",
            description: `A spot opened up on ${e.date} at ${e.time}.`,
            href: `/raid-train`
        }));

        noShows.forEach(ns => allNotifications.push({
            title: "Raid Train No-Show!",
            description: `${ns.name} missed their ${ns.time} slot.`,
            href: `/raid-train`
        }));
        
        events
            .filter(event => new Date(event.date) >= new Date())
            .slice(0, 3) // Limit to 3 upcoming events
            .forEach(event => allNotifications.push({
                title: `Upcoming: ${event.name}`,
                description: `${format(new Date(event.date), "MMM d")} at ${event.time}`,
                href: `/calendar`
            }));

        return allNotifications;
    } catch (error) {
        console.error("Error fetching notifications:", error);
        return [];
    }
}


export function AppHeader() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { state } = useSidebar();
  const { selectedGuild, adminGuilds } = useCommunity();

  const guildInfo = adminGuilds.find(g => g.id === selectedGuild);

  useEffect(() => {
    async function fetchNotifications() {
      if (selectedGuild) {
        const notifs = await getNotifications(selectedGuild);
        setNotifications(notifs);
      }
    };
    
    fetchNotifications();
    
    // Optional: Set up an interval to refresh notifications periodically
    const intervalId = setInterval(fetchNotifications, 5 * 60 * 1000); // every 5 minutes
    return () => clearInterval(intervalId);

  }, [selectedGuild]);
  

  return (
    <header className={cn(
      "flex h-14 items-center justify-between gap-4 border-b bg-card px-4 lg:h-[60px] lg:px-6 sticky top-0 z-30 transition-all duration-300 ease-in-out",
      "md:pl-[var(--sidebar-width-icon)]",
      state === 'expanded' && "md:pl-[var(--sidebar-width)]"
    )}>
      <SidebarTrigger className="md:hidden" />
      
      <div className="flex-1" />

       <div className="flex items-center gap-2">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="relative">
                        <Bell className="h-4 w-4" />
                        {notifications.length > 0 && (
                            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive border-2 border-card" />
                        )}
                        <span className="sr-only">Notifications</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                    <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {notifications.length > 0 ? notifications.map((notification, index) => (
                         <DropdownMenuItem key={index} asChild>
                            <Link href={notification.href} className="flex flex-col items-start gap-1">
                                <p className="font-semibold">{notification.title}</p>
                                <p className="text-xs text-muted-foreground">{notification.description}</p>
                            </Link>
                         </DropdownMenuItem>
                    )) : (
                        <DropdownMenuItem disabled>No new notifications</DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            {guildInfo && (
                <div className="flex items-center gap-2">
                <span className="font-semibold text-sm hidden sm:inline-block">{guildInfo.name}</span>
                <Avatar className="h-8 w-8">
                    <AvatarImage src={guildInfo.icon ? `https://cdn.discordapp.com/icons/${guildInfo.id}/${guildInfo.icon}.png` : undefined} alt={guildInfo.name} />
                    <AvatarFallback>{guildInfo.name.charAt(0)}</AvatarFallback>
                </Avatar>
                </div>
            )}
       </div>
    </header>
  )
}
