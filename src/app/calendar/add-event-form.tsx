
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/date-picker";
import { useToast } from "@/hooks/use-toast";
import { useTransition, useState } from "react";
import { Loader2, PlusCircle } from "lucide-react";
import { addCalendarEvent } from "./actions";

const FormSchema = z.object({
  name: z.string().min(1, "Event name is required."),
  date: z.date({ required_error: "Event date is required." }),
  time: z.string().min(1, "Event time is required."),
  type: z.enum(["Admin", "VIP", "Community"], {
    required_error: "Event type is required.",
  }),
  description: z.string().optional(),
});

export function AddEventForm({ onEventAdded, guildId }: { onEventAdded: () => void, guildId: string | null }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: "",
      time: "12:00 PM PST",
      type: "Admin",
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    if (!guildId) {
        toast({ title: "Error", description: "No community selected.", variant: "destructive" });
        return;
    }

    startTransition(async () => {
      const eventData = {
          ...data,
          date: data.date.toISOString(), // Store date as ISO string
      };
      
      const result = await addCalendarEvent(guildId, eventData);

      if (result.success) {
        toast({ title: "Event Added", description: "The new event has been added to the calendar." });
        setIsOpen(false);
        form.reset();
        onEventAdded(); // Callback to refresh the events list
      } else {
        toast({
          variant: "destructive",
          title: "Error adding event",
          description: result.error,
        });
      }
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2" />
          Add Event
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Add New Event</DialogTitle>
              <DialogDescription>
                Fill out the details below to add a new event to the community calendar.
              </DialogDescription>
            </DialogHeader>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Mod Meeting" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                    <FormLabel>Event Date</FormLabel>
                        <DatePicker date={field.value} setDate={field.onChange} />
                    <FormMessage />
                    </FormItem>
                )}
            />
             <FormField
              control={form.control}
              name="time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Time</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 8:00 PM EST" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Type</FormLabel>
                   <Select onValueChange={field.onChange} defaultValue={field.value}>
                     <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Select an event type" />
                        </SelectTrigger>
                     </FormControl>
                    <SelectContent>
                        <SelectItem value="Admin">Admin</SelectItem>
                        <SelectItem value="VIP">VIP</SelectItem>
                        <SelectItem value="Community">Community</SelectItem>
                    </SelectContent>
                   </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Event
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

    