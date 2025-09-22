'use client';

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Link2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useCommunity } from "@/context/community-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminAccountCard, DiscordProfile, TwitchProfile } from "@/components/admin-account-card";
import { getDiscordUser, getGuildDetails, saveAdminInfo, saveAdminTwitchInfo } from "@/app/actions";

export type Guild = {
  id: string;
  name: string;
  icon: string | null;
};

interface SetupClientProps {
  adminGuilds: Guild[];
  user: DiscordProfile | null;
  error: string | null;
  adminDiscordId: string | null;
  twitchInfo: TwitchProfile | null;
  onProfileRefresh?: () => void;
}

export function SetupClient({ adminGuilds, user, error, adminDiscordId, twitchInfo, onProfileRefresh }: SetupClientProps) {
  const router = useRouter();
  const { setSelectedGuild, setAdminId } = useCommunity();

  const [selectedGuildId, setSelectedGuildId] = useState<string | undefined>(undefined);
  const [manualAdminId, setManualAdminId] = useState("");
  const [manualGuildId, setManualGuildId] = useState("");
  const [manualTwitchUsername, setManualTwitchUsername] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  useEffect(() => {
    if (!selectedGuildId && adminGuilds && adminGuilds.length > 0) {
      setSelectedGuildId(adminGuilds[0].id);
    }
  }, [adminGuilds, selectedGuildId]);

  const errorAlert = useMemo(() => {
    if (!error) return null;
    return (
      <Alert variant="destructive" className="text-left mt-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Setup Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }, [error]);

  const handleSelectGuildAndContinue = async () => {
    if (!adminDiscordId || !selectedGuildId) return;
    await setSelectedGuild(selectedGuildId);
    router.push(`/dashboard`);
  };

  const handleLinkDiscord = () => {
    router.push(`/api/auth/discord`);
  };

  const handleManualSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setManualError(null);

    const trimmedAdminId = manualAdminId.trim();
    const trimmedGuildId = manualGuildId.trim();
    const trimmedTwitchUsername = manualTwitchUsername.trim();

    if (!trimmedAdminId || !trimmedGuildId || !trimmedTwitchUsername) {
      setManualError("Discord User ID, Server ID, and Twitch username are all required.");
      return;
    }

    try {
      setIsSubmittingManual(true);

      const twitchResult = await saveAdminTwitchInfo(trimmedAdminId, trimmedTwitchUsername);
      if (!twitchResult.success) {
        setManualError(twitchResult.error ?? "Failed to link Twitch. Please double-check the username.");
        return;
      }

      const [discordProfile, guildDetails] = await Promise.all([
        getDiscordUser(trimmedAdminId),
        getGuildDetails(trimmedGuildId),
      ]);

      const guildEntry = guildDetails ?? {
        id: trimmedGuildId,
        name: trimmedGuildId,
        icon: null,
      };

      const adminPayload: Record<string, unknown> = {
        selectedGuild: trimmedGuildId,
        discordUserGuilds: [guildEntry],
      };

      if (discordProfile) {
        adminPayload.discordInfo = discordProfile;
      }

      const adminResult = await saveAdminInfo(trimmedAdminId, adminPayload);
      if (!adminResult.success) {
        setManualError(adminResult.error ?? "Failed to store your admin profile. Please try again.");
        return;
      }

      setAdminId(trimmedAdminId);
      await setSelectedGuild(trimmedGuildId);
      router.push(`/dashboard`);
    } catch (submissionError) {
      console.error("Manual sign-in failed", submissionError);
      setManualError("We couldn't save your manual sign-in details. Please try again.");
    } finally {
      setIsSubmittingManual(false);
    }
  };

  if (!adminDiscordId) {
    return (
      <div className="space-y-6">
        {errorAlert}
        <p className="text-muted-foreground">
          To get started, connect your Discord account. This will allow you to select which of your communities you want to manage.
        </p>
        <div className="flex flex-col gap-4 w-full">
          <Button onClick={handleLinkDiscord}>
            <Link2 className="mr-2" />
            Connect Discord Account
          </Button>
          <Card className="text-left">
            <CardHeader>
              <CardTitle>Manual sign-in</CardTitle>
              <CardDescription>
                If Discord sign-in isn&apos;t working, enter your Discord user ID, server ID, and Twitch username to continue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleManualSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="manual-admin-id">Discord User ID</Label>
                  <Input
                    id="manual-admin-id"
                    value={manualAdminId}
                    onChange={(event) => setManualAdminId(event.target.value)}
                    placeholder="e.g. 123456789012345678"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-guild-id">Server (Guild) ID</Label>
                  <Input
                    id="manual-guild-id"
                    value={manualGuildId}
                    onChange={(event) => setManualGuildId(event.target.value)}
                    placeholder="e.g. 987654321098765432"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-twitch">Twitch Username</Label>
                  <Input
                    id="manual-twitch"
                    value={manualTwitchUsername}
                    onChange={(event) => setManualTwitchUsername(event.target.value)}
                    placeholder="e.g. mtman1987"
                    autoComplete="off"
                  />
                </div>
                {manualError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Manual sign-in error</AlertTitle>
                    <AlertDescription>{manualError}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={isSubmittingManual}>
                  {isSubmittingManual ? "Saving..." : "Continue without Discord"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {errorAlert}
      <AdminAccountCard
        adminId={adminDiscordId}
        discordInfo={user}
        twitchInfo={twitchInfo}
        onTwitchChanged={onProfileRefresh}
        onDiscordRelink={handleLinkDiscord}
      />

      <Card className="text-left">
        <CardHeader>
          <CardTitle>Select Your Community</CardTitle>
          <CardDescription>Choose one of the Discord servers where you are an administrator to continue.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {adminGuilds && adminGuilds.length > 0 ? (
            <Select value={selectedGuildId} onValueChange={setSelectedGuildId}>
              <SelectTrigger className="w-full text-sm">
                <SelectValue placeholder="Select a community..." />
              </SelectTrigger>
              <SelectContent>
                {adminGuilds.map((guild) => (
                  <SelectItem key={guild.id} value={guild.id}>
                    {guild.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No communities found</AlertTitle>
              <AlertDescription>
                We couldn&apos;t load any communities for your account. Re-link Discord to refresh your administrator permissions.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleSelectGuildAndContinue} disabled={!selectedGuildId} className="w-full">
            Continue to Dashboard
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
