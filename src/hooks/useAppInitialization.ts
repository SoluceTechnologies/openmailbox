import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { CoreEventListener } from '@/core/events';
import { mailCore } from '@/core/mailCore';
import { queryClient, queryKeys } from '@/core/queryClient';
import { readSecret } from '@/core/secrets';
import { setupOnlineManager } from '@/services/shared/network';
import { useSyncStore } from '@/stores/syncStore';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

async function boot(): Promise<void> {
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

export function useAppInitialization(): { isReady: boolean } {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => setupOnlineManager(), []);

  useEffect(() => {
    let mounted = true;
    boot()
      .catch((error) => console.warn('[boot] mail core failed to start:', String(error)))
      .finally(() => {
        if (mounted) setIsReady(true);
        SplashScreen.hideAsync().catch(() => undefined);
      });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') mailCore().onForeground();
      else if (state === 'background') mailCore().onBackground();
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return { isReady };
}
