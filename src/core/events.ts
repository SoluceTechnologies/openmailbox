import { Alert } from 'react-native';
import { CoreEvent, CoreEvent_Tags, SyncErrorKind, SyncStatus, type EventListener } from '@openmailbox/mail-core';

import { useSyncStore } from '@/stores/syncStore';
import i18n from '@/utils/i18n';

import { queryClient, queryKeys, UNIFIED_SCOPE } from './queryClient';

function invalidateMailboxes(mailboxIds: Set<string>): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.mailboxes });
  queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === 'threads' && (queryKey[1] === UNIFIED_SCOPE || mailboxIds.has(String(queryKey[1]))),
  });
  queryClient.invalidateQueries({ queryKey: ['thread'] });
  queryClient.invalidateQueries({ queryKey: ['search'] });
}

export class CoreEventListener implements EventListener {
  onEvent(event: CoreEvent): void {
    const { setStatus, setAuthRequired } = useSyncStore.getState();
    switch (event.tag) {
      case CoreEvent_Tags.MailboxesChanged:
        invalidateMailboxes(new Set(event.inner.mailboxIds));
        break;
      case CoreEvent_Tags.AccountsChanged:
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        invalidateMailboxes(new Set());
        break;
      case CoreEvent_Tags.SyncState:
        setStatus(event.inner.accountId, event.inner.status);
        if (SyncStatus.Idle.instanceOf(event.inner.status)) setAuthRequired(event.inner.accountId, false);
        if (SyncStatus.Failed.instanceOf(event.inner.status) && event.inner.status.inner.kind === SyncErrorKind.Auth) {
          setAuthRequired(event.inner.accountId, true);
        }
        break;
      case CoreEvent_Tags.AuthRequired:
        setAuthRequired(event.inner.accountId, true);
        break;
      case CoreEvent_Tags.OpFailed:
        Alert.alert(i18n.t('errors.operationFailed'), event.inner.message);
        break;
    }
  }
}
