

"use client";

import { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Crown, Eye, Bell, UserPlus, Trash2, UserRoundPlus, Edit } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import type { LiveUser } from "../raid-pile/types";
import { sendVipLiveNotification } from "./actions";
import { useToast } from "@/hooks/use-toast";
import { addVip, removeVip, createAndAddVip, updateVip } from "@/app/actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


interface VipLiveClientPageProps {
  liveVips: LiveUser[];
  allVips: any[];
  isLoading: boolean;
  parentDomain: string;
  guildId: string;
  onVipChanged: () => void;
}

function AddVipForm({ guildId, onVipAdded }: { guildId: string, onVipAdded: () => void }) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const [username, setUsername] = useState("");
    const [message, setMessage] = useState("");
    const [isOpen, setIsOpen] = useState(false);

    const handleSubmit = async () => {
        if (!username) {
            toast({ title: "Username required", variant: "destructive" });
            return;
        }
        if (!guildId) {
             toast({ title: "Community not found", description: "Cannot add VIP without a community ID.", variant: "destructive" });
            return;
        }
        startTransition(async () => {
            const result = await addVip(guildId, username, message);
            if (result.success) {
                toast({ title: "VIP Added!", description: result.message });
                setUsername("");
                setMessage("");
                setIsOpen(false);
                onVipAdded();
            } else {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            }
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button><UserPlus />Add Existing Member</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add a New VIP</DialogTitle>
                    <DialogDescription>Enter the Twitch username of an existing community member to make them a VIP. They must have previously interacted with the bot.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="username" className="text-right">Twitch Username</Label>
                        <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="message" className="text-right">VIP Message</Label>
                        <Input id="message" value={message} onChange={(e) => setMessage(e.target.value)} className="col-span-3" />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending && <Loader2 className="animate-spin mr-2"/>} Add VIP
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CreateVipForm({ guildId, onVipAdded }: { guildId: string, onVipAdded: () => void }) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const [discordId, setDiscordId] = useState("");
    const [twitchUsername, setTwitchUsername] = useState("");
    const [message, setMessage] = useState("");
    const [isOpen, setIsOpen] = useState(false);

    const handleSubmit = async () => {
        if (!guildId || !discordId || !twitchUsername) {
            toast({ title: "All fields are required", variant: "destructive" });
            return;
        }
        startTransition(async () => {
            const result = await createAndAddVip(guildId, discordId, twitchUsername, message);
            if (result.success) {
                toast({ title: "VIP Created!", description: result.message });
                setDiscordId("");
                setTwitchUsername("");
                setMessage("");
                setIsOpen(false);
                onVipAdded();
            } else {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            }
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="secondary"><UserRoundPlus />Create New VIP</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create New VIP</DialogTitle>
                    <DialogDescription>Manually create a new VIP user who has not interacted with the bot yet.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                     <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="discord-id" className="text-right">Discord ID</Label>
                        <Input id="discord-id" value={discordId} onChange={(e) => setDiscordId(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="twitch-username" className="text-right">Twitch Username</Label>
                        <Input id="twitch-username" value={twitchUsername} onChange={(e) => setTwitchUsername(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="vip-message" className="text-right">VIP Message</Label>
                        <Input id="vip-message" value={message} onChange={(e) => setMessage(e.target.value)} className="col-span-3" />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending && <Loader2 className="animate-spin mr-2"/>} Create VIP
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EditVipForm({ guildId, vip, onVipUpdated }: { guildId: string, vip: any, onVipUpdated: () => void }) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState(vip.vipMessage || "");
    const [isOpen, setIsOpen] = useState(false);

    const handleSubmit = async () => {
        if (!guildId) {
            toast({ title: "Community not found", variant: "destructive" });
            return;
        }
        startTransition(async () => {
            const result = await updateVip(guildId, vip.id, message);
            if (result.success) {
                toast({ title: "VIP Updated!", description: result.message });
                setIsOpen(false);
                onVipUpdated();
            } else {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            }
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                 <Button variant="outline" size="sm" className="w-full">
                    <Edit className="mr-2 h-4 w-4" /> Edit
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit VIP: {vip.twitchInfo.displayName}</DialogTitle>
                    <DialogDescription>Update the custom message for this VIP.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="message" className="text-right">VIP Message</Label>
                        <Input id="message" value={message} onChange={(e) => setMessage(e.target.value)} className="col-span-3" />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending && <Loader2 className="animate-spin mr-2"/>} Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


export function VipLiveClientPage({
  liveVips,
  allVips,
  isLoading,
  parentDomain,
  guildId,
  onVipChanged
}: VipLiveClientPageProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  
  const liveVipIds = new Set(liveVips.map(v => v.twitchId));

  const handleSendNotification = (vip: LiveUser) => {
    if (!guildId) return;

    startTransition(async () => {
        const result = await sendVipLiveNotification(guildId, vip);
        if(result.success) {
            toast({
                title: "Notification Sent!",
                description: `A "go live" announcement for ${vip.displayName} has been sent to your Discord channels.`,
            });
        } else {
            toast({
                title: "Error Sending Notification",
                description: result.error,
                variant: "destructive"
            })
        }
    });
  }
  
  const handleRemoveVip = (discordId: string) => {
      if (!guildId) return;
      startTransition(async () => {
          const result = await removeVip(guildId, discordId);
          if (result.success) {
              toast({ title: "VIP Removed", description: result.message });
              onVipChanged(); // This will refresh the vip list
          } else {
              toast({ title: "Error", description: result.error, variant: "destructive" });
          }
      });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-headline flex items-center gap-3">
          <Crown className="h-8 w-8 text-yellow-400" />
          VIP Management
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          A curated list of designated community VIPs. Live VIPs are showcased with an embedded stream.
        </p>
      </div>

       {isLoading && (
            <div className="text-center py-16 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p>Loading VIPs...</p>
            </div>
        )}
      
      {/* Live VIPs Section */}
      {!isLoading && liveVips.length > 0 && (
        <div className="space-y-6">
            <h2 className="text-2xl font-headline tracking-tight">Live Now</h2>
          {liveVips.map((vip) => (
            <Card key={vip.twitchId} className="bg-gradient-to-tr from-yellow-400/10 to-card border-yellow-400/20 overflow-hidden">
                <div className="grid md:grid-cols-3">
                     <div className="md:col-span-2 aspect-video bg-muted">
                        {parentDomain && (
                            <iframe
                                src={`https://player.twitch.tv/?channel=${vip.twitchLogin.toLowerCase()}&parent=${parentDomain}&autoplay=true&muted=true`}
                                height="100%"
                                width="100%"
                                allowFullScreen={true}
                                className="border-0"
                            ></iframe>
                        )}
                    </div>
                     <div className="p-6 flex flex-col justify-between">
                         <div>
                            <div className="flex items-center gap-4">
                                <Avatar className="h-16 w-16 border-2 border-yellow-400">
                                    <AvatarImage src={vip.avatarUrl} alt={vip.displayName} data-ai-hint="streamer avatar" />
                                    <AvatarFallback>{vip.displayName.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <h3 className="text-2xl font-bold text-yellow-400 font-headline">{vip.displayName}</h3>
                                    <p className="text-muted-foreground">
                                        Playing <span className="font-semibold text-foreground">{vip.latestGameName || 'N/A'}</span>
                                    </p>
                                </div>
                            </div>
                            <p className="text-muted-foreground mt-4 italic">
                                &quot;{vip.vipMessage}&quot;
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 mt-4">
                             <Button asChild className="w-full">
                                <Link href={`https://twitch.tv/${vip.twitchLogin}`} target="_blank" rel="noopener noreferrer">
                                    <Eye className="mr-2 h-4 w-4" />
                                    Watch Stream
                                </Link>
                            </Button>
                            <Button variant="outline" className="w-full" onClick={() => handleSendNotification(vip)} disabled={isPending}>
                                {isPending ? <Loader2 className="animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
                                Send Notification
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>
          ))}
        </div>
      )}
      
      {/* All VIPs List Section */}
       <Card>
            <CardHeader>
                <CardTitle>All VIP Members ({isLoading ? '...' : allVips.length})</CardTitle>
                <CardDescription>Manage all members designated as VIPs in your community.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading && (
                    <div className="text-center py-8 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <p>Loading VIP list...</p>
                    </div>
                 )}
                {!isLoading && allVips.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {allVips.map((vip) => {
                             const isLive = liveVipIds.has(vip.twitchInfo.id);
                             return (
                                 <Card key={vip.id} className="p-4 flex flex-col justify-between">
                                    <div className="flex items-start gap-3">
                                        <Avatar>
                                            <AvatarImage src={vip.twitchInfo.avatar} alt={vip.twitchInfo.displayName} data-ai-hint="streamer avatar" />
                                            <AvatarFallback>{vip.twitchInfo.displayName.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 truncate">
                                            <p className="font-bold truncate">{vip.twitchInfo.displayName}</p>
                                            <p className="text-xs text-muted-foreground truncate" title={vip.vipMessage}>
                                                {vip.vipMessage || 'No custom message.'}
                                            </p>
                                        </div>
                                         <Badge variant={isLive ? "default" : "outline"} className={isLive ? "bg-green-500 text-white" : ""}>
                                            {isLive ? 'Live' : 'Offline'}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-2 mt-4">
                                        <EditVipForm guildId={guildId} vip={vip} onVipUpdated={onVipChanged} />
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm" className="w-full" disabled={isPending}>
                                                    <Trash2 className="mr-2 h-4 w-4" /> Remove
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will remove {vip.twitchInfo.displayName} from the VIP list. This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleRemoveVip(vip.id)}>
                                                        {isPending ? <Loader2 className="animate-spin" /> : "Continue"}
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </Card>
                            )
                        })}
                    </div>
                ) : (
                   !isLoading && <div className="col-span-full text-center py-16">
                        <p className="text-muted-foreground">
                            You haven&apos;t added any VIPs yet.
                        </p>
                    </div>
                )}
            </CardContent>
            <CardFooter className="gap-2">
                 <AddVipForm guildId={guildId} onVipAdded={onVipChanged} />
                 <CreateVipForm guildId={guildId} onVipAdded={onVipChanged} />
            </CardFooter>
        </Card>
    </div>
  );
}

