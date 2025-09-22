"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, User, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { saveAdminTwitchInfo } from "@/app/actions";

export type DiscordProfile = {
  id: string;
  username: string;
  avatar: string | null;
};

export type TwitchProfile = {
  id: string;
  login: string;
  displayName: string;
  avatar: string | null;
};

interface AdminAccountCardProps {
  adminId: string | null;
  discordInfo: DiscordProfile | null;
  twitchInfo: TwitchProfile | null;
  onTwitchChanged?: () => void;
  onDiscordRelink?: () => void;
  title?: string;
  description?: string;
  showDiscordButton?: boolean;
  defaultTwitchUsername?: string;
}

export function AdminAccountCard({
  adminId,
  discordInfo,
  twitchInfo,
  onTwitchChanged,
  onDiscordRelink,
  title = "Account Linking",
  description = "Manage your connected Discord and Twitch accounts.",
  showDiscordButton = true,
  defaultTwitchUsername,
}: AdminAccountCardProps) {
  const { toast } = useToast();
  const [usernameInput, setUsernameInput] = useState<string>("");
  const [isEditing, setIsEditing] = useState<boolean>(!twitchInfo);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (twitchInfo) {
      setUsernameInput(twitchInfo.login ?? "");
      setIsEditing(false);
    } else if (defaultTwitchUsername) {
      setUsernameInput(defaultTwitchUsername);
      setIsEditing(true);
    } else {
      setUsernameInput("");
      setIsEditing(true);
    }
  }, [twitchInfo, defaultTwitchUsername]);

  const displayDiscord = useMemo(() => {
    if (!discordInfo) {
      return null;
    }
    return {
      id: discordInfo.id,
      username: discordInfo.username,
      avatar: discordInfo.avatar ?? null,
    };
  }, [discordInfo]);

  const displayTwitch = useMemo(() => {
    if (!twitchInfo) {
      return null;
    }
    return {
      id: twitchInfo.id,
      login: twitchInfo.login,
      displayName: twitchInfo.displayName,
      avatar: twitchInfo.avatar ?? null,
    };
  }, [twitchInfo]);

  const handleSaveTwitch = () => {
    const trimmedUsername = usernameInput.trim();
    if (!adminId) {
      toast({ title: "Admin ID missing", description: "Sign in with Discord before linking Twitch.", variant: "destructive" });
      return;
    }
    if (!trimmedUsername) {
      toast({ title: "Twitch username required", variant: "destructive" });
      return;
    }

    startTransition(async () => {
      const result = await saveAdminTwitchInfo(adminId, trimmedUsername);
      if (result.success) {
        toast({ title: "Twitch linked!", description: "Your admin profile has been updated." });
        setIsEditing(false);
        onTwitchChanged?.();
      } else {
        toast({ title: "Error linking Twitch", description: result.error ?? "Unknown error", variant: "destructive" });
      }
    });
  };

  const handleCancelEdit = () => {
    if (displayTwitch) {
      setUsernameInput(displayTwitch.login ?? "");
      setIsEditing(false);
    } else {
      setUsernameInput("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {displayDiscord ? (
          <div className="flex items-center gap-4 p-3 border rounded-lg">
            <Avatar>
              <AvatarImage src={displayDiscord.avatar ?? undefined} data-ai-hint="discord avatar" />
              <AvatarFallback>{displayDiscord.username.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{displayDiscord.username}</p>
              <p className="text-xs text-muted-foreground">Discord linked</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            Connect your Discord account to unlock guild selection.
          </div>
        )}

        {displayTwitch && !isEditing ? (
          <div className="flex items-center justify-between gap-4 p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={displayTwitch.avatar ?? undefined} data-ai-hint="twitch avatar" />
                <AvatarFallback>{displayTwitch.displayName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{displayTwitch.displayName}</p>
                <p className="text-xs text-muted-foreground">@{displayTwitch.login}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Update Twitch
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="twitch-username">Twitch Username</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                id="twitch-username"
                value={usernameInput}
                onChange={(event) => setUsernameInput(event.target.value)}
                placeholder="e.g. mtman1987"
                autoComplete="off"
              />
              <Button onClick={handleSaveTwitch} disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Twitch Username
              </Button>
            </div>
            {displayTwitch && (
              <Button variant="ghost" size="sm" className="px-0 text-xs" onClick={handleCancelEdit} disabled={isPending}>
                Cancel update
              </Button>
            )}
          </div>
        )}
      </CardContent>
      {showDiscordButton && onDiscordRelink ? (
        <CardFooter>
          <Button onClick={onDiscordRelink} variant="secondary">
            <Link2 className="mr-2 h-4 w-4" />
            {displayDiscord ? 'Re-link Discord' : 'Connect Discord'}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
