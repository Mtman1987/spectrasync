
'use client';

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Link2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormEvent, useMemo, useState } from "react";
import { useCommunity } from "@/context/community-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DiscordUser = {
  id: string;
  username: string;
  avatar: string | null;
};

type Guild = {
  id: string;
  name: string;
  icon: string | null;
}

interface SetupClientProps {
    adminGuilds: Guild[];
    user: DiscordUser | null;
    error: string | null;
    adminDiscordId: string | null;
}

export function SetupClient({ adminGuilds, user, error, adminDiscordId }: SetupClientProps) {
  const router = useRouter();
  const [selectedGuildId, setSelectedGuildId] = useState<string | undefined>(undefined);
  const { setSelectedGuild, setAdminId } = useCommunity();
  const [manualAdminId, setManualAdminId] = useState("");
  const [manualGuildId, setManualGuildId] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

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
    
    // Set the guild using the context provider
    setSelectedGuild(selectedGuildId);
    
    // Redirect to dashboard
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

    if (!trimmedAdminId || !trimmedGuildId) {
      setManualError("Discord User ID and Server ID are both required.");
      return;
    }

    try {
      setIsSubmittingManual(true);
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

  // If not logged in, show the connect button.
  if (!user || !adminGuilds || adminGuilds.length === 0) {
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
                            If Discord sign-in isn&apos;t working, enter your Discord user ID and the server (guild) ID to continue.
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
      )
  }

  // If logged in, show the community selection dropdown.
  return (
    <div className="space-y-6">
        {errorAlert}
        <p className="text-muted-foreground my-6">
            Welcome, <span className="font-bold text-primary">{user?.username || 'Admin'}</span>! Please select a community to manage.
        </p>
        <Card className="w-full text-left">
            <CardHeader>
                <CardTitle>Select Your Community</CardTitle>
                <CardDescription>Choose one of the Discord servers where you are an administrator to continue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                         {(!adminGuilds || adminGuilds.length === 0) && (
                            <SelectItem value="no-guilds" disabled>No communities linked</SelectItem>
                        )}
                    </SelectContent>
                </Select>
                <Button onClick={handleSelectGuildAndContinue} disabled={!selectedGuildId} className="w-full">
                    Continue to Dashboard
                </Button>
            </CardContent>
        </Card>
    </div>
  );
}
