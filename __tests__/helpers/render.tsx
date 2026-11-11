import type { ReactElement, ReactNode } from 'react';
import { ThemeProvider } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, type RenderOptions } from '@testing-library/react-native';

import { queryClient } from '@/core/queryClient';
import { darkTheme, lightTheme } from '@/theme';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Wrapper({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={dark ? darkTheme : lightTheme}>{children}</ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export function renderWithProviders(element: ReactElement, options: RenderOptions & { dark?: boolean } = {}) {
  const { dark, ...rest } = options;
  return render(element, { wrapper: ({ children }) => <Wrapper dark={dark}>{children}</Wrapper>, ...rest });
}
