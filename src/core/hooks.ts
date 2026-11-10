import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import { ThreadScope, type Account, type Mailbox, type ThreadPage } from '@openmailbox/mail-core';

import { useSyncStore } from '@/stores/syncStore';

import { mailCore } from './mailCore';
import { queryKeys, UNIFIED_SCOPE } from './queryClient';

const THREAD_PAGE_SIZE = 50;
const SEARCH_LIMIT = 100;
const EMPTY_ACCOUNTS: Account[] = [];
const EMPTY_MAILBOXES: Mailbox[] = [];
const EMPTY_IDS: string[] = [];

export function useAccounts(): Account[] {
  return useQuery({ queryKey: queryKeys.accounts, queryFn: () => mailCore().listAccounts() }).data ?? EMPTY_ACCOUNTS;
}

export function useMailboxes(): Mailbox[] {
  return useQuery({ queryKey: queryKeys.mailboxes, queryFn: () => mailCore().listMailboxes(undefined) }).data ?? EMPTY_MAILBOXES;
}

function threadScope(scope: string): ThreadScope {
  return scope === UNIFIED_SCOPE ? new ThreadScope.Unified() : new ThreadScope.Mailbox({ mailboxId: scope });
}

const flattenThreadPages = (data: InfiniteData<ThreadPage, string | undefined>) => data.pages.flatMap((page) => page.threads);

export function useThreads(scope: string, unreadOnly: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.threads(scope, unreadOnly),
    queryFn: ({ pageParam }) => mailCore().listThreads(threadScope(scope), unreadOnly, pageParam, THREAD_PAGE_SIZE),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor,
    select: flattenThreadPages,
  });
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
