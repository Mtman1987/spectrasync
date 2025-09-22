
# Cosmic Raid

Welcome to Cosmic Raid, a Next.js application built with Firebase Studio. This suite of powerful tools is designed to help you manage, engage, and grow your Twitch community through seamless Discord integration.

## Core Features

- **Unified Admin Dashboard**: A central hub to get a real-time overview of your community's activity, upcoming events, and recent actions.
- **Raid Pile**: A dynamic, fair-play queue for community raids. Members join the pile, and the app automatically features the member who has been live the longest.
- **Raid Train**: A robust scheduling system for community raid events. Admins can set rules for participation (based on points or attendance), and members can sign up for specific time slots.
- **Community Pool**: A free-for-all showcase where any community member can opt-in to get visibility on the web app and in a dedicated Discord channel whenever they go live.
- **VIP Live Showcase**: A curated space to feature your most valued community members (VIPs, mods, partners). When a VIP goes live, they are prominently displayed with an embedded stream and custom message.
- **Community Spotlight**: An AI-powered tool that helps you and your members craft polished, engaging posts to showcase content, announcements, or positive messages.
- **Team Chat**: A private, real-time chat interface for your moderation and admin team, synced across the web app and your private Discord channels.
- **Analytics & Calendar**: Track community engagement through a point system and view a comprehensive schedule of all community events, from raid trains to member-submitted activities.
- **Secure Authentication**: Simple, secure authentication flows for both admins and general users, leveraging Discord and Twitch for identity.
- **Firestore Database Backend**: All data—from user profiles and points to event schedules and settings—is stored and managed in a reliable Firestore database.

---

## Administrator's Guide

This section covers everything you need to know to get your community set up and running with Cosmic Raid.

### 1. Initial Setup & Configuration

- **Run the App**:
  ```bash
  npm run dev
  ```
  Open `http://localhost:9002` in your browser.

- **Connect Your Admin Account**: The setup page will guide you. Click "Connect Discord Account" and authorize the app. You must be an administrator in the Discord server you wish to manage.
- **Select Your Community**: After authorizing, select the server you want to manage from the dropdown. This choice is saved to your profile.
- **Link Your Twitch Account**: In the **Settings** page, you'll be prompted to link your Twitch account. This is crucial for identifying you as an admin in bot interactions.

### 2. Setting Up Your Discord Server

The true power of Cosmic Raid comes from its Discord bot integration. Use these slash commands in your server to create interactive channels.

- **`/raid-pile`**: Posts a live-updating embed showing the current Raid Pile holder and the queue.
- **`/raid-train`**: Posts the interactive Raid Train schedule, allowing users to view and sign up for slots.
- **`/community-pool`**: Sets up a channel where the bot will post live cards for any opted-in member who is streaming.
- **`/vip-live`**: Designates a channel for the bot to post special announcements when one of your VIPs goes live.
- **`/calendar`**: Posts the interactive community calendar, showing upcoming events and Captain's Log signups.
- **`/leaderboard`**: Posts an embed showing the top community members ranked by points.
- **`/disable-feature [feature]`**: A cleanup command. This will stop the bot's tracker for a feature (e.g., VIP Live) and attempt to delete its managed messages from the channel.

### 3. Managing Your Community

- **Dashboard**: Your main overview. See recent activity, upcoming events, and configure the point system.
- **Raid Train Page**: This is your command center for raids.
  - Configure all rules: point/attendance requirements, slots per day, and emergency slot rules.
  - View the full weekly schedule and manually override any slot (assign, block, or clear).
  - Look up any member's raid attendance history.
- **VIP Live Page**: Add or remove VIPs. When a VIP is live, you can manually trigger a "go live" notification to all configured webhook channels.
- **Settings Page**: Link your accounts, configure Discord webhooks for bot notifications, and use developer tools to give yourself points for testing.

---

## Community Member's Guide

Welcome to the community! Here’s how you can participate and get involved using the Cosmic Raid tools.

### How to Join and Participate

- **Joining the Raid Pile**: In the `#raid-pile` channel in Discord, click the "Join Raid Pile" button. As long as you are live on Twitch, you'll be added to the queue. The person who has been live the longest becomes the "Pile Holder" and is next to be raided.
- **Joining the Community Pool**: In the `#community-pool` channel, click the "Join Community Pool" button. Once you've joined, you'll be automatically featured on the Community Pool page and in the Discord channel whenever you go live.
- **Signing Up for the Raid Train**:
  - Use the `/raid-train` embed in Discord.
  - Click the "Sign Up" button to see the schedule for the upcoming days.
  - Select a day to view its schedule.
  - Click "Claim Spot" and enter the 24-hour time slot you wish to claim (e.g., `14:00`).
  - *Note*: You must meet the point or attendance requirements set by the admins to claim a spot.
- **Using Quick Links**: Admins may share direct links to join the Raid Pile, Community Pool, or Raid Train. These links will guide you through a quick authentication and sign-up process in your browser.

### Earning Points

You earn points by being an active and supportive community member! Here are some of the ways you can earn points (admins can change the values):

- **Participating in a Community Raid**
- **Signing up for a Raid Train**
- **Claiming a "Captain's Log" spot on the calendar**
- **Following a community member on Twitch**
- **Subscribing to a community member**
- **Cheering with Bits**
- **Contributing to a Hype Train**

---
Built with passion by Mtman1987 & your AI Partner.
