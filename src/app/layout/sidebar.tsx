
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { CosmicRaidLogo } from "@/components/icons";
import {
  LayoutDashboard,
  Rocket,
  Sparkles,
  Calendar,
  LineChart,
  Heart,
  Crown,
  Swords,
  MessageSquare,
  Settings,
} from "lucide-react";
import { UserNav } from "./user-nav";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useCommunity } from "@/context/community-context";

const menuItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/raid-pile", label: "Raid Pile", icon: Swords },
  { href: "/raid-train", label: "Raid Train", icon: Rocket },
  { href: "/community-pool", label: "Community Pool", icon: Heart },
  { href: "/vip-live", label: "VIP Live", icon: Crown },
  { href: "/community-spotlight", label: "Spotlight", icon: Sparkles },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/team-chat", label: "Team Chat", icon: MessageSquare },
  { href: "/analytics", label: "Analytics", icon: LineChart },
];

const bottomMenuItems = [
    { href: "/settings", label: "Settings", icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname();
  const { state } = useSidebar();
  const { selectedGuild, setSelectedGuild, loading, adminGuilds } = useCommunity();
  
  const handleGuildChange = (newGuildId: string) => {
      if (newGuildId !== selectedGuild) {
        setSelectedGuild(newGuildId);
      }
  }

  return (
    <Sidebar className="border-r" collapsible="icon">
      <SidebarHeader>
        <Link href={selectedGuild ? `/dashboard` : "/"} className="flex items-center gap-2 p-2">
          <CosmicRaidLogo className="w-8 h-8 text-primary" />
          <span className="text-lg font-semibold tracking-tight font-headline">
            Cosmic Raid
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href}>
                <SidebarMenuButton
                  isActive={pathname.startsWith(item.href)}
                  tooltip={{ children: item.label, side: "right" }}
                  disabled={!selectedGuild}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-2 flex flex-col gap-2">
         <SidebarMenu>
             {bottomMenuItems.map((item) => {
                const isAlwaysEnabled = item.href === '/settings';
                const isDisabled = !isAlwaysEnabled && !selectedGuild;

                return (
                    <SidebarMenuItem key={item.href}>
                    <Link href={item.href}>
                        <SidebarMenuButton
                            isActive={pathname.startsWith(item.href)}
                            tooltip={{ children: item.label, side: "right" }}
                            disabled={isDisabled}
                        >
                            <item.icon />
                            <span>{item.label}</span>
                        </SidebarMenuButton>
                    </Link>
                    </SidebarMenuItem>
                )
            })}
        </SidebarMenu>
        <div className={cn(state === 'collapsed' && 'hidden')}>
            {loading ? (
                <Skeleton className="h-9 w-full" />
            ) : (
                <Select value={selectedGuild || undefined} onValueChange={handleGuildChange} disabled={!adminGuilds || adminGuilds.length === 0}>
                    <SelectTrigger className="w-full text-sm">
                        <SelectValue placeholder="Select a community" />
                    </SelectTrigger>
                    <SelectContent>
                        {adminGuilds?.map((guild) => (
                            <SelectItem key={guild.id} value={guild.id}>
                                {guild.name}
                            </SelectItem>
                        ))}
                         {(!adminGuilds || adminGuilds.length === 0) && (
                            <SelectItem value="no-guilds" disabled>No communities linked</SelectItem>
                        )}
                    </SelectContent>
                </Select>
            )}
        </div>
        <Separator />
        <UserNav />
      </SidebarFooter>
    </Sidebar>
  );
}
