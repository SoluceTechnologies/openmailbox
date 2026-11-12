import { QueryClient } from '@tanstack/react-query';
import type { Category } from '@openmailbox/mail-core';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: 5 * 60_000,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

export const UNIFIED_SCOPE = 'unified';

export const queryKeys = {
  accounts: ['accounts'] as const,
  mailboxes: ['mailboxes'] as const,
  threads: (scope: string, unreadOnly: boolean, category?: Category) => ['threads', scope, unreadOnly, category ?? null] as const,
  newestUnread: (scope: string) => ['newestUnread', scope] as const,
  thread: (threadId: string, mailboxId: string | undefined) => ['thread', threadId, mailboxId ?? null] as const,
  body: (emailId: string) => ['body', emailId] as const,
  search: (query: string, mailboxIds: string[]) => ['search', query, mailboxIds.join(',')] as const,
};
