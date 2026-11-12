import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/storage';
import type { InboxFilter } from '@/features/categories/categories';
import { getInitialLanguage, type AppLanguage } from '@/utils/i18n';

export type ThemePreference = 'system' | 'light' | 'dark';

function withText(texts: Record<string, string>, accountId: string, text: string): Record<string, string> {
  const { [accountId]: _previous, ...others } = texts;
  return text.trim() ? { ...others, [accountId]: text } : others;
}

interface SettingsState {
  themePreference: ThemePreference;
  language: AppLanguage;
  hapticsEnabled: boolean;
  reduceMotion: boolean;
  loadRemoteImages: boolean;
  contactPictures: boolean;
  defaultAccountId: string | null;
  signatures: Record<string, string>;
  accountNames: Record<string, string>;
  notificationsEnabled: boolean;
  silencedAccountIds: string[];
  inboxFilter: InboxFilter;
  setThemePreference: (preference: ThemePreference) => void;
  setLanguage: (language: AppLanguage) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setLoadRemoteImages: (enabled: boolean) => void;
  setContactPictures: (enabled: boolean) => void;
  setDefaultAccountId: (accountId: string | null) => void;
  setSignature: (accountId: string, signature: string) => void;
  setAccountName: (accountId: string, name: string) => void;
  forgetAccount: (accountId: string) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setAccountNotified: (accountId: string, notified: boolean) => void;
  setInboxFilter: (filter: InboxFilter) => void;
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
      accountNames: {},
      notificationsEnabled: true,
      silencedAccountIds: [],
      inboxFilter: 'primary',
      setThemePreference: (themePreference) => set({ themePreference }),
      setLanguage: (language) => set({ language }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setLoadRemoteImages: (loadRemoteImages) => set({ loadRemoteImages }),
      setContactPictures: (contactPictures) => set({ contactPictures }),
      setDefaultAccountId: (defaultAccountId) => set({ defaultAccountId }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setInboxFilter: (inboxFilter) => set({ inboxFilter }),
      setAccountNotified: (accountId, notified) =>
        set(({ silencedAccountIds }) => ({
          silencedAccountIds: notified
            ? silencedAccountIds.filter((silenced) => silenced !== accountId)
            : [...new Set([...silencedAccountIds, accountId])],
        })),
      setSignature: (accountId, signature) => set(({ signatures }) => ({ signatures: withText(signatures, accountId, signature) })),
      setAccountName: (accountId, name) => set(({ accountNames }) => ({ accountNames: withText(accountNames, accountId, name) })),
      forgetAccount: (accountId) =>
        set(({ signatures, accountNames, silencedAccountIds }) => ({
          signatures: withText(signatures, accountId, ''),
          accountNames: withText(accountNames, accountId, ''),
          silencedAccountIds: silencedAccountIds.filter((silenced) => silenced !== accountId),
        })),
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
        accountNames,
        notificationsEnabled,
        silencedAccountIds,
        inboxFilter,
      }) => ({
        themePreference,
        language,
        hapticsEnabled,
        reduceMotion,
        loadRemoteImages,
        contactPictures,
        defaultAccountId,
        signatures,
        accountNames,
        notificationsEnabled,
        silencedAccountIds,
        inboxFilter,
      }),
    },
  ),
);
