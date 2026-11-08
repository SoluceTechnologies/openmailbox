import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import 'dayjs/locale/de';
import 'dayjs/locale/es';
import 'dayjs/locale/fr';
import 'dayjs/locale/it';
import 'dayjs/locale/nl';
import 'dayjs/locale/oc-lnc';
import 'dayjs/locale/pt';
import 'dayjs/locale/ru';

import de from '@/locales/de.json';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';
import it from '@/locales/it.json';
import nl from '@/locales/nl.json';
import oc from '@/locales/oc.json';
import pt from '@/locales/pt.json';
import ru from '@/locales/ru.json';

export const LANGUAGES = [
  { code: 'en', label: 'English', english: 'English', dayjs: 'en' },
  { code: 'fr', label: 'Français', english: 'French', dayjs: 'fr' },
  { code: 'de', label: 'Deutsch', english: 'German', dayjs: 'de' },
  { code: 'es', label: 'Español', english: 'Spanish', dayjs: 'es' },
  { code: 'ru', label: 'Русский', english: 'Russian', dayjs: 'ru' },
  { code: 'it', label: 'Italiano', english: 'Italian', dayjs: 'it' },
  { code: 'pt', label: 'Português', english: 'Portuguese', dayjs: 'pt' },
  { code: 'nl', label: 'Nederlands', english: 'Dutch', dayjs: 'nl' },
  { code: 'oc', label: 'Occitan', english: 'Occitan', dayjs: 'oc-lnc' },
] as const;

export type AppLanguage = (typeof LANGUAGES)[number]['code'];

export const SUPPORTED: AppLanguage[] = LANGUAGES.map((language) => language.code);

export function isSupported(code: string | null | undefined): code is AppLanguage {
  return !!code && (SUPPORTED as string[]).includes(code);
}

export function getInitialLanguage(): AppLanguage {
  const code = getLocales()[0]?.languageCode ?? undefined;
  return isSupported(code) ? code : 'en';
}

export function dayjsLocale(language: AppLanguage): string {
  return LANGUAGES.find((candidate) => candidate.code === language)?.dayjs ?? 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    de: { translation: de },
    es: { translation: es },
    ru: { translation: ru },
    it: { translation: it },
    pt: { translation: pt },
    nl: { translation: nl },
    oc: { translation: oc },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  returnEmptyString: false,
  interpolation: { escapeValue: false },
});

export default i18n;
