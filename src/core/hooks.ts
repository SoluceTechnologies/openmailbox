import { useMemo } from 'react';
import { infiniteQueryOptions, keepPreviousData, useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import { ThreadScope, type Account, type Category, type Mailbox, type ThreadPage } from '@openmailbox/mail-core';

import { CATEGORIES } from '@/features/categories/categories';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSyncStore } from '@/stores/syncStore';

import { mailCore } from './mailCore';
import { queryKeys, UNIFIED_SCOPE } from './queryClient';

const THREAD_PAGE_SIZE = 50;
const SEARCH_LIMIT = 100;
const EMPTY_ACCOUNTS: Account[] = [];
const EMPTY_MAILBOXES: Mailbox[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_CATEGORIES: Category[] = [];

export function sortAccounts(accounts: Account[], order: string[]): Account[] {
  if (order.length === 0) return accounts;
  const rank = (account: Account) => {
    const index = order.indexOf(account.id);
    return index === -1 ? order.length : index;
  };
  return [...accounts].sort((first, second) => rank(first) - rank(second));
}

export function useAccounts(): Account[] {
  const accounts = useQuery({ queryKey: queryKeys.accounts, queryFn: () => mailCore().listAccounts() }).data ?? EMPTY_ACCOUNTS;
  const order = useSettingsStore((state) => state.accountOrder);
  return useMemo(() => sortAccounts(accounts, order), [accounts, order]);
}

export const mailboxesQuery = { queryKey: queryKeys.mailboxes, queryFn: () => mailCore().listMailboxes(undefined) };

export function useMailboxes(): Mailbox[] {
  return useQuery(mailboxesQuery).data ?? EMPTY_MAILBOXES;
}

function threadScope(scope: string): ThreadScope {
  return scope === UNIFIED_SCOPE ? new ThreadScope.Unified() : new ThreadScope.Mailbox({ mailboxId: scope });
}

const flattenThreadPages = (data: InfiniteData<ThreadPage, string | undefined>) => data.pages.flatMap((page) => page.threads);

export function threadsQuery(scope: string, unreadOnly: boolean, category?: Category) {
  return infiniteQueryOptions({
    queryKey: queryKeys.threads(scope, unreadOnly, category),
    queryFn: ({ pageParam }) => mailCore().listThreads(threadScope(scope), unreadOnly, category, pageParam, THREAD_PAGE_SIZE),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function useThreads(scope: string, unreadOnly: boolean, category?: Category) {
  return useInfiniteQuery({
    ...threadsQuery(scope, unreadOnly, category),
    select: flattenThreadPages,
    // Another category or the unread filter keeps the list on screen until its threads are read,
    // rather than flashing a spinner.
    placeholderData: keepPreviousData,
  });
}

export function useUnreadCategories(scope: string, enabled: boolean): Category[] {
  return (
    useQuery({
      queryKey: queryKeys.unreadCategories(scope),
      queryFn: async () => {
        const pages = await Promise.all(CATEGORIES.map((category) => mailCore().listThreads(threadScope(scope), true, category, undefined, 1)));
        return CATEGORIES.filter((_, index) => pages[index].threads.length > 0);
      },
      enabled,
    }).data ?? EMPTY_CATEGORIES
  );
}

export function useThreadEmails(threadId: string, mailboxId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.thread(threadId, mailboxId),
    queryFn: () => mailCore().threadEmails(threadId, mailboxId),
    enabled,
  });
}

export function useBody(emailId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.body(emailId),
    queryFn: () => mailCore().body(emailId),
    enabled,
    retry: 1,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
}

export function useSearch(query: string, mailboxIds: string[] = EMPTY_IDS) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.search(trimmed, mailboxIds),
    queryFn: () => mailCore().search(trimmed, SEARCH_LIMIT, mailboxIds),
    enabled: trimmed.length > 1,
    placeholderData: (previous) => previous,
  });
}

export function useAccountSyncStatus(accountId: string | undefined) {
  return useSyncStore((state) => (accountId ? state.statuses[accountId] : undefined));
}
