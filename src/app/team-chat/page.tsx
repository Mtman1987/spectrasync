
"use client";

import { MessageSquare, Send, Webhook } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/layout/app-layout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useState, useRef, useTransition, useCallback } from "react";
import { sendMessage, type ChatMessage } from "@/app/team-chat/actions";
import { getWebhooks, updateWebhookStatus, type Webhook as WebhookType } from "@/app/settings/actions";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { collection, onSnapshot, query, orderBy, getFirestore, Timestamp } from "firebase/firestore";
import { getClientApp } from "@/lib/firebase";
import Image from 'next/image';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";

function ChatMessageContent({ message }: { message: string }) {
    const isGif = message.match(/\.(gif)$/i);
    if (isGif) {
        return (
            <Image 
                src={message} 
                alt="GIF" 
                width={200} 
                height={150} 
                unoptimized 
                className="rounded-md mt-2 max-w-xs" 
            />
        )
    }

    return <p className="text-muted-foreground whitespace-pre-wrap">{message}</p>;
}


export default function TeamChatPage() {
    const [guildId, setGuildId] = useState<string | null>(null);
    const [adminDiscordId, setAdminDiscordId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isPending, startTransition] = useTransition();
    const [isLoading, setIsLoading] = useState(true);
    const [webhooks, setWebhooks] = useState<WebhookType[]>([]);
    const { toast } = useToast();
    const viewportRef = useRef<HTMLDivElement>(null);

     const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
        const viewport = viewportRef.current;
        if (viewport) {
            viewport.scrollTo({
                top: viewport.scrollHeight,
                behavior: behavior
            });
        }
    };
    
    const fetchWebhooks = useCallback(async (id: string) => {
        const fetchedWebhooks = await getWebhooks(id);
        setWebhooks(fetchedWebhooks);
    }, []);


    useEffect(() => {
        const selectedGuildId = localStorage.getItem('selectedGuildId');
        const adminId = localStorage.getItem('adminDiscordId');
        setGuildId(selectedGuildId);
        setAdminDiscordId(adminId);

        if (!selectedGuildId) {
            setIsLoading(false);
            return;
        }

        fetchWebhooks(selectedGuildId);
        const app = getClientApp();
        const db = getFirestore(app);
        const q = query(collection(db, `communities/${selectedGuildId}/chat`), orderBy("timestamp", "asc"));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const newMessages: ChatMessage[] = [];
            querySnapshot.forEach((doc) => {
                 const data = doc.data();
                 const timestamp = data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date();
                 newMessages.push({
                    id: doc.id,
                    userName: data.userName,
                    userAvatar: data.userAvatar,
                    message: data.message,
                    channelName: data.channelName,
                    timestamp: timestamp
                 });
            });
            setMessages(newMessages);
            if (isLoading) setIsLoading(false);
            
            setTimeout(() => scrollToBottom('auto'), 100);
        }, (error) => {
            console.error("Error fetching chat messages:", error);
            toast({ title: "Error", description: "Could not fetch chat history.", variant: "destructive"});
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [isLoading, toast, fetchWebhooks]);

     useEffect(() => {
        scrollToBottom();
    }, [messages]);


    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        if (!guildId || !adminDiscordId) {
            toast({ title: "Error", description: "Authentication details are missing. Please log in again.", variant: "destructive" });
            return;
        }
        
        const messageToSend = newMessage;
        setNewMessage("");

        startTransition(async () => {
            const result = await sendMessage(guildId, adminDiscordId, messageToSend);
            
            if (!result.success) {
                toast({ title: "Failed to send message", description: result.error, variant: "destructive" });
                setNewMessage(messageToSend);
            }
        });
    };

    async function handleWebhookToggle(webhookId: string, enabled: boolean) {
        if (!guildId) return;
        startTransition(async () => {
            const result = await updateWebhookStatus(guildId, webhookId, enabled);
            if (result.success) {
                toast({ title: "Webhook Updated" });
                if(guildId) fetchWebhooks(guildId);
            } else {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            }
        });
    }

  return (
    <AppLayout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline flex items-center gap-3">
            <MessageSquare className="h-8 w-8 text-primary" />
            Team Chat
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            A real-time chat for admins and mods, synced with your private Discord channel via your bot and database.
          </p>
        </div>
        <Card className="flex flex-col h-[600px] overflow-hidden">
          <CardHeader>
            <CardTitle>#mod-chat</CardTitle>
            <CardDescription>This chat is synced with Firestore. Your bot should read/write to this collection.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-6 pt-0">
            <ScrollArea className="h-full" viewportRef={viewportRef}>
              <div className="flex min-h-full flex-col justify-end space-y-6 pr-4">
                {isLoading && (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                )}
                {!isLoading && messages.length === 0 && (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p>No messages yet. Start the conversation!</p>
                    </div>
                )}
                {!isLoading && messages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-4">
                        <Avatar>
                            <AvatarImage src={msg.userAvatar} alt={msg.userName} />
                            <AvatarFallback>{msg.userName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <div className="flex items-baseline gap-2">
                                <p className="font-semibold">{msg.userName}</p>
                                {msg.channelName && <p className="text-xs text-muted-foreground">in #{msg.channelName}</p>}
                                <p className="text-xs text-muted-foreground" title={new Date(msg.timestamp).toLocaleString()}>
                                    {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}
                                </p>
                            </div>
                            <ChatMessageContent message={msg.message} />
                        </div>
                    </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
          <div className="p-4 border-t">
              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <Input 
                    placeholder="Type your message or paste a GIF link..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    disabled={isPending}
                   />
                  <Button size="icon" type="submit" disabled={isPending}>
                      {isPending ? <Loader2 className="animate-spin" /> : <Send className="h-4 w-4" />}
                      <span className="sr-only">Send</span>
                  </Button>
              </form>
          </div>
        </Card>
        
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger>
                <div className="flex items-center gap-2">
                    <Webhook />
                    Webhook Controls
                </div>
            </AccordionTrigger>
            <AccordionContent>
                 <Card>
                    <CardHeader>
                         <CardTitle className="text-base">Manage Reply Channels</CardTitle>
                        <CardDescription>Enable or disable webhooks to control which Discord channel your messages are sent to.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <div className="space-y-2">
                            {webhooks.length > 0 ? webhooks.map(hook => (
                                <div key={hook.id} className="flex items-center justify-between p-2 border rounded-lg">
                                    <p className="font-semibold">{hook.name}</p>
                                    <Switch 
                                        checked={hook.enabled} 
                                        onCheckedChange={(checked) => handleWebhookToggle(hook.id, checked)}
                                        disabled={isPending}
                                    />
                                </div>
                            )) : <p className="text-sm text-muted-foreground text-center">No webhooks configured. Add them in Settings.</p>}
                        </div>
                    </CardContent>
                 </Card>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

      </div>
    </AppLayout>
  );
}
    