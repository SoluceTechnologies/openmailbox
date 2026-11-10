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
  contactPictures: boolean;
  defaultAccountId: string | null;
  signatures: Record<string, string>;
  notificationsEnabled: boolean;
  silencedAccountIds: string[];
  setThemePreference: (preference: ThemePreference) => void;
  setLanguage: (language: AppLanguage) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setLoadRemoteImages: (enabled: boolean) => void;
  setContactPictures: (enabled: boolean) => void;
  setDefaultAccountId: (accountId: string | null) => void;
  setSignature: (accountId: string, signature: string) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setAccountNotified: (accountId: string, notified: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themePreference: 'system',
      language: getInitialLanguage(),
      hapticsEnabled: true,
      reduceMotion: false,
      loadRemoteImages: false,
      contactPictures: true,
      defaultAccountId: null,
      signatures: {},
      notificationsEnabled: true,
      silencedAccountIds: [],
      setThemePreference: (themePreference) => set({ themePreference }),
      setLanguage: (language) => set({ language }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setLoadRemoteImages: (loadRemoteImages) => set({ loadRemoteImages }),
      setContactPictures: (contactPictures) => set({ contactPictures }),
      setDefaultAccountId: (defaultAccountId) => set({ defaultAccountId }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setAccountNotified: (accountId, notified) =>
        set(({ silencedAccountIds }) => ({
          silencedAccountIds: notified
            ? silencedAccountIds.filter((silenced) => silenced !== accountId)
            : [...new Set([...silencedAccountIds, accountId])],
        })),
      setSignature: (accountId, signature) =>
        set(({ signatures }) => {
          const { [accountId]: _previous, ...others } = signatures;
          return { signatures: signature.trim() ? { ...others, [accountId]: signature } : others };
        }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => zustandStorage),
      partialize: ({
        themePreference,
        language,
        hapticsEnabled,
        reduceMotion,
        loadRemoteImages,
        contactPictures,
        defaultAccountId,
        signatures,
        notificationsEnabled,
        silencedAccountIds,
      }) => ({
        themePreference,
        language,
        hapticsEnabled,
        reduceMotion,
        loadRemoteImages,
        contactPictures,
        defaultAccountId,
        signatures,
        notificationsEnabled,
        silencedAccountIds,
      }),
    },
  ),
);
