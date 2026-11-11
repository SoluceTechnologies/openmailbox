import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SyncErrorKind, SyncStatus } from '@openmailbox/mail-core';

import { useIsOnline } from '@/services/shared/network';
import { useSyncStore } from '@/stores/syncStore';
import { formatTime } from '@/utils/dates';

const JUST_NOW_MS = 60_000;

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function useIsSyncing(accountIds: string[]): boolean {
  return useSyncStore((state) =>
    accountIds.some((accountId) => {
      const status = state.statuses[accountId];
      return status !== undefined && SyncStatus.Syncing.instanceOf(status);
    }),
  );
}

export function useSyncLabel(accountIds: string[]): string | null {
  const { t } = useTranslation();
  const online = useIsOnline();
  const now = useNow(30_000);
  const statuses = useSyncStore((state) => state.statuses);
  if (!online) return t('sync.offline');
  const relevant = accountIds.map((accountId) => statuses[accountId]).filter((status) => status !== undefined);
  if (relevant.some((status) => SyncStatus.Syncing.instanceOf(status))) return t('sync.syncing');
  const failure = relevant.find((status) => SyncStatus.Failed.instanceOf(status));
  if (failure && SyncStatus.Failed.instanceOf(failure)) {
    return failure.inner.kind === SyncErrorKind.Auth ? t('sync.authFailed') : t('sync.failed');
  }
  const lastSyncedAt = Math.max(
    0,
    ...relevant.map((status) => (SyncStatus.Idle.instanceOf(status) ? (status.inner.lastSyncedAt ?? 0) : 0)),
  );
  if (!lastSyncedAt) return null;
  return now - lastSyncedAt < JUST_NOW_MS ? t('sync.updatedJustNow') : t('sync.updatedAt', { time: formatTime(lastSyncedAt) });
}

export function useSyncFailureMessage(accountId: string): string | null {
  return useSyncStore((state) => {
    const status = state.statuses[accountId];
    return status && SyncStatus.Failed.instanceOf(status) ? status.inner.message : null;
  });
}
