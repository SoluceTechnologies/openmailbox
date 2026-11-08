import { SyncStatus } from '@openmailbox/mail-core';

import { useSyncStore } from '@/stores/syncStore';

describe('sync store', () => {
  it('tracks the status and password state of each account separately', () => {
    const { setStatus, setAuthRequired } = useSyncStore.getState();
    setStatus('account-1', new SyncStatus.Syncing());
    setStatus('account-2', new SyncStatus.Idle({ lastSyncedAt: 5 }));
    setAuthRequired('account-2', true);

    const state = useSyncStore.getState();
    expect(SyncStatus.Syncing.instanceOf(state.statuses['account-1'])).toBe(true);
    expect(SyncStatus.Idle.instanceOf(state.statuses['account-2'])).toBe(true);
    expect(state.authRequired).toEqual({ 'account-2': true });
  });
});
