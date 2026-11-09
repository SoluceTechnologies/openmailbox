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
  signatures: Record<string, string>;
  setThemePreference: (preference: ThemePreference) => void;
  setLanguage: (language: AppLanguage) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setLoadRemoteImages: (enabled: boolean) => void;
  setDefaultAccountId: (accountId: string | null) => void;
  /** An empty signature removes the account's entry. */
  setSignature: (accountId: string, signature: string) => void;
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
      signatures: {},
      setThemePreference: (themePreference) => set({ themePreference }),
      setLanguage: (language) => set({ language }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setLoadRemoteImages: (loadRemoteImages) => set({ loadRemoteImages }),
      setDefaultAccountId: (defaultAccountId) => set({ defaultAccountId }),
      setSignature: (accountId, signature) =>
        set(({ signatures }) => {
          const { [accountId]: _previous, ...others } = signatures;
          return { signatures: signature.trim() ? { ...others, [accountId]: signature } : others };
        }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => zustandStorage),
      partialize: ({ themePreference, language, hapticsEnabled, reduceMotion, loadRemoteImages, defaultAccountId, signatures }) => ({
        themePreference,
        language,
        hapticsEnabled,
        reduceMotion,
        loadRemoteImages,
        defaultAccountId,
        signatures,
      }),
    },
  ),
);
