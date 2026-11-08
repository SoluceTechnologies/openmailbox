import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ThreadScope } from '@openmailbox/mail-core';

import { useSearch, useThreads } from '@/core/hooks';
import { queryClient } from '@/core/queryClient';

import { core, makeEmail, makeThread } from '../helpers/fixtures';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('core hooks', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
  });

  it('reads the unified inbox page by page and flattens the pages', async () => {
    const first = makeThread({ key: 'a', latest: makeEmail({ threadId: 'thread-a' }) });
    const second = makeThread({ key: 'b', latest: makeEmail({ threadId: 'thread-b' }) });
    core.listThreads.mockImplementation(async (_scope, _unreadOnly, cursor) =>
      cursor === 'cursor-1' ? { threads: [second], nextCursor: undefined } : { threads: [first], nextCursor: 'cursor-1' },
    );

    const { result } = renderHook(() => useThreads('unified', false), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([first]));
    expect(ThreadScope.Unified.instanceOf(core.listThreads.mock.calls[0][0])).toBe(true);

    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data).toEqual([first, second]));
    expect(core.listThreads).toHaveBeenLastCalledWith(expect.anything(), false, 'cursor-1', 50);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('reads a single mailbox when given its id', async () => {
    renderHook(() => useThreads('mailbox-inbox', true), { wrapper });
    await waitFor(() => expect(core.listThreads).toHaveBeenCalled());
    const [scope, unreadOnly] = core.listThreads.mock.calls[0];
    expect(ThreadScope.Mailbox.instanceOf(scope) && scope.inner.mailboxId).toBe('mailbox-inbox');
    expect(unreadOnly).toBe(true);
  });

  it('waits for two characters before searching and trims the query', async () => {
    const { result, rerender } = renderHook(({ query }: { query: string }) => useSearch(query), {
      wrapper,
      initialProps: { query: 'a' },
    });
    expect(core.search).not.toHaveBeenCalled();
    rerender({ query: ' atlas ' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(core.search).toHaveBeenCalledWith('atlas', 100);
  });
});
