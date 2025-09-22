"use client";

import React, { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import { format, addDays, isSameDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getRaidTrainSchedule, manualOverrideSlot } from "@/app/raid-train/actions";
import type { Signup, EmergencySignup, BlockedSignup } from "@/app/raid-train/actions";

interface FullScheduleDialogProps {
  guildId: string | null;
  onScheduleChange: () => void;
}

export function FullScheduleDialog({ guildId, onScheduleChange }: FullScheduleDialogProps) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [signups, setSignups] = useState<Record<string, Signup | EmergencySignup | BlockedSignup>>({});
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchSchedule = useCallback(() => {
    if (!guildId) {
      return;
    }

    const dateKey = format(selectedDate, "yyyy-MM-dd");
    setIsLoading(true);
    getRaidTrainSchedule(guildId, dateKey).then((data) => {
      setSignups(data);
      setIsLoading(false);
    });
  }, [guildId, selectedDate]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const dates = React.useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(new Date(), i)), []);

  const handleSlotUpdate = () => {
    fetchSchedule();
    onScheduleChange();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">View Full Schedule</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Raid Train Full Schedule</DialogTitle>
          <DialogDescription>
            View the upcoming week and manually manage slots as an admin.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2 mb-4">
          {dates.map((date) => (
            <Button
              key={date.toISOString()}
              variant={isSameDay(date, selectedDate) ? "default" : "outline"}
              onClick={() => setSelectedDate(date)}
              disabled={isLoading}
            >
              {format(date, "EEE, MMM d")}
            </Button>
          ))}
        </div>
        <ScheduleGrid
          isLoading={isLoading}
          signups={signups}
          date={selectedDate}
          guildId={guildId}
          onSlotUpdate={handleSlotUpdate}
        />
      </DialogContent>
    </Dialog>
  );
}

interface ManualOverrideDialogProps {
  guildId: string | null;
  date: Date;
  time: string;
  onSlotUpdate: () => void;
  children: ReactNode;
}

function ManualOverrideDialog({ guildId, date, time, onSlotUpdate, children }: ManualOverrideDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [twitchUsername, setTwitchUsername] = useState("");
  const { toast } = useToast();

  const handleAction = (action: "assign" | "block" | "clear") => {
    if (!guildId) {
      return;
    }
    const dateKey = format(date, "yyyy-MM-dd");
    startTransition(async () => {
      const result = await manualOverrideSlot(guildId, dateKey, time, action, twitchUsername);
      if (result.success) {
        toast({ title: "Slot Updated", description: result.message });
        onSlotUpdate();
        setIsOpen(false);
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Manage Slot: {time} on {format(date, "MMMM d")}
          </DialogTitle>
          <DialogDescription>
            Manually assign, block, or clear this raid train time slot.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center space-x-2">
            <Input
              placeholder="Twitch Username"
              value={twitchUsername}
              onChange={(event) => setTwitchUsername(event.target.value)}
            />
            <Button onClick={() => handleAction("assign")} disabled={isPending || !twitchUsername}>
              Assign User
            </Button>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => handleAction("block")}
              disabled={isPending}
            >
              Block Slot
            </Button>
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => handleAction("clear")}
              disabled={isPending}
            >
              Clear Slot
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ScheduleGridProps {
  isLoading: boolean;
  signups: Record<string, Signup | EmergencySignup | BlockedSignup>;
  date: Date;
  guildId: string | null;
  onSlotUpdate: () => void;
}

function ScheduleGrid({ isLoading, signups, date, guildId, onSlotUpdate }: ScheduleGridProps) {
  const timeSlots = React.useMemo(() => Array.from({ length: 24 }).map((_, index) => `${index.toString().padStart(2, "0")}:00`), []);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
        {Array.from({ length: 24 }).map((_, index) => (
          <div key={index} className="w-full h-auto p-2 flex flex-col items-center justify-center gap-1 aspect-square border rounded-lg">
            <Loader2 className="animate-spin" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
      {timeSlots.map((slot) => {
        const signup = signups[slot];
        const isEmergency = signup?.id === "emergency";
        const isBlocked = signup?.id === "blocked";
        const isTaken = Boolean(signup && !isEmergency && !isBlocked);

        return (
          <ManualOverrideDialog key={slot} guildId={guildId} date={date} time={slot} onSlotUpdate={onSlotUpdate}>
            <Button
              variant={isEmergency ? "destructive" : isBlocked ? "secondary" : isTaken ? "outline" : "ghost"}
              className="w-full h-auto p-2 flex flex-col items-center justify-center gap-1 aspect-square"
              title={signup ? signup.name : "Open"}
            >
              <span className="font-bold">{slot}</span>
              {signup ? (
                <div className="flex flex-col items-center gap-1 text-xs">
                  {isEmergency ? (
                    <AlertTriangle className="h-5 w-5 text-destructive-foreground" />
                  ) : isBlocked ? (
                    <div className="h-5 w-5" />
                  ) : (
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={signup.avatar} alt={signup.name} data-ai-hint="streamer avatar" />
                      <AvatarFallback>{signup.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                  )}
                  <span className="truncate">{signup.name}</span>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">Open</span>
              )}
            </Button>
          </ManualOverrideDialog>
        );
      })}
    </div>
  );
}
