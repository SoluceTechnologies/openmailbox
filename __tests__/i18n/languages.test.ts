import dayjs from 'dayjs';
import { getLocales } from 'expo-localization';

import i18n, { dayjsLocale, getInitialLanguage, isSupported, LANGUAGES, SUPPORTED } from '@/utils/i18n';

jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => []) }));

const mockGetLocales = getLocales as jest.Mock;

describe('languages', () => {
  it('ships the same languages as Deck', () => {
    expect(SUPPORTED).toEqual(['en', 'fr', 'de', 'es', 'ru', 'it', 'pt', 'nl', 'oc']);
  });

  it('labels every language in its own name and in English', () => {
    for (const language of LANGUAGES) {
      expect(language.label.length).toBeGreaterThan(0);
      expect(language.english.length).toBeGreaterThan(0);
    }
  });

  it('loads a dayjs locale for every language', () => {
    for (const language of LANGUAGES) expect(Object.keys(dayjs.Ls)).toContain(dayjsLocale(language.code));
  });

  it('formats Occitan dates with the Languedocien dayjs locale', () => {
    expect(dayjsLocale('oc')).toBe('oc-lnc');
  });

  it('only accepts known language codes', () => {
    expect(isSupported('pt')).toBe(true);
    expect(isSupported('zz')).toBe(false);
    expect(isSupported(undefined)).toBe(false);
  });

  it('starts in the device language when it is supported', () => {
    mockGetLocales.mockReturnValue([{ languageCode: 'nl' }]);
    expect(getInitialLanguage()).toBe('nl');
  });

  it('falls back to English for other device languages', () => {
    mockGetLocales.mockReturnValue([{ languageCode: 'ja' }]);
    expect(getInitialLanguage()).toBe('en');
    mockGetLocales.mockReturnValue([]);
    expect(getInitialLanguage()).toBe('en');
  });

  it('picks the Russian plural form from the count', async () => {
    await i18n.changeLanguage('ru');
    const forms = [1, 3, 5, 21].map((count) => i18n.t('threads.unreadCount', { count }));
    await i18n.changeLanguage('en');
    expect(forms[0]).not.toBe(forms[2].replace('5', '1'));
    expect(forms[3]).toBe(forms[0].replace('1', '21'));
  });
});
