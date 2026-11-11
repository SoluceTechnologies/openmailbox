import { useEffect, useRef } from 'react';

import { mailCore } from '@/core/mailCore';
import { useIsOnline } from '@/services/shared/network';

export function useSyncOnReconnect(enabled: boolean): void {
  const online = useIsOnline();
  const wasOnline = useRef(online);

  useEffect(() => {
    const reconnected = online && !wasOnline.current;
    wasOnline.current = online;
    if (enabled && reconnected) mailCore().syncNow(undefined);
  }, [enabled, online]);
}
