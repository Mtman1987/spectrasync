
"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { getAdminInfo, saveAdminInfo } from '@/app/actions';

type Guild = {
  id: string;
  name: string;
  icon: string | null;
};

interface CommunityContextType {
  selectedGuild: string | null;
  setSelectedGuild: (guildId: string | null) => void;
  adminId: string | null;
  setAdminId: (id: string | null) => void;
  adminGuilds: Guild[];
  loading: boolean;
}

const CommunityContext = createContext<CommunityContextType | undefined>(undefined);

export const CommunityProvider = ({ children }: { children: ReactNode }) => {
  const [adminId, setAdminIdState] = useState<string | null>(null);
  const [selectedGuild, setSelectedGuildState] = useState<string | null>(null);
  const [adminGuilds, setAdminGuilds] = useState<Guild[]>([]);
  const [loading, setLoading] = useState(true);
  
  const setAdminId = useCallback((id: string | null) => {
    setAdminIdState(id);
    if (id) {
      localStorage.setItem('adminDiscordId', id);
    } else {
      // This is the logout path
      localStorage.removeItem('adminDiscordId');
      localStorage.removeItem('selectedGuildId');
      setAdminGuilds([]);
      setSelectedGuildState(null);
    }
  }, []);

  const setSelectedGuild = useCallback(async (guildId: string | null) => {
    setSelectedGuildState(guildId);
    if (guildId) {
        localStorage.setItem('selectedGuildId', guildId);
        // Only try to save if adminId is also present.
        const currentAdminId = localStorage.getItem('adminDiscordId');
        if(currentAdminId) {
            await saveAdminInfo(currentAdminId, { selectedGuild: guildId });
        }
    } else {
        localStorage.removeItem('selectedGuildId');
    }
  }, []);


  useEffect(() => {
    const initializeCommunity = async () => {
      setLoading(true);
      const adminDiscordId = localStorage.getItem('adminDiscordId');
      setAdminIdState(adminDiscordId);

      if (adminDiscordId) {
        const { value } = await getAdminInfo(adminDiscordId);
        const userGuilds = value?.discordUserGuilds || [];
        setAdminGuilds(userGuilds);

        const storedGuildId = localStorage.getItem('selectedGuildId');

        if (storedGuildId) {
          if (userGuilds.length === 0 || userGuilds.some((g: Guild) => g.id === storedGuildId)) {
            setSelectedGuildState(storedGuildId);
          } else if (userGuilds.length > 0) {
            // Stored guild is no longer valid; fall back to the first guild from Discord.
            const defaultGuildId = userGuilds[0].id;
            await setSelectedGuild(defaultGuildId);
          } else {
            setSelectedGuildState(null);
          }
        } else if (userGuilds.length > 0) {
          // If no guild is selected, default to the first available one.
          const defaultGuildId = userGuilds[0].id;
          await setSelectedGuild(defaultGuildId);
        } else {
          // No guilds available for this user
          setSelectedGuildState(null);
        }
      } else {
         // If no adminId, ensure everything is cleared
         setAdminGuilds([]);
         setSelectedGuildState(null);
      }
      setLoading(false);
    };
    initializeCommunity();
  }, [adminId, setSelectedGuild]);


  return (
    <CommunityContext.Provider value={{ selectedGuild, setSelectedGuild, adminId, setAdminId, adminGuilds, loading }}>
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
