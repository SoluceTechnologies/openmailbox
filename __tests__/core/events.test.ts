import { Alert } from 'react-native';
import { CoreEvent, SyncErrorKind, SyncStatus } from '@openmailbox/mail-core';

import { CoreEventListener } from '@/core/events';
import { queryClient, queryKeys } from '@/core/queryClient';
import { useSyncStore } from '@/stores/syncStore';

const listener = new CoreEventListener();

function seedQueries() {
  queryClient.setQueryData(queryKeys.accounts, []);
  queryClient.setQueryData(queryKeys.mailboxes, []);
  queryClient.setQueryData(queryKeys.threads('unified', false), { pages: [], pageParams: [] });
  queryClient.setQueryData(queryKeys.threads('mailbox-inbox', false), { pages: [], pageParams: [] });
  queryClient.setQueryData(queryKeys.threads('mailbox-archive', false), { pages: [], pageParams: [] });
  queryClient.setQueryData(queryKeys.search('atlas'), []);
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
    expect(invalidated(queryKeys.threads('unified', false))).toBe(true);
    expect(invalidated(queryKeys.threads('mailbox-inbox', false))).toBe(true);
    expect(invalidated(queryKeys.threads('mailbox-archive', false))).toBe(false);
    expect(invalidated(queryKeys.search('atlas'))).toBe(true);
    expect(invalidated(queryKeys.accounts)).toBe(false);
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
