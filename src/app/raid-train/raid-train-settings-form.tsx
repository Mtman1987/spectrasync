
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useTransition, useState, useEffect } from "react";
import { Loader2, Train, Wand2 } from "lucide-react";
import { saveSettings, getSettings } from "@/app/settings/actions";
import { Switch } from "@/components/ui/switch";
import { useCommunity } from "@/context/community-context";
import { FullScheduleDialog } from "./full-schedule-dialog";


const SettingsFormSchema = z.object({
    useAttendanceForRaidTrain: z.boolean(),
    raidTrainRequiredPoints: z.coerce.number().min(0, "Value must be positive."),
    raidTrainEmergencyRequiredPoints: z.coerce.number().min(0, "Value must be positive."),
    raidTrainBaseSlots: z.coerce.number().int().min(0, "Slots must be a positive integer."),
    raidTrainBonusSlots: z.coerce.number().int().min(0, "Slots must be a positive integer."),
    raidTrainBonusSlotsRequiredPoints: z.coerce.number().min(0, "Value must be positive."),
    raidTrainAllowEmergencyWithSlot: z.boolean(),
});


export function RaidTrainSettingsForm({ onSettingsSaved }: { onSettingsSaved: () => void }) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const { selectedGuild: guildId } = useCommunity();

    const form = useForm<z.infer<typeof SettingsFormSchema>>({ 
        resolver: zodResolver(SettingsFormSchema),
        defaultValues: {
            useAttendanceForRaidTrain: false,
            raidTrainRequiredPoints: 150,
            raidTrainEmergencyRequiredPoints: 0,
            raidTrainBaseSlots: 1,
            raidTrainBonusSlots: 1,
            raidTrainBonusSlotsRequiredPoints: 1000,
            raidTrainAllowEmergencyWithSlot: false,
        }
    });
    
    const useAttendance = form.watch("useAttendanceForRaidTrain");

    useEffect(() => {
        async function fetchGuildAndSettings() {
            if (guildId) {
                const settings = await getSettings(guildId);
                form.reset(settings);
            }
        }
        fetchGuildAndSettings();
    }, [form, guildId]);
    
    async function onSubmit(data: z.infer<typeof SettingsFormSchema>) {
        if (!guildId) {
            toast({ title: "Error", description: "No community selected.", variant: "destructive" });
            return;
        }
        startTransition(async () => {
            const result = await saveSettings(guildId, data);
            if (result.success) {
                toast({ title: "Settings Saved", description: "Raid Train settings have been updated." });
                onSettingsSaved();
            } else {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            }
        })
    }

    return (
        <Card>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 font-headline text-base">
                            <Train className="w-5 h-5 text-primary" />
                            Raid Train Rules
                        </CardTitle>
                        <CardDescription>
                            Configure signup requirements and slot limits for your raid train.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={form.control} name="useAttendanceForRaidTrain" render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                <div className="space-y-0.5">
                                    <FormLabel>Use Attendance for Signups</FormLabel>
                                    <FormDescription className="text-xs">
                                        Use raid attendance count instead of points for requirements.
                                    </FormDescription>
                                </div>
                                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                            </FormItem>
                        )} />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="raidTrainRequiredPoints" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">{useAttendance ? 'Required Attendance' : 'Required Points'}</FormLabel>
                                    <FormControl><Input type="number" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                             <FormField control={form.control} name="raidTrainEmergencyRequiredPoints" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">Emergency {useAttendance ? 'Attendance' : 'Points'}</FormLabel>
                                    <FormControl><Input type="number" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="raidTrainBaseSlots" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">Base Slots / Day</FormLabel>
                                    <FormControl><Input type="number" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="raidTrainBonusSlots" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">Bonus Slots / Day</FormLabel>
                                    <FormControl><Input type="number" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>
                        <FormField control={form.control} name="raidTrainBonusSlotsRequiredPoints" render={({ field }) => (
                            <FormItem>
                                <FormLabel>{useAttendance ? 'Attendance' : 'Points'} for Bonus Slots</FormLabel>
                                <FormControl><Input type="number" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="raidTrainAllowEmergencyWithSlot" render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm mt-4">
                                <div className="space-y-0.5">
                                    <FormLabel>Allow Emergency if Signed-up</FormLabel>
                                    <FormDescription className="text-xs">
                                        Allow users with a spot to also claim an emergency slot.
                                    </FormDescription>
                                </div>
                                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                            </FormItem>
                        )} />
                    </CardContent>
                    <CardFooter className="gap-2">
                        <Button type="submit" disabled={isPending || !guildId} size="sm">
                            {isPending ? <Loader2 className="mr-2 animate-spin"/> : <Wand2 className="mr-2"/>}
                            Save Rules
                        </Button>
                        <FullScheduleDialog guildId={guildId} onScheduleChange={onSettingsSaved} />
                    </CardFooter>
                </form>
            </Form>
        </Card>
    )
}

