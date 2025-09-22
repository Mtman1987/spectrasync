
"use client"

import type { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./sidebar";
import { AppHeader } from "./header";
import { ScrollArea } from "../ui/scroll-area";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
            <AppHeader />
            <div className="flex-1 flex flex-col overflow-hidden">
                <ScrollArea className="flex-1">
                    <main className="p-4 sm:p-6 lg:p-8">
                      {children}
                    </main>
                </ScrollArea>
            </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
