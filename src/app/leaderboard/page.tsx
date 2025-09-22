
import { AppLayout } from "@/components/layout/app-layout"

// This is a placeholder page to associate the server actions with a route.
// The actual leaderboard is displayed via Discord embeds.
export default function LeaderboardPage() {
  return (
    <AppLayout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline">
            Leaderboard
          </h1>
          <p className="text-muted-foreground">
            The community leaderboard is managed via the Discord bot. Use the `/leaderboard` command in your server.
          </p>
        </div>
      </div>
    </AppLayout>
  )
}
