import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/storage';
import type { InboxFilter } from '@/features/categories/categories';
import { DEFAULT_FILTER_CRITERIA, type FilterCriteria } from '@/features/threads/threadFilter';
import { linkedHtml } from '@/features/composer/prefill';
import type { TimeFormat } from '@/utils/dates';
import { getInitialLanguage, type AppLanguage } from '@/utils/i18n';

export type ThemePreference = 'system' | 'light' | 'dark';

export type Signature = { html: string; text: string };

export type Identity = { id: string; name: string; email: string; signature: Signature };

export function isBlankSignature(signature: Signature): boolean {
  return !signature.text.trim() && !/<img|url\(/i.test(signature.html);
}

function withIdentities(identities: Record<string, Identity[]>, accountId: string, list: Identity[]): Record<string, Identity[]> {
  const { [accountId]: _previous, ...others } = identities;
  return list.length > 0 ? { ...others, [accountId]: list } : others;
}

function withSignature(signatures: Record<string, Signature>, accountId: string, signature: Signature | null): Record<string, Signature> {
  const { [accountId]: _previous, ...others } = signatures;
  return signature && !isBlankSignature(signature) ? { ...others, [accountId]: signature } : others;
}

type LegacySignatures = { signatures?: Record<string, string>; identities?: Record<string, (Omit<Identity, 'signature'> & { signature: string })[]> };

function fromText(text: string): Signature {
  return { html: linkedHtml(text), text };
}

function withText(texts: Record<string, string>, accountId: string, text: string): Record<string, string> {
  const { [accountId]: _previous, ...others } = texts;
  return text.trim() ? { ...others, [accountId]: text } : others;
}

interface SettingsState {
  themePreference: ThemePreference;
  language: AppLanguage;
  timeFormat: TimeFormat;
  hapticsEnabled: boolean;
  reduceMotion: boolean;
  loadRemoteImages: boolean;
  contactPictures: boolean;
  sentFromFooter: boolean;
  defaultAccountId: string | null;
  signatures: Record<string, Signature>;
  accountNames: Record<string, string>;
  identities: Record<string, Identity[]>;
  notificationsEnabled: boolean;
  silencedAccountIds: string[];
  inboxFilter: InboxFilter;
  collapsedIds: string[];
  accountOrder: string[];
  categorySeenAt: Partial<Record<InboxFilter, number>>;
  filterEnabled: boolean;
  filterCriteria: FilterCriteria;
  setThemePreference: (preference: ThemePreference) => void;
  setLanguage: (language: AppLanguage) => void;
  setTimeFormat: (timeFormat: TimeFormat) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setLoadRemoteImages: (enabled: boolean) => void;
  setContactPictures: (enabled: boolean) => void;
  setSentFromFooter: (enabled: boolean) => void;
  setDefaultAccountId: (accountId: string | null) => void;
  setSignature: (accountId: string, signature: Signature) => void;
  setAccountName: (accountId: string, name: string) => void;
  saveIdentity: (accountId: string, identity: Identity) => void;
  removeIdentity: (accountId: string, identityId: string) => void;
  forgetAccount: (accountId: string) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setAccountNotified: (accountId: string, notified: boolean) => void;
  setInboxFilter: (filter: InboxFilter) => void;
  toggleCollapsed: (id: string) => void;
  setAccountOrder: (accountIds: string[]) => void;
  markCategorySeen: (filter: InboxFilter, receivedAt: number) => void;
  setFilterEnabled: (enabled: boolean) => void;
  setFilterCriteria: (criteria: Partial<FilterCriteria>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themePreference: 'system',
      language: getInitialLanguage(),
      timeFormat: 'system',
      hapticsEnabled: true,
      reduceMotion: false,
      loadRemoteImages: false,
      contactPictures: true,
      sentFromFooter: true,
      defaultAccountId: null,
      signatures: {},
      accountNames: {},
      identities: {},
      notificationsEnabled: true,
      silencedAccountIds: [],
      inboxFilter: 'primary',
      collapsedIds: [],
      accountOrder: [],
      categorySeenAt: {},
      filterEnabled: false,
      filterCriteria: DEFAULT_FILTER_CRITERIA,
      setThemePreference: (themePreference) => set({ themePreference }),
      setLanguage: (language) => set({ language }),
      setTimeFormat: (timeFormat) => set({ timeFormat }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setLoadRemoteImages: (loadRemoteImages) => set({ loadRemoteImages }),
      setContactPictures: (contactPictures) => set({ contactPictures }),
      setSentFromFooter: (sentFromFooter) => set({ sentFromFooter }),
      setDefaultAccountId: (defaultAccountId) => set({ defaultAccountId }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setInboxFilter: (inboxFilter) => set({ inboxFilter }),
      setFilterEnabled: (filterEnabled) => set({ filterEnabled }),
      setFilterCriteria: (criteria) => set(({ filterCriteria }) => ({ filterCriteria: { ...filterCriteria, ...criteria } })),
      toggleCollapsed: (id) =>
        set(({ collapsedIds }) => ({
          collapsedIds: collapsedIds.includes(id) ? collapsedIds.filter((collapsed) => collapsed !== id) : [...collapsedIds, id],
        })),
      setAccountNotified: (accountId, notified) =>
        set(({ silencedAccountIds }) => ({
          silencedAccountIds: notified
            ? silencedAccountIds.filter((silenced) => silenced !== accountId)
            : [...new Set([...silencedAccountIds, accountId])],
        })),
      setSignature: (accountId, signature) => set(({ signatures }) => ({ signatures: withSignature(signatures, accountId, signature) })),
      setAccountOrder: (accountOrder) => set({ accountOrder }),
      markCategorySeen: (filter, receivedAt) =>
        set(({ categorySeenAt }) =>
          receivedAt > (categorySeenAt[filter] ?? 0) ? { categorySeenAt: { ...categorySeenAt, [filter]: receivedAt } } : {},
        ),
      setAccountName: (accountId, name) => set(({ accountNames }) => ({ accountNames: withText(accountNames, accountId, name) })),
      saveIdentity: (accountId, identity) =>
        set(({ identities }) => {
          const list = identities[accountId] ?? [];
          const saved = list.some((existing) => existing.id === identity.id)
            ? list.map((existing) => (existing.id === identity.id ? identity : existing))
            : [...list, identity];
          return { identities: withIdentities(identities, accountId, saved) };
        }),
      removeIdentity: (accountId, identityId) =>
        set(({ identities }) => ({
          identities: withIdentities(identities, accountId, (identities[accountId] ?? []).filter((identity) => identity.id !== identityId)),
        })),
      forgetAccount: (accountId) =>
        set(({ signatures, accountNames, identities, silencedAccountIds, collapsedIds, accountOrder, filterCriteria }) => ({
          signatures: withSignature(signatures, accountId, null),
          accountNames: withText(accountNames, accountId, ''),
          identities: withIdentities(identities, accountId, []),
          silencedAccountIds: silencedAccountIds.filter((silenced) => silenced !== accountId),
          collapsedIds: collapsedIds.filter((collapsed) => collapsed !== accountId),
          accountOrder: accountOrder.filter((ordered) => ordered !== accountId),
          filterCriteria: {
            ...filterCriteria,
            excludedAccountIds: filterCriteria.excludedAccountIds.filter((excluded) => excluded !== accountId),
          },
        })),
    }),
    {
      name: 'settings-store',
      version: 1,
      migrate: (persisted) => {
        const { signatures = {}, identities = {}, ...rest } = persisted as LegacySignatures;
        return {
          ...rest,
          signatures: Object.fromEntries(Object.entries(signatures).map(([accountId, text]) => [accountId, fromText(text)])),
          identities: Object.fromEntries(
            Object.entries(identities).map(([accountId, list]) => [accountId, list.map((identity) => ({ ...identity, signature: fromText(identity.signature) }))]),
          ),
        } as unknown as SettingsState;
      },
      storage: createJSONStorage(() => zustandStorage),
      partialize: ({
        themePreference,
        language,
        timeFormat,
        hapticsEnabled,
        reduceMotion,
        loadRemoteImages,
        contactPictures,
        sentFromFooter,
        defaultAccountId,
        signatures,
        accountNames,
        identities,
        notificationsEnabled,
        silencedAccountIds,
        inboxFilter,
        collapsedIds,
        accountOrder,
        categorySeenAt,
        filterEnabled,
        filterCriteria,
      }) => ({
        themePreference,
        language,
        timeFormat,
        hapticsEnabled,
        reduceMotion,
        loadRemoteImages,
        contactPictures,
        sentFromFooter,
        defaultAccountId,
        signatures,
        accountNames,
        identities,
        notificationsEnabled,
        silencedAccountIds,
        inboxFilter,
        collapsedIds,
        accountOrder,
        categorySeenAt,
        filterEnabled,
        filterCriteria,
      }),
    },
  ),
);
