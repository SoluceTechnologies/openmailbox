import '@/utils/i18n';

import { Stack, useTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import FakeSplash from '@/components/FakeSplash';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Providers } from '@/components/Providers';
import { NotificationBridge } from '@/components/NotificationBridge';
import { UndoToast } from '@/components/UndoToast';
import { useAppInitialization } from '@/hooks/useAppInitialization';
import { useLanguageSync } from '@/hooks/useLanguageSync';
import { useSyncOnReconnect } from '@/hooks/useSyncOnReconnect';

function ThemedStatusBar() {
  const { dark } = useTheme();
  return <StatusBar style={dark ? 'light' : 'dark'} />;
}

function Navigator() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="compose" options={{ presentation: 'modal' }} />
      <Stack.Screen name="accounts/add" options={{ presentation: 'modal' }} />
      <Stack.Screen name="attachment" options={{ presentation: 'modal' }} />
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
