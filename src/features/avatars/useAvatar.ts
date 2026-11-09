import { useEffect, useState } from 'react';

import { useSettingsStore } from '@/stores/settingsStore';

import { cachedAvatar, loadAvatar } from './avatarCache';

/** The picture of an address, or null while it is looked up and when it has none. */
export function useAvatar(email: string | undefined): string | null {
  const enabled = useSettingsStore((state) => state.contactPictures);
  const address = enabled && email ? email : undefined;
  const cached = address ? cachedAvatar(address) : null;
  const [loaded, setLoaded] = useState<{ address: string; uri: string | null } | null>(null);

  useEffect(() => {
    if (!address || cached !== undefined) return;
    let active = true;
    loadAvatar(address).then(
      (uri) => {
        if (active) setLoaded({ address, uri });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [address, cached]);

  if (cached !== undefined) return cached;
  return loaded && loaded.address === address ? loaded.uri : null;
}
