import '@/utils/i18n';

import { Stack, useTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import FakeSplash from '@/components/FakeSplash';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Providers } from '@/components/Providers';
import { NotificationBridge } from '@/components/NotificationBridge';
import { UndoToast } from '@/components/UndoToast';
import { composeTitleKey, type ComposeMode } from '@/features/composer/prefill';
import { useAppInitialization } from '@/hooks/useAppInitialization';
import { useLanguageSync } from '@/hooks/useLanguageSync';
import { useSyncOnReconnect } from '@/hooks/useSyncOnReconnect';
import { NATIVE_CHROME } from '@/ui/nativeChrome';

function ThemedStatusBar() {
  const { dark } = useTheme();
  return <StatusBar style={dark ? 'light' : 'dark'} />;
}

function Navigator() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Modal headers are set here rather than from the screen: options a screen sets while its modal presents land
  // late, so the header first shows the route name, then rebuilds under the user's first tap.
  const modalHeader = (title: string) => ({ presentation: 'modal' as const, headerShown: NATIVE_CHROME, headerTransparent: true, title });
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen
        name="compose"
        options={({ route }) => modalHeader(t(composeTitleKey((route.params as { mode?: ComposeMode } | undefined)?.mode)))}
      />
      <Stack.Screen name="accounts/add" options={modalHeader(t('accounts.setup.chooseProvider'))} />
      <Stack.Screen name="attachment" options={({ route }) => modalHeader((route.params as { name?: string } | undefined)?.name ?? '')} />
    </Stack>
  );
}

export default function RootLayout() {
  const { isReady } = useAppInitialization();
  useLanguageSync();
  useSyncOnReconnect(isReady);

  return (
    <Providers>
      <View style={{ flex: 1 }}>
        <ThemedStatusBar />
        {isReady ? <OfflineBanner /> : null}
        {isReady ? <Navigator /> : <FakeSplash />}
        {isReady ? <UndoToast /> : null}
        {isReady ? <NotificationBridge /> : null}
      </View>
    </Providers>
  );
}
