"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2, Sparkles, Copy, Wand2 } from "lucide-react";
import { generateUserContent } from "@/ai/flows/generate-user-content";
import type { GenerateUserContentOutput } from "@/ai/flows/schemas";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  userDraft: z.string().min(10, {
    message: "Your showcase idea must be at least 10 characters.",
  }).max(500, {
      message: "Your draft cannot exceed 500 characters."
  }),
});

export function UserContentGenerator() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateUserContentOutput | null>(
    null
  );
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      userDraft: "Hey everyone! I'm going live later today at 8 PM EST with a special charity stream for a local animal shelter. We'll be playing some fun community games. Hope to see you there!",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    setResult(null);
    try {
      const output = await generateUserContent(values);
      setResult(output);
    } catch (error) {
      console.error("Error generating content:", error);
      toast({
        title: "Content Generation Error",
        description: "The AI was unable to process your request. This can happen if the input is inappropriate or violates safety policies. Please revise your draft and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (result?.showcasePost) {
      navigator.clipboard.writeText(result.showcasePost);
      toast({
        title: "Copied!",
        description: "Showcase post copied to clipboard.",
      });
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Your Idea</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="userDraft"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>What do you want to showcase?</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Share your announcement, project, or positive message here..."
                        className="min-h-[200px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Our AI assistant will help refine your message. Content is checked for appropriateness.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                Polish My Post
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <Card className="flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-headline">Generated Showcase Post</CardTitle>
          {result && (
            <Button variant="ghost" size="icon" onClick={handleCopy}>
              <Copy className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex-1">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-4">Generating your post...</p>
            </div>
          )}
          {result && (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap bg-muted rounded-md p-4 h-full">
              {result.showcasePost}
            </div>
          )}
          {!loading && !result && (
            <div className="flex items-center justify-center h-full text-center text-muted-foreground">
              <p>Your AI-polished showcase post will appear here.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
