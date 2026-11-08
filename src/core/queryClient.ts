import { QueryClient } from '@tanstack/react-query';

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
  threads: (scope: string, unreadOnly: boolean) => ['threads', scope, unreadOnly] as const,
  thread: (threadId: string, mailboxId: string | undefined) => ['thread', threadId, mailboxId ?? null] as const,
  body: (emailId: string) => ['body', emailId] as const,
  search: (query: string) => ['search', query] as const,
};
