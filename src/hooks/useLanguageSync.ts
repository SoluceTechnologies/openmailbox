import { useEffect } from 'react';
import dayjs from 'dayjs';

import { useSettingsStore } from '@/stores/settingsStore';
import i18n, { isSupported } from '@/utils/i18n';

export function useLanguageSync(): void {
  const language = useSettingsStore((state) => state.language);

  useEffect(() => {
    const supported = isSupported(language) ? language : 'en';
    i18n.changeLanguage(supported);
    dayjs.locale(supported);
  }, [language]);
}
