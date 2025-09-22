"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
  } from "@/components/ui/avatar"
  import { Button } from "@/components/ui/button"
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu"
import { useSidebar } from "../ui/sidebar";
import { cn } from "@/lib/utils";
import { Skeleton } from "../ui/skeleton";
import { useCommunity } from "@/context/community-context";

export function UserNav() {
  const router = useRouter();
  const { state } = useSidebar();
  const { adminId, adminProfile, loading: communityLoading, setAdminId, setSelectedGuild, refreshAdminProfile } = useCommunity();

  useEffect(() => {
    if (!communityLoading && adminId && !adminProfile) {
      void refreshAdminProfile(adminId);
    }
  }, [adminId, adminProfile, communityLoading, refreshAdminProfile]);

  const handleLogout = () => {
    setAdminId(null);
    void setSelectedGuild(null);
    router.push('/');
  }

  if (communityLoading) {
    return (
      <div className="flex items-center gap-2 p-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className={cn("flex-col gap-1", state === 'collapsed' ? 'hidden' : 'flex')}>
           <Skeleton className="h-4 w-24" />
           <Skeleton className="h-3 w-32" />
        </div>
      </div>
    )
  }

  const discordInfo = adminProfile?.discordInfo ?? null;
  const twitchInfo = adminProfile?.twitchInfo ?? null;

  if (!discordInfo) {
     return (
      <Button
        variant="ghost"
        className={cn("flex items-center gap-2 p-2 w-full h-auto", state === 'collapsed' && 'w-auto aspect-square justify-center h-10')}
        onClick={() => router.push('/api/auth/discord')}
      >
        <span className={cn(state === 'collapsed' && 'hidden')}>Link Discord</span>
      </Button>
     );
  }
    
  const displayName = twitchInfo?.displayName || discordInfo.username;
  const displaySubtext = twitchInfo ? `@${twitchInfo.login}` : discordInfo.username;
  const displayAvatar = twitchInfo?.avatar || discordInfo.avatar;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
          <Button variant="ghost" className={cn("flex items-center gap-2 p-2 w-full h-auto", state === 'collapsed' && 'w-auto aspect-square justify-center h-10')}>
              <Avatar className={cn(state === 'collapsed' && 'h-8 w-8')}>
                  <AvatarImage src={displayAvatar || ''} data-ai-hint="person avatar" alt={displayName} />
                  <AvatarFallback>{displayName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className={cn("flex flex-col items-start", state === 'collapsed' && 'hidden')}>
                  <span className="font-semibold text-sm">{displayName}</span>
                  <span className="text-xs text-muted-foreground">{displaySubtext}</span>
              </div>
          </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/settings')}>Account Settings</DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout}>Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
