import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import 'dayjs/locale/fr';

import en from '@/locales/en.json';
import fr from '@/locales/fr.json';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
] as const;

export type AppLanguage = (typeof LANGUAGES)[number]['code'];

const SUPPORTED: AppLanguage[] = LANGUAGES.map((language) => language.code);

export function isSupported(code: string | null | undefined): code is AppLanguage {
  return !!code && (SUPPORTED as string[]).includes(code);
}

export function getInitialLanguage(): AppLanguage {
  const code = getLocales()[0]?.languageCode ?? undefined;
  return isSupported(code) ? code : 'en';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  returnEmptyString: false,
  interpolation: { escapeValue: false },
});

export default i18n;
