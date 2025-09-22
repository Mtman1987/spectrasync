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

export function AppHeader() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { state } = useSidebar();
  const { selectedGuild, adminGuilds, adminProfile } = useCommunity();

  const guildInfo = adminGuilds.find(g => g.id === selectedGuild);
  const discordInfo = adminProfile?.discordInfo ?? null;
  const twitchInfo = adminProfile?.twitchInfo ?? null;

  useEffect(() => {
    const fetchNotifications = async () => {
      if (selectedGuild) {
        setNotifications([]);
        const allNotifications: Notification[] = [];

        getTodaysAnnouncer(selectedGuild).then(todaysAnnouncer => {
           if (todaysAnnouncer) {
                allNotifications.push({
                    title: `Captain's Log Duty: @${todaysAnnouncer.userName}`,
                    description: `Today's announcements are by ${todaysAnnouncer.userName}.`,
                    href: `/calendar`
                });
            } else {
                allNotifications.push({
                    title: "Captain's Log spot is open for today!",
                    description: "Click here to go to the calendar and sign up.",
                    href: `/calendar`
                });
            }
            setNotifications(prev => [...prev, ...allNotifications]);
        });
        
        getRaidTrainEmergencies(selectedGuild).then(emergencies => {
             const emergencyNotifications = emergencies.map(e => ({
                title: "Raid Train Emergency!",
                description: `A spot opened up on ${e.date} at ${e.time}.`,
                href: `/raid-train`
            }));
            setNotifications(prev => [...prev, ...emergencyNotifications]);
        });
        
        getRaidTrainNoShows(selectedGuild).then(noShows => {
            const noShowNotifications = noShows.map(ns => ({
                title: "Raid Train No-Show!",
                description: `${ns.name} missed their ${ns.time} slot.`,
                href: `/raid-train`
            }));
             setNotifications(prev => [...prev, ...noShowNotifications]);
        });
        
        getCalendarEvents(selectedGuild).then(allEvents => {
            const futureEvents = allEvents.filter(event => new Date(event.date) >= new Date());
            const eventNotifications = futureEvents.map(event => ({
                title: `Upcoming: ${event.name}`,
                description: `${format(new Date(event.date), "MMM d")} at ${event.time}`,
                href: `/calendar`
            }));
             setNotifications(prev => [...prev, ...eventNotifications]);
        });
      }
    };
    if (selectedGuild) {
        fetchNotifications();
    }
  }, [selectedGuild]);
  

  return (
    <header className={cn(
      "flex h-14 items-center justify-between gap-4 border-b bg-card px-4 lg:h-[60px] lg:px-6 sticky top-0 z-30 transition-all duration-300 ease-in-out",
      "md:pl-[var(--sidebar-width-icon)]",
      state === 'expanded' && "md:pl-[var(--sidebar-width)]"
    )}>
      <SidebarTrigger className="md:hidden" />
      
      <div className="flex-1" />

       <div className="flex items-center gap-3">
            {discordInfo && (
              <div className="hidden sm:flex items-center gap-2 rounded-md border px-3 py-1.5">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={twitchInfo?.avatar || discordInfo.avatar || undefined} data-ai-hint="account avatar" />
                  <AvatarFallback>{(twitchInfo?.displayName || discordInfo.username).charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold">{twitchInfo?.displayName || discordInfo.username}</span>
                  <span className="text-xs text-muted-foreground">@{twitchInfo?.login || discordInfo.username}</span>
                </div>
              </div>
            )}

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
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {notifications.map((notification, index) => (
                         <DropdownMenuItem key={index} asChild>
                            <Link href={notification.href} className="flex flex-col items-start gap-1">
                                <p className="font-semibold">{notification.title}</p>
                                <p className="text-xs text-muted-foreground">{notification.description}</p>
                            </Link>
                         </DropdownMenuItem>
                    ))}
                    {notifications.length === 0 && (
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
