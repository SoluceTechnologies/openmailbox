import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/storage';
import { getInitialLanguage, type AppLanguage } from '@/utils/i18n';

export type ThemePreference = 'system' | 'light' | 'dark';

interface SettingsState {
  themePreference: ThemePreference;
  language: AppLanguage;
  hapticsEnabled: boolean;
  reduceMotion: boolean;
  loadRemoteImages: boolean;
  defaultAccountId: string | null;
  setThemePreference: (preference: ThemePreference) => void;
  setLanguage: (language: AppLanguage) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setLoadRemoteImages: (enabled: boolean) => void;
  setDefaultAccountId: (accountId: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themePreference: 'system',
      language: getInitialLanguage(),
      hapticsEnabled: true,
      reduceMotion: false,
      loadRemoteImages: false,
      defaultAccountId: null,
      setThemePreference: (themePreference) => set({ themePreference }),
      setLanguage: (language) => set({ language }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setLoadRemoteImages: (loadRemoteImages) => set({ loadRemoteImages }),
      setDefaultAccountId: (defaultAccountId) => set({ defaultAccountId }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => zustandStorage),
      partialize: ({ themePreference, language, hapticsEnabled, reduceMotion, loadRemoteImages, defaultAccountId }) => ({
        themePreference,
        language,
        hapticsEnabled,
        reduceMotion,
        loadRemoteImages,
        defaultAccountId,
      }),
    },
  ),
);
