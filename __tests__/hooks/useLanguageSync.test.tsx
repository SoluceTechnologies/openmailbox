import { act, renderHook } from '@testing-library/react-native';
import dayjs from 'dayjs';

import { useLanguageSync } from '@/hooks/useLanguageSync';
import { useSettingsStore } from '@/stores/settingsStore';
import type { AppLanguage } from '@/utils/i18n';
import i18n from '@/utils/i18n';

describe('useLanguageSync', () => {
  afterEach(() => act(() => useSettingsStore.setState({ language: 'en' })));

  it('switches texts and dates to the chosen language', () => {
    renderHook(() => useLanguageSync());
    act(() => useSettingsStore.setState({ language: 'oc' }));
    expect(i18n.language).toBe('oc');
    expect(dayjs.locale()).toBe('oc-lnc');
  });

  it('falls back to English for a language that is no longer shipped', () => {
    renderHook(() => useLanguageSync());
    act(() => useSettingsStore.setState({ language: 'ja' as AppLanguage }));
    expect(i18n.language).toBe('en');
    expect(dayjs.locale()).toBe('en');
  });
});
