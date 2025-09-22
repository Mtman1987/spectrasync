
'use server';

import type { LiveUser } from '../raid-pile/types';
// EmbedBuilder is removed from here to prevent client-side bundling issues.
// The logic is moved to the bot tracker file.

// This file is now simpler and doesn't contain discord.js specific code
// that would cause issues on the client.

// The buildSpotlightEmbed function has been moved to src/bot/community-pool-tracker.ts

