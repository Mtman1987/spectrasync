"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { getAdminInfo, saveAdminInfo } from '@/app/actions';

type Guild = {
  id: string;
  name: string;
  icon: string | null;
};

type DiscordProfile = {
  id: string;
  username: string;
  avatar: string | null;
};

type TwitchProfile = {
  id: string;
  login: string;
  displayName: string;
  avatar: string | null;
};

type AdminProfile = {
  discordInfo?: DiscordProfile | null;
  twitchInfo?: TwitchProfile | null;
  discordUserGuilds?: Guild[];
  selectedGuild?: string | null;
};

interface CommunityContextType {
  selectedGuild: string | null;
  setSelectedGuild: (guildId: string | null) => Promise<void>;
  adminId: string | null;
  setAdminId: (id: string | null) => void;
  adminGuilds: Guild[];
  adminProfile: AdminProfile | null;
  refreshAdminProfile: (overrideAdminId?: string | null) => Promise<AdminProfile | null>;
  loading: boolean;
}

const CommunityContext = createContext<CommunityContextType | undefined>(undefined);

export const CommunityProvider = ({ children }: { children: ReactNode }) => {
  const [adminId, setAdminIdState] = useState<string | null>(null);
  const [selectedGuild, setSelectedGuildState] = useState<string | null>(null);
  const [adminGuilds, setAdminGuilds] = useState<Guild[]>([]);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAdminProfile = useCallback(async (overrideAdminId?: string | null) => {
    const targetAdminId = overrideAdminId ?? adminId ?? localStorage.getItem('adminDiscordId');

    if (!targetAdminId) {
      setAdminProfile(null);
      setAdminGuilds([]);
      return null;
    }

    try {
      const { value } = await getAdminInfo(targetAdminId);
      setAdminProfile(value ?? null);
      setAdminGuilds(value?.discordUserGuilds || []);
      return value ?? null;
    } catch (error) {
      console.error('[CommunityProvider] Failed to refresh admin profile', error);
      setAdminProfile(null);
      setAdminGuilds([]);
      return null;
    }
  }, [adminId]);

  const setAdminId = useCallback((id: string | null) => {
    setAdminIdState(id);
    if (id) {
      localStorage.setItem('adminDiscordId', id);
      void refreshAdminProfile(id);
    } else {
      localStorage.removeItem('adminDiscordId');
      localStorage.removeItem('selectedGuildId');
      setAdminGuilds([]);
      setAdminProfile(null);
      setSelectedGuildState(null);
    }
  }, [refreshAdminProfile]);

  const setSelectedGuild = useCallback(async (guildId: string | null) => {
    setSelectedGuildState(guildId);
    if (guildId) {
      localStorage.setItem('selectedGuildId', guildId);
      const currentAdminId = localStorage.getItem('adminDiscordId');
      if (currentAdminId) {
        await saveAdminInfo(currentAdminId, { selectedGuild: guildId });
        await refreshAdminProfile(currentAdminId);
      }
    } else {
      localStorage.removeItem('selectedGuildId');
    }
  }, [refreshAdminProfile]);

  useEffect(() => {
    const initializeCommunity = async () => {
      setLoading(true);
      const adminDiscordId = localStorage.getItem('adminDiscordId');
      setAdminIdState(adminDiscordId);

      if (adminDiscordId) {
        const profile = await refreshAdminProfile(adminDiscordId);
        const userGuilds = profile?.discordUserGuilds || [];

        const storedGuildId = localStorage.getItem('selectedGuildId');

        if (storedGuildId) {
          if (userGuilds.length === 0 || userGuilds.some((g: Guild) => g.id === storedGuildId)) {
            setSelectedGuildState(storedGuildId);
          } else if (userGuilds.length > 0) {
            const defaultGuildId = userGuilds[0].id;
            await setSelectedGuild(defaultGuildId);
          } else {
            setSelectedGuildState(null);
          }
        } else if (userGuilds.length > 0) {
          const defaultGuildId = userGuilds[0].id;
          await setSelectedGuild(defaultGuildId);
        } else {
          setSelectedGuildState(null);
        }
      } else {
        setAdminGuilds([]);
        setAdminProfile(null);
        setSelectedGuildState(null);
      }
      setLoading(false);
    };

    void initializeCommunity();
  }, [refreshAdminProfile, setSelectedGuild]);

  return (
    <CommunityContext.Provider
      value={{
        selectedGuild,
        setSelectedGuild,
        adminId,
        setAdminId,
        adminGuilds,
        adminProfile,
        refreshAdminProfile,
        loading,
      }}
    >
      {children}
    </CommunityContext.Provider>
  );
};

export const useCommunity = () => {
  const context = useContext(CommunityContext);
  if (context === undefined) {
    throw new Error('useCommunity must be used within a CommunityProvider');
  }
  return context;
};
