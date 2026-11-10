import { AppState } from 'react-native';

import { useSyncStore } from '@/stores/syncStore';

import { CoreEventListener } from './events';
import { mailCore } from './mailCore';
import { queryClient, queryKeys } from './queryClient';
import { readSecret } from './secrets';

let booted: Promise<void> | null = null;

async function start(): Promise<void> {
  const core = mailCore();
  core.subscribe(new CoreEventListener());
  const accounts = await core.listAccounts();
  queryClient.setQueryData(queryKeys.accounts, accounts);
  await Promise.all(
    accounts.map(async (account) => {
      const secret = await readSecret(account.id);
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
