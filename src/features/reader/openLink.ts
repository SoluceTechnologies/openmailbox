import { Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';

import { MAILTO } from '@/features/composer/prefill';

export function confirmOpenLink(url: string, t: TFunction): void {
  if (MAILTO.test(url)) {
    router.push({ pathname: '/compose', params: { mailto: url } });
    return;
  }
  let target = url;
  try {
    target = new URL(url).host || url;
  } catch {}
  Alert.alert(t('reader.openLinkTitle'), target, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('reader.openLink'), onPress: () => Linking.openURL(url).catch(() => undefined) },
  ]);
}
