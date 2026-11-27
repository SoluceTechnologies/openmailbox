import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ThreadScope } from '@openmailbox/mail-core';

import { EMPTY_THREAD_FILTER, useSearch, useThreads } from '@/core/hooks';
import { queryClient, queryKeys } from '@/core/queryClient';

import { core, makeAccount, makeEmail, makeThread } from '../helpers/fixtures';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('core hooks', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
  });

  it('keeps the accounts cached with nobody reading them', () => {
    queryClient.setQueryData(queryKeys.accounts, [makeAccount()]);
    expect(queryClient.getQueryCache().find({ queryKey: queryKeys.accounts })?.gcTime).toBe(Infinity);
  });

  it('reads the unified inbox page by page and flattens the pages', async () => {
    const first = makeThread({ key: 'a', latest: makeEmail({ threadId: 'thread-a' }) });
    const second = makeThread({ key: 'b', latest: makeEmail({ threadId: 'thread-b' }) });
    core.listThreads.mockImplementation(async (_scope, _filter, _category, cursor) =>
      cursor === 'cursor-1' ? { threads: [second], nextCursor: undefined } : { threads: [first], nextCursor: 'cursor-1' },
    );

    const { result } = renderHook(() => useThreads('unified', EMPTY_THREAD_FILTER), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([first]));
    expect(ThreadScope.Unified.instanceOf(core.listThreads.mock.calls[0][0])).toBe(true);

    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data).toEqual([first, second]));
    expect(core.listThreads).toHaveBeenLastCalledWith(expect.anything(), EMPTY_THREAD_FILTER, undefined, 'cursor-1', 50);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('reads a single mailbox when given its id', async () => {
    renderHook(() => useThreads('mailbox-inbox', { ...EMPTY_THREAD_FILTER, unread: true }), { wrapper });
    await waitFor(() => expect(core.listThreads).toHaveBeenCalled());
    const [scope, filter] = core.listThreads.mock.calls[0];
    expect(ThreadScope.Mailbox.instanceOf(scope) && scope.inner.mailboxId).toBe('mailbox-inbox');
    expect(filter.unread).toBe(true);
  });

  it('sends the kept threads without keying the list on them', async () => {
    let kept = ['thread-a'];
    const { rerender } = renderHook(() => useThreads('unified', EMPTY_THREAD_FILTER, undefined, () => kept), { wrapper });
    await waitFor(() => expect(core.listThreads).toHaveBeenCalledTimes(1));
    expect(core.listThreads.mock.calls[0][1].keepThreadIds).toEqual(['thread-a']);

    kept = ['thread-a', 'thread-b'];
    rerender({});
    await act(() => queryClient.invalidateQueries({ queryKey: ['threads'] }));
    expect(core.listThreads).toHaveBeenCalledTimes(2);
    expect(core.listThreads.mock.calls[1][1].keepThreadIds).toEqual(['thread-a', 'thread-b']);
    expect(queryClient.getQueryCache().findAll({ queryKey: ['threads'] })).toHaveLength(1);
  });

  it('waits for two characters before searching and trims the query', async () => {
    const { result, rerender } = renderHook(({ query }: { query: string }) => useSearch(query), {
      wrapper,
      initialProps: { query: 'a' },
    });
    expect(core.search).not.toHaveBeenCalled();
    rerender({ query: ' atlas ' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(core.search).toHaveBeenCalledWith('atlas', 100, []);
  });

  it('searches only the mailboxes asked for', async () => {
    const { result } = renderHook(() => useSearch('atlas', ['mailbox-inbox']), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(core.search).toHaveBeenLastCalledWith('atlas', 100, ['mailbox-inbox']);
  });
});
