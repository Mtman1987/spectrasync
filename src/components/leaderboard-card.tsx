

"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Medal, Loader2 } from "lucide-react"
import { ScrollArea } from "./ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"
import type { LeaderboardUser } from "@/app/leaderboard/actions"
import { Skeleton } from "./ui/skeleton"

interface LeaderboardCardProps {
    leaderboardData: LeaderboardUser[];
    isLoading: boolean;
}

export function LeaderboardCard({ leaderboardData, isLoading }: LeaderboardCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Medal/> Leaderboard</CardTitle>
        <CardDescription>Top community supporters.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[280px]">
           {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
           ) : (
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead className="w-[50px]">Rank</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {leaderboardData.map((user, index) => (
                    <TableRow key={user.twitchId}>
                    <TableCell className="font-bold text-center">{index + 1}</TableCell>
                    <TableCell className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatarUrl} alt={user.displayName} data-ai-hint="user avatar" />
                        <AvatarFallback>{user.displayName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium truncate">{user.displayName}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{user.points}</TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
           )}
        </ScrollArea>
        {!isLoading && leaderboardData.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            No leaderboard data yet.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
