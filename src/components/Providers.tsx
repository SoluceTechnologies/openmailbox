import { useEffect, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '@/core/queryClient';
import { useSettingsStore } from '@/stores/settingsStore';
import { darkTheme, lightTheme } from '@/theme';

export function Providers({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const themePreference = useSettingsStore((state) => state.themePreference);
  const resolved = themePreference === 'system' ? (systemScheme ?? 'light') : themePreference;

  // Native views (glass buttons, menus, alerts, the keyboard) follow the app's choice, not only ours.
  useEffect(() => Appearance.setColorScheme(themePreference === 'system' ? 'unspecified' : themePreference), [themePreference]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={resolved === 'dark' ? darkTheme : lightTheme}>{children}</ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
