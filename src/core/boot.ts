import { AppState } from 'react-native';

import { categoryOf } from '@/features/categories/categories';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSyncStore } from '@/stores/syncStore';

import { CoreEventListener } from './events';
import { EMPTY_THREAD_FILTER, mailboxesQuery, threadsQuery } from './hooks';
import { mailCore } from './mailCore';
import { queryClient, queryKeys, UNIFIED_SCOPE } from './queryClient';
import { readSecret, smtpSecretId } from './secrets';

let booted: Promise<void> | null = null;

async function start(): Promise<void> {
  const core = mailCore();
  core.subscribe(new CoreEventListener());
  const accounts = await core.listAccounts();
  queryClient.setQueryData(queryKeys.accounts, accounts);

  if (accounts.length > 0) {
    const category = categoryOf(useSettingsStore.getState().inboxFilter);
    await Promise.all([
      queryClient.prefetchQuery(mailboxesQuery),
      queryClient.prefetchInfiniteQuery(threadsQuery(UNIFIED_SCOPE, EMPTY_THREAD_FILTER, category)),
    ]);
  }
  await Promise.all(
    accounts.map(async (account) => {
      const [secret, smtpSecret] = await Promise.all([
        readSecret(account.id),
        account.smtpUsername ? readSecret(smtpSecretId(account.id)) : null,
      ]);
      if (smtpSecret) core.unlockSmtp(account.id, smtpSecret);
      if (secret) core.unlockAccount(account.id, secret);
      else useSyncStore.getState().setAuthRequired(account.id, true);
    }),
  );
  if (AppState.currentState === 'active') core.onForeground();
}

export function boot(): Promise<void> {
  booted ??= start().catch((error) => {
    booted = null;
    throw error;
  });
  return booted;
}
