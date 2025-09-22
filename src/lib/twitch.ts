/**
 * Twitch API helpers used by server actions. These functions run on the server
 * and reuse cached app access tokens to minimize auth round-trips.
 */

let appAccessToken: { token: string; expires_at: number } | null = null;

export type BasicTwitchUser = {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
};

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    return [items];
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function getTwitchAppAccessToken() {
  if (appAccessToken && Date.now() < appAccessToken.expires_at) {
    return appAccessToken.token;
  }

  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
    throw new Error('Twitch client ID or secret is not configured in environment variables.');
  }

  const url = `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
  const response = await fetch(url, { method: 'POST' });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Failed to get Twitch app access token: ${data.message || 'Unknown error'}`);
  }

  appAccessToken = {
    token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  return appAccessToken.token;
}

export async function getTwitchUserByUsername(username: string): Promise<BasicTwitchUser | null> {
  if (!process.env.TWITCH_CLIENT_ID) {
    console.error('Twitch Client ID is not set.');
    return null;
  }
  try {
    const accessToken = await getTwitchAppAccessToken();
    const url = `https://api.twitch.tv/helix/users?login=${username.toLowerCase()}`;

    const response = await fetch(url, {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error(`Twitch API error: ${response.status} ${await response.text()}`);
      return null;
    }

    const data = await response.json();
    return data.data && data.data.length > 0 ? (data.data[0] as BasicTwitchUser) : null;
  } catch (error) {
    console.error('Error fetching Twitch user by username:', error);
    return null;
  }
}

export async function getTwitchUserById(userId: string): Promise<BasicTwitchUser | null> {
  if (!process.env.TWITCH_CLIENT_ID) {
    console.error('Twitch Client ID is not set.');
    return null;
  }

  try {
    const accessToken = await getTwitchAppAccessToken();
    const url = `https://api.twitch.tv/helix/users?id=${userId}`;
    const response = await fetch(url, {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error(`Twitch API error (getUserById): ${response.status} ${await response.text()}`);
      return null;
    }

    const data = await response.json();
    const record = Array.isArray(data.data) && data.data.length > 0 ? (data.data[0] as BasicTwitchUser) : null;
    return record ?? null;
  } catch (error) {
    console.error('Error fetching Twitch user by ID:', error);
    return null;
  }
}

export async function getTwitchStreams(userIds: string[]): Promise<any[]> {
  if (userIds.length === 0) return [];

  if (!process.env.TWITCH_CLIENT_ID) {
    console.error('Twitch Client ID is not set.');
    return [];
  }
  try {
    const accessToken = await getTwitchAppAccessToken();
    const params = new URLSearchParams();
    userIds.forEach((id) => params.append('user_id', id));

    const url = `https://api.twitch.tv/helix/streams?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error(`Twitch API error (getStreams): ${response.status} ${await response.text()}`);
      return [];
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching Twitch streams:', error);
    return [];
  }
}

export async function getTwitchClips(broadcasterId: string, limit = 5): Promise<any[]> {
  if (!process.env.TWITCH_CLIENT_ID) {
    console.error('Twitch Client ID is not set.');
    return [];
  }
  try {
    const accessToken = await getTwitchAppAccessToken();
    const startedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const url = `https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&first=${limit}&started_at=${startedAt}`;

    const response = await fetch(url, {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error(`Twitch API error (getClips): ${response.status} ${await response.text()}`);
      return [];
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching Twitch clips:', error);
    return [];
  }
}

export async function getTwitchUsersByLogins(logins: string[]): Promise<BasicTwitchUser[]> {
  if (logins.length === 0) {
    return [];
  }

  if (!process.env.TWITCH_CLIENT_ID) {
    console.error('Twitch Client ID is not set.');
    return [];
  }

  try {
    const dedupedLogins = Array.from(new Set(logins.map((login) => login.toLowerCase())));
    const accessToken = await getTwitchAppAccessToken();
    const chunks = chunkArray(dedupedLogins, 100);
    const results: BasicTwitchUser[] = [];

    for (const chunk of chunks) {
      const params = new URLSearchParams();
      chunk.forEach((login) => params.append('login', login));
      const url = `https://api.twitch.tv/helix/users?${params.toString()}`;
      const response = await fetch(url, {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENT_ID,
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        console.error(`Twitch API error (getUsersByLogins): ${response.status} ${await response.text()}`);
        continue;
      }

      const data = await response.json();
      if (Array.isArray(data.data)) {
        results.push(...(data.data as BasicTwitchUser[]));
      }
    }

    return results;
  } catch (error) {
    console.error('Error fetching Twitch users by logins:', error);
    return [];
  }
}

export async function getTwitchChatParticipants(channelLogin: string): Promise<string[]> {
  if (!channelLogin) {
    return [];
  }

  try {
    const response = await fetch(`https://tmi.twitch.tv/group/user/${channelLogin.toLowerCase()}/chatters`);
    if (!response.ok) {
      console.error(`Twitch chatters API error: ${response.status} ${await response.text()}`);
      return [];
    }

    const data = await response.json();
    const chatters = data?.chatters ?? {};
    const roles = Object.keys(chatters);
    const participants: string[] = [];
    for (const role of roles) {
      const list: unknown = chatters[role];
      if (Array.isArray(list)) {
        participants.push(...list);
      }
    }
    return participants.map((login) => String(login).toLowerCase());
  } catch (error) {
    console.error('Error fetching Twitch chat participants:', error);
    return [];
  }
}
