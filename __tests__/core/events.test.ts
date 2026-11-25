import { Alert } from 'react-native';
import { CoreEvent, SyncErrorKind, SyncStatus } from '@openmailbox/mail-core';

import { CoreEventListener } from '@/core/events';
import { readSecret } from '@/core/secrets';
import { EMPTY_THREAD_FILTER } from '@/core/hooks';
import { queryClient, queryKeys } from '@/core/queryClient';
import { useSyncStore } from '@/stores/syncStore';

const listener = new CoreEventListener();

function seedQueries() {
  queryClient.setQueryData(queryKeys.accounts, []);
  queryClient.setQueryData(queryKeys.mailboxes, []);
  queryClient.setQueryData(queryKeys.threads('unified', EMPTY_THREAD_FILTER), { pages: [], pageParams: [] });
  queryClient.setQueryData(queryKeys.threads('mailbox-inbox', EMPTY_THREAD_FILTER), { pages: [], pageParams: [] });
  queryClient.setQueryData(queryKeys.threads('mailbox-archive', EMPTY_THREAD_FILTER), { pages: [], pageParams: [] });
  queryClient.setQueryData(queryKeys.search('atlas', []), []);
  queryClient.setQueryData(queryKeys.newestUnread('unified'), []);
  queryClient.setQueryData(queryKeys.newestUnread('mailbox-archive'), []);
}

const invalidated = (queryKey: readonly unknown[]) => queryClient.getQueryState(queryKey)?.isInvalidated;

describe('core events', () => {
  beforeEach(() => {
    queryClient.clear();
    useSyncStore.setState({ statuses: {}, authRequired: {} });
    seedQueries();
  });

  it('refreshes only the lists of the mailboxes that changed', () => {
    listener.onEvent(new CoreEvent.MailboxesChanged({ mailboxIds: ['mailbox-inbox'] }));
    expect(invalidated(queryKeys.mailboxes)).toBe(true);
    expect(invalidated(queryKeys.threads('unified', EMPTY_THREAD_FILTER))).toBe(true);
    expect(invalidated(queryKeys.threads('mailbox-inbox', EMPTY_THREAD_FILTER))).toBe(true);
    expect(invalidated(queryKeys.threads('mailbox-archive', EMPTY_THREAD_FILTER))).toBe(false);
    expect(invalidated(queryKeys.newestUnread('unified'))).toBe(true);
    expect(invalidated(queryKeys.newestUnread('mailbox-archive'))).toBe(false);
    expect(invalidated(queryKeys.search('atlas', []))).toBe(true);
    expect(invalidated(queryKeys.accounts)).toBe(false);
  });

  it('keeps a new sign-in token in the keychain', async () => {
    listener.onEvent(new CoreEvent.SecretChanged({ accountId: 'account-1', secret: 'refresh-2' }));
    expect(await readSecret('account-1')).toBe('refresh-2');
  });

  it('refreshes accounts when they change', () => {
    listener.onEvent(new CoreEvent.AccountsChanged());
    expect(invalidated(queryKeys.accounts)).toBe(true);
    expect(invalidated(queryKeys.mailboxes)).toBe(true);
  });

  it('asks for the password again after an authentication failure and stops once synced', () => {
    listener.onEvent(
      new CoreEvent.SyncState({
        accountId: 'account-1',
        status: new SyncStatus.Failed({ kind: SyncErrorKind.Auth, message: 'rejected' }),
      }),
    );
    expect(useSyncStore.getState().authRequired['account-1']).toBe(true);

    listener.onEvent(new CoreEvent.SyncState({ accountId: 'account-1', status: new SyncStatus.Idle({ lastSyncedAt: 1 }) }));
    expect(useSyncStore.getState().authRequired['account-1']).toBe(false);
  });

  it('does not ask for the password after a network failure', () => {
    listener.onEvent(
      new CoreEvent.SyncState({
        accountId: 'account-1',
        status: new SyncStatus.Failed({ kind: SyncErrorKind.Network, message: 'timeout' }),
      }),
    );
    expect(useSyncStore.getState().authRequired['account-1']).toBeUndefined();
  });

  it('tells the user when a queued change was refused by the server', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    listener.onEvent(new CoreEvent.OpFailed({ accountId: 'account-1', message: 'Mailbox does not exist' }));
    expect(alert).toHaveBeenCalledWith(expect.any(String), 'Mailbox does not exist');
  });
});
