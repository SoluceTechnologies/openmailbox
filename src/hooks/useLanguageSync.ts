import { useEffect } from 'react';
import dayjs from 'dayjs';

import { useSettingsStore } from '@/stores/settingsStore';
import { applyTimeFormat } from '@/utils/dates';
import i18n, { dayjsLocale, isSupported } from '@/utils/i18n';

export function useLanguageSync(): void {
  const language = useSettingsStore((state) => state.language);
  const timeFormat = useSettingsStore((state) => state.timeFormat);

  useEffect(() => {
    const supported = isSupported(language) ? language : 'en';
    dayjs.locale(dayjsLocale(supported));
    applyTimeFormat(timeFormat);
    i18n.changeLanguage(supported);
  }, [language, timeFormat]);
}
