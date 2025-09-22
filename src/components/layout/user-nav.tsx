
"use client";

import { useEffect, useState } from "react";
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
import { getAdminInfo } from "@/app/actions";
import { Skeleton } from "../ui/skeleton";
import { useCommunity } from "@/context/community-context";

type UserProfile = {
  discordInfo?: {
    id: string;
    username: string;
    avatar: string;
  };
  twitchInfo?: {
    id: string;
    login: string;
    displayName: string;
    avatar: string;
  };
}

export function UserNav() {
  const router = useRouter();
  const { state } = useSidebar();
  const [user, setUser] = useState<UserProfile | null>(null);
  const { adminId, loading: communityLoading, setAdminId, setSelectedGuild } = useCommunity();
    
  useEffect(() => {
    const fetchUser = async () => {
      if (adminId) {
        const { value } = await getAdminInfo(adminId);
        if (value) {
            setUser(value);
        } else {
            setUser(null);
        }
      } else {
        setUser(null);
      }
    };

    if (!communityLoading) {
        fetchUser();
    }
  }, [adminId, communityLoading]);

  const handleLogout = () => {
    // Clear the context state, which will also clear localStorage
    setAdminId(null);
    setSelectedGuild(null);
    // The redirect will be handled by the page logic now
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

  if (!user?.discordInfo) {
     return null;
  }
    
  const displayUser = user.discordInfo;
  const displayName = user.twitchInfo?.displayName || displayUser.username;
  const displaySubtext = user.twitchInfo?.login || user.discordInfo.username;
  const displayAvatar = user.twitchInfo?.avatar || displayUser.avatar;

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
        <DropdownMenuItem onClick={handleLogout}>Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
