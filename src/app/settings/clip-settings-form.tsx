"use client";

import { useEffect, useTransition } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useCommunity } from "@/context/community-context";
import { saveSettings, getSettings } from "./actions";
import { Loader2, Film } from "lucide-react";

const ClipSettingsSchema = z.object({
    clipGifWidth: z.coerce.number().min(16, "Width must be at least 16px."),
    clipGifFps: z.coerce.number().min(1, "FPS must be at least 1."),
    clipGifLoop: z.coerce.number().min(0, "Loop count cannot be negative."),
    clipGifMaxDurationSeconds: z.coerce.number().min(0, "Duration must be zero or greater."),
});

export function ClipSettingsForm() {
    const { toast } = useToast();
    const { selectedGuild: guildId } = useCommunity();
    const [isPending, startTransition] = useTransition();

    const form = useForm<z.infer<typeof ClipSettingsSchema>>({
        resolver: zodResolver(ClipSettingsSchema),
        defaultValues: {
            clipGifWidth: 480,
            clipGifFps: 15,
            clipGifLoop: 0,
            clipGifMaxDurationSeconds: 0,
        },
    });

    useEffect(() => {
        async function fetchSettings() {
            if (!guildId) return;
            const settings = await getSettings(guildId);
            form.reset({
                clipGifWidth: settings.clipGifWidth,
                clipGifFps: settings.clipGifFps,
                clipGifLoop: settings.clipGifLoop,
                clipGifMaxDurationSeconds: settings.clipGifMaxDurationSeconds,
            });
        }

        fetchSettings();
    }, [form, guildId]);

    async function onSubmit(values: z.infer<typeof ClipSettingsSchema>) {
        if (!guildId) {
            toast({ title: "Error", description: "No community selected.", variant: "destructive" });
            return;
        }

        startTransition(async () => {
            const result = await saveSettings(guildId, values);
            if (result.success) {
                toast({ title: "Clip settings saved", description: "Updated GIF conversion defaults." });
            } else {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            }
        });
    }

    return (
        <Card className="flex flex-col">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 font-headline text-base">
                            <Film className="h-5 w-5 text-primary" />
                            Clip Conversion Defaults
                        </CardTitle>
                        <CardDescription>
                            Configure the GIF conversion parameters applied to Twitch clips before they are posted.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 p-0">
                        <ScrollArea className="h-full px-6">
                            <div className="space-y-6 pb-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="clipGifWidth"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs">GIF Width (px)</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min={16} {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="clipGifFps"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs">Frame Rate (FPS)</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min={1} {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="clipGifLoop"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs">Loop Count</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min={0} {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="clipGifMaxDurationSeconds"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs">Max Duration (seconds)</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min={0} {...field} />
                                                </FormControl>
                                                <p className="text-[10px] text-muted-foreground">
                                                    Use <strong>0</strong> to encode the full clip length.
                                                </p>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                        </ScrollArea>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" size="sm" disabled={isPending || !guildId}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
                            Save Clip Settings
                        </Button>
                    </CardFooter>
                </form>
            </Form>
        </Card>
    );
}
