

"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Settings, UserPlus, Webhook, Trash, Link2, PlusCircle, Coins } from "lucide-react";
import { getAdminInfo, saveAdminTwitchInfo, addVip, addPointsToAdmin } from "@/app/actions";
import { addWebhook, getWebhooks, deleteWebhook, testGifWebhook, type Webhook as WebhookType, getSettings, saveSettings } from "@/app/settings/actions";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PointSystemForm } from "@/app/settings/point-system-form";
import { ClipSettingsForm } from "@/app/settings/clip-settings-form";
import { useRouter } from "next/navigation";
import { Twitch } from "@/components/icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCommunity } from "@/context/community-context";

function AddWebhookForm({ guildId, onWebhookAdded }: { guildId: string, onWebhookAdded: () => void }) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [isOpen, setIsOpen] = useState(false);

    const handleSubmit = async () => {
        if (!name || !url) {
            toast({ title: "Name and URL required", variant: "destructive" });
            return;
        }
         if (!guildId) {
             toast({ title: "Community not found", description: "Cannot add webhook without a community ID.", variant: "destructive" });
            return;
        }
        startTransition(async () => {
            const result = await addWebhook(guildId, name, url);
            if (result.success) {
                toast({ title: "Webhook Added!" });
                setName("");
                setUrl("");
                setIsOpen(false);
                onWebhookAdded();
            } else {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            }
        });
    };

    return (
         <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button><Webhook /> Add Webhook</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add a New Webhook</DialogTitle>
                    <DialogDescription>Add a Discord channel webhook URL for bot notifications.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="webhook-name" className="text-right">Name</Label>
                        <Input id="webhook-name" placeholder="e.g., #mod-chat" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="webhook-url" className="text-right">Webhook URL</Label>
                        <Input id="webhook-url" value={url} onChange={(e) => setUrl(e.target.value)} className="col-span-3" />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending && <Loader2 className="animate-spin mr-2"/>} Add Webhook
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


