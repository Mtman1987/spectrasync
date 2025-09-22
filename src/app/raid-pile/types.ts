
// src/app/raid-pile/types.ts

// Define the structure of a live user for the UI
export type LiveUser = {
  twitchId: string;
  twitchLogin: string;
  displayName: string;
  avatarUrl: string;
  latestGameName: string;
  latestViewerCount: number;
  latestStreamTitle?: string;
  vipMessage?: string; // Custom message for VIPs
  points?: number; // User's total points
  started_at?: string; // Stream start time from Twitch
};

// Define the structure of a single Raid Pile for the UI
export interface RaidPile {
  holder: LiveUser | null;
  liveUsers: LiveUser[];
  totalViewers: number;
}
