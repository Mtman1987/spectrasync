
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useTransition, useState, useEffect } from "react";
import { Loader2, Medal, Wand2 } from "lucide-react";
import { saveSettings, getSettings } from "./actions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCommunity } from "@/context/community-context";

const PointsFormSchema = z.object({
    // Point Awards
    raidTrainPoints: z.coerce.number().min(0, "Points must be positive."),
    captainLogPoints: z.coerce.number().min(0, "Points must be positive."),
    raidParticipationPoints: z.coerce.number().min(0, "Points must be positive."),
    newFollowerPoints: z.coerce.number().min(0, "Points must be positive."),
    subscriptionPoints: z.coerce.number().min(0, "Points must be positive."),
    cheerPointsPerBit: z.coerce.number().min(0, "Points must be positive."),
    hypeTrainContributionPoints: z.coerce.number().min(0, "Points must be positive."),
});


export function PointSystemForm() {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const { selectedGuild: guildId } = useCommunity();

    const form = useForm<z.infer<typeof PointsFormSchema>>({ 
        resolver: zodResolver(PointsFormSchema),
        defaultValues: {
            raidTrainPoints: 0,
            captainLogPoints: 0,
            raidParticipationPoints: 0,
            newFollowerPoints: 0,
            subscriptionPoints: 0,
            cheerPointsPerBit: 0,
            hypeTrainContributionPoints: 0,
        }
    });

    useEffect(() => {
        async function fetchGuildAndSettings() {
            if (guildId) {
                const settings = await getSettings(guildId);
                form.reset(settings);
            }
        }
        fetchGuildAndSettings();
    }, [form, guildId]);
    
    async function onSubmit(data: z.infer<typeof PointsFormSchema>) {
        if (!guildId) {
            toast({ title: "Error", description: "No community selected.", variant: "destructive" });
            return;
        }
        startTransition(async () => {
            const result = await saveSettings(guildId, data);
            if (result.success) {
                toast({ title: "Settings Saved", description: "Point awards have been updated." });
            } else {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            }
        })
    }

    return (
        <Card className="flex flex-col">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 font-headline text-base">
                            <Medal className="w-5 h-5 text-primary" />
                            Point System Awards
                        </CardTitle>
                        <CardDescription>
                            Configure how many points are awarded for community actions.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 p-0">
                        <ScrollArea className="h-full px-6">
                             <div className="space-y-6 pb-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField control={form.control} name="raidParticipationPoints" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs">Raid Participation</FormLabel>
                                            <FormControl><Input type="number" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={form.control} name="raidTrainPoints" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs">Raid Train Signup</FormLabel>
                                            <FormControl><Input type="number" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={form.control} name="captainLogPoints" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs">Captain&apos;s Log</FormLabel>
                                            <FormControl><Input type="number" {...field} /></FormControl>
                                            <FormMessage />
                                    </FormItem>
                                    )} />
                                    <FormField control={form.control} name="newFollowerPoints" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs">New Follower</FormLabel>
                                            <FormControl><Input type="number" {...field} /></FormControl>
                                            <FormMessage />
                                    </FormItem>
                                    )} />
                                    <FormField control={form.control} name="subscriptionPoints" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs">Subscription</FormLabel>
                                            <FormControl><Input type="number" {...field} /></FormControl>
                                            <FormMessage />
                                    </FormItem>
                                    )} />
                                    <FormField control={form.control} name="cheerPointsPerBit" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs">Points per Bit</FormLabel>
                                            <FormControl><Input type="number" {...field} /></FormControl>
                                            <FormMessage />
                                    </FormItem>
                                    )} />
                                    <FormField control={form.control} name="hypeTrainContributionPoints" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs">Hype Train</FormLabel>
                                            <FormControl><Input type="number" {...field} /></FormControl>
                                            <FormMessage />
                                    </FormItem>
                                    )} />
                                </div>
                             </div>
                        </ScrollArea>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" disabled={isPending || !guildId} size="sm">
                            {isPending ? <Loader2 className="mr-2 animate-spin"/> : <Wand2 className="mr-2"/>}
                            Save Points
                        </Button>
                    </CardFooter>
                </form>
            </Form>
        </Card>
    )
}

