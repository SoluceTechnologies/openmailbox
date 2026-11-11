import { renderHook } from '@testing-library/react-native';
import { SyncErrorKind, SyncStatus } from '@openmailbox/mail-core';

import { useIsSyncing, useSyncFailureMessage, useSyncLabel } from '@/features/sync/useSyncLabel';
import { useSyncStore } from '@/stores/syncStore';
import i18n from '@/utils/i18n';

let mockOnline = true;
jest.mock('@/services/shared/network', () => ({ useIsOnline: () => mockOnline }));

const NOW = new Date(2026, 10, 6, 15, 30).getTime();

function current<T>(hook: () => T): T {
  const { result, unmount } = renderHook(hook);
  const value = result.current;
  unmount();
  return value;
}

const label = (accountIds: string[]) => current(() => useSyncLabel(accountIds));

describe('sync label', () => {
  beforeAll(async () => {
    jest.useFakeTimers({ now: NOW });
    await i18n.changeLanguage('en');
  });

  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    mockOnline = true;
    useSyncStore.setState({ statuses: {}, authRequired: {} });
  });

  it('says nothing before the first sync, without failing on accounts it does not know yet', () => {
    expect(label(['account-1'])).toBeNull();
    expect(current(() => useIsSyncing(['account-1']))).toBe(false);
  });

  it('says when mail is being checked on any of the accounts', () => {
    useSyncStore.setState({
      statuses: { 'account-1': new SyncStatus.Idle({ lastSyncedAt: NOW }), 'account-2': new SyncStatus.Syncing() },
    });
    expect(label(['account-1', 'account-2'])).toBe('Checking for mail…');
    expect(current(() => useIsSyncing(['account-1', 'account-2']))).toBe(true);
  });

  it('reports the latest sync as just now, then by its time', () => {
    useSyncStore.setState({ statuses: { 'account-1': new SyncStatus.Idle({ lastSyncedAt: NOW - 10_000 }) } });
    expect(label(['account-1'])).toBe('Updated just now');
    useSyncStore.setState({ statuses: { 'account-1': new SyncStatus.Idle({ lastSyncedAt: NOW - 3_600_000 }) } });
    expect(label(['account-1'])).toBe('Updated at 2:30 PM');
  });

  it('tells a rejected password apart from other failures', () => {
    const failed = (kind: SyncErrorKind) => new SyncStatus.Failed({ kind, message: 'details' });
    useSyncStore.setState({ statuses: { 'account-1': failed(SyncErrorKind.Auth) } });
    expect(label(['account-1'])).toBe(i18n.t('sync.authFailed'));
    useSyncStore.setState({ statuses: { 'account-1': failed(SyncErrorKind.Network) } });
    expect(label(['account-1'])).toBe(i18n.t('sync.failed'));
    expect(current(() => useSyncFailureMessage('account-1'))).toBe('details');
  });

  it('says the device is offline before anything else', () => {
    mockOnline = false;
    useSyncStore.setState({ statuses: { 'account-1': new SyncStatus.Syncing() } });
    expect(label(['account-1'])).toBe(i18n.t('sync.offline'));
  });
});