function GifTestCard({ guildId }: { guildId: string }) {
    const { toast } = useToast();
    const [mp4Url, setMp4Url] = useState('');
    const [webhooks, setWebhooks] = useState<WebhookType[]>([]);
    const [selectedWebhookId, setSelectedWebhookId] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [lastResult, setLastResult] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        if (!guildId) {
            setWebhooks([]);
            setSelectedWebhookId('');
            setIsLoading(false);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        getWebhooks(guildId)
            .then((fetched) => {
                if (cancelled) return;
                setWebhooks(fetched);
                setSelectedWebhookId((current) => {
                    if (current && fetched.some((hook) => hook.id === current)) {
                        return current;
                    }
                    return fetched[0]?.id ?? '';
                });
                setIsLoading(false);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error('Failed to load webhooks for GIF test', error);
                toast({ title: 'Could not load webhooks', description: 'Refresh the page and try again.', variant: 'destructive' });
                setWebhooks([]);
                setSelectedWebhookId('');
                setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [guildId, toast]);

    const handleTest = () => {
        if (!guildId) {
            toast({ title: 'Missing community', description: 'Select or link a community first.', variant: 'destructive' });
            return;
        }
        if (!selectedWebhookId) {
            toast({ title: 'Select a webhook', description: 'Add a webhook entry before running the test.', variant: 'destructive' });
            return;
        }
        if (!mp4Url.trim()) {
            toast({ title: 'Provide a clip URL', description: 'Enter an MP4 URL to convert.', variant: 'destructive' });
            return;
        }

        setLastResult(null);
        startTransition(async () => {
            const result = await testGifWebhook({
                guildId,
                webhookId: selectedWebhookId,
                mp4Url: mp4Url.trim(),
            });

            if (result.success) {
                setLastResult(`Sent GIF (duration ${result.details.durationSeconds.toFixed(2)}s)`);
                toast({ title: 'GIF sent!', description: 'Check the selected Discord channel for the conversion preview.' });
            } else {
                setLastResult(null);
                toast({ title: 'Failed to send GIF', description: result.error, variant: 'destructive' });
            }
        });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">GIF Conversion Tester</CardTitle>
                <CardDescription>Try the MP4 to GIF pipeline and deliver it to one of your configured webhooks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="gif-test-url">MP4 URL</Label>
                    <Input
                        id="gif-test-url"
                        placeholder="https://clips.twitch.tv/awesome-clip.mp4"
                        value={mp4Url}
                        onChange={(event) => setMp4Url(event.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Target Webhook</Label>
                    <Select
                        value={selectedWebhookId}
                        onValueChange={setSelectedWebhookId}
                        disabled={isLoading || webhooks.length === 0}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder={isLoading ? 'Loading...' : 'Select a webhook'} />
                        </SelectTrigger>
                        <SelectContent>
                            {webhooks.map((hook) => (
                                <SelectItem key={hook.id} value={hook.id}>
                                    {hook.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {webhooks.length === 0 && !isLoading && (
                        <p className="text-xs text-muted-foreground">Add a webhook above to enable testing.</p>
                    )}
                </div>
                {lastResult && (
                    <p className="text-sm text-muted-foreground">{lastResult}</p>
                )}
            </CardContent>
            <CardFooter>
                <Button onClick={handleTest} disabled={isPending || isLoading || webhooks.length === 0}>
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                    Send test GIF
                </Button>
            </CardFooter>
        </Card>
    );
}
function WebhooksList({ guildId }: { guildId: string }) {
    const { toast } = useToast();
    const [webhooks, setWebhooks] = useState<WebhookType[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchWebhooks = useCallback(async () => {
        if (!guildId) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const fetched = await getWebhooks(guildId);
        setWebhooks(fetched);
        setIsLoading(false);
    }, [guildId]);

    useEffect(() => {
        if (guildId) {
            fetchWebhooks();
        }
    }, [guildId, fetchWebhooks]);

    const handleDelete = async (webhookId: string) => {
        if (!guildId) return;
        const result = await deleteWebhook(guildId, webhookId);
        if (result.success) {
            toast({ title: "Webhook Deleted" });
            fetchWebhooks();
        } else {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Webhook /> Configured Webhooks</CardTitle>
                <CardDescription>Manage your Discord webhook endpoints for bot notifications.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    {isLoading ? (
                        <Loader2 className="animate-spin" />
                    ) : webhooks.length > 0 ? (
                        webhooks.map((hook) => (
                            <div key={hook.id} className="flex items-center justify-between p-2 border rounded-lg">
                                <p className="font-semibold truncate flex-1" title={hook.url}>{hook.name}</p>
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(hook.id)}>
                                    <Trash className="h-4 w-4" />
                                </Button>
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">No webhooks configured.</p>
                    )}
                </div>
            </CardContent>
            <CardFooter>
                <AddWebhookForm guildId={guildId} onWebhookAdded={fetchWebhooks} />
            </CardFooter>
        </Card>
    );
}

function LinkConfigForm({ guildId }: { guildId: string }) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const [baseUrl, setBaseUrl] = useState("http://localhost:9002");
    const [suggestedUrl, setSuggestedUrl] = useState("");

    useEffect(() => {
        if(window) {
            setSuggestedUrl(window.location.origin);
        }
        if (guildId) {
            getSettings(guildId).then(settings => {
                if (settings.appBaseUrl) {
                    setBaseUrl(settings.appBaseUrl);
                }
            })
        }
    }, [guildId]);

    const handleSubmit = async () => {
        if (!guildId) {
            toast({ title: "Community not found", variant: "destructive" });
            return;
        }
        startTransition(async () => {
            const result = await saveSettings(guildId, { appBaseUrl: baseUrl });
            if (result.success) {
                toast({ title: "Link Configuration Saved!" });
            } else {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            }
        });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Link Configuration</CardTitle>
                <CardDescription>Set the base URL for all quick-join links. This should be your app&apos;s public domain.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="base-url">Application Base URL</Label>
                    <Input id="base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                    <p className="text-xs text-muted-foreground">
                        Current recommended URL for this environment: <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => setBaseUrl(suggestedUrl)}>{suggestedUrl}</Button>
                    </p>
                </div>
            </CardContent>
            <CardFooter>
                 <Button onClick={handleSubmit} disabled={isPending}>
                    {isPending && <Loader2 className="animate-spin mr-2"/>} Save Link Config
                </Button>
            </CardFooter>
        </Card>
    );
}

function DevToolsCard({ guildId, adminId }: { guildId: string, adminId: string | null }) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    const handleAddPoints = () => {
        if (!guildId || !adminId) {
            toast({ title: "Error", description: "Cannot add points. Missing community or user ID.", variant: "destructive" });
            return;
        }
        startTransition(async () => {
            const result = await addPointsToAdmin(guildId, adminId, 200);
            if (result.success) {
                toast({ title: "Success!", description: "You have been awarded 200 points." });
            } else {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            }
        });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Developer Tools</CardTitle>
                <CardDescription>Use these tools for testing and debugging.</CardDescription>
            </CardHeader>
            <CardContent>
                 <Button onClick={handleAddPoints} disabled={isPending || !adminId || !guildId}>
                    {isPending ? <Loader2 className="animate-spin mr-2" /> : <Coins className="mr-2" />}
                    Give me 200 points
                 </Button>
            </CardContent>
        </Card>
    );
}


function LinkTwitchForm({ adminId, onTwitchLinked }: { adminId: string; onTwitchLinked: () => void }) {
    const { toast } = useToast();
    const [username, setUsername] = useState("");
    const [isPending, startTransition] = useTransition();

    const handleLink = () => {
        if (!username) {
            toast({ title: "Twitch username required", variant: "destructive" });
            return;
        }

        startTransition(async () => {
            const result = await saveAdminTwitchInfo(adminId, username.trim());
            if (result.success) {
                toast({ title: "Twitch Linked!", description: "Your admin profile has been updated." });
                setUsername("");
                onTwitchLinked();
            } else {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            }
        });
    };

    return (
        <div className="border rounded-lg p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
                Link your Twitch account to unlock live activity tracking and raid notifications.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
                <Input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Twitch username"
                    className="sm:flex-1"
                />
                <Button onClick={handleLink} disabled={isPending}>
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Link Twitch
                </Button>
            </div>
        </div>
    );
}

export function SettingsClientPage({ guildId, initialCommunityInfo }: { guildId: string, initialCommunityInfo: any }) {
    const router = useRouter();
    const { adminId } = useCommunity();
    const [adminProfile, setAdminProfile] = useState<any>(null);

    const fetchAdminProfile = async (id: string) => {
        const { value } = await getAdminInfo(id);
        setAdminProfile(value);
    }
    
    useEffect(() => {
        if (adminId) {
            fetchAdminProfile(adminId);
        }
    }, [adminId]);
    
    const handleLinkDiscord = () => {
        router.push(`/api/auth/discord`);
    };

    return (
        <AppLayout>
            <div className="flex flex-col gap-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight font-headline flex items-center gap-3">
                        <Settings className="h-8 w-8 text-primary" />
                        Settings
                    </h1>
                    <p className="text-muted-foreground max-w-2xl">
                        Configure your community, authentication, and integration settings.
                    </p>
                </div>
                
                 <div className="grid gap-6 lg:grid-cols-2">
                     <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Account Linking</CardTitle>
                             <CardDescription>
                                Manage your connected Discord and Twitch accounts.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {adminProfile?.discordInfo && (
                                <div className="flex items-center gap-4 p-2 border rounded-lg">
                                    <Avatar>
                                        <AvatarImage src={adminProfile.discordInfo.avatar || undefined} />
                                        <AvatarFallback>{adminProfile.discordInfo.username.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-bold">{adminProfile.discordInfo.username}</p>
                                        <p className="text-xs text-muted-foreground">Discord Linked</p>
                                    </div>
                                </div>
                            )}

                             {adminProfile?.twitchInfo ? (
                                <div className="flex items-center gap-4 p-2 border rounded-lg">
                                     <Avatar>
                                        <AvatarImage src={adminProfile.twitchInfo.avatar || undefined} />
                                        <AvatarFallback>{adminProfile.twitchInfo.displayName.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-bold">{adminProfile.twitchInfo.displayName}</p>
                                        <p className="text-xs text-muted-foreground">Twitch Linked</p>
                                    </div>
                                </div>
                            ) : adminId ? (
                                <LinkTwitchForm adminId={adminId} onTwitchLinked={() => fetchAdminProfile(adminId)} />
                            ) : null}
                        </CardContent>
                         <CardFooter>
                            <Button onClick={handleLinkDiscord}>
                                <Link2 className="mr-2" />
                                Re-Link Discord
                            </Button>
                        </CardFooter>
                    </Card>

                    <PointSystemForm />
                    <ClipSettingsForm />
                    <LinkConfigForm guildId={guildId} />
                    <WebhooksList guildId={guildId} />
                    <GifTestCard guildId={guildId} />
                    <DevToolsCard guildId={guildId} adminId={adminId} />
                </div>
            </div>
        </AppLayout>
    );
}












