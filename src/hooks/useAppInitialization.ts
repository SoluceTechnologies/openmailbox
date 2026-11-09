import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { boot } from '@/core/boot';
import { mailCore } from '@/core/mailCore';
import { setupOnlineManager } from '@/services/shared/network';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

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
