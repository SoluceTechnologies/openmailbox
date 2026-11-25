import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { getCalendars } from 'expo-localization';

import i18n from '@/utils/i18n';

dayjs.extend(localizedFormat);

export type TimeFormat = 'system' | '12h' | '24h';

const ENGLISH_FORMATS = { LT: 'h:mm A', LLL: 'MMMM D, YYYY h:mm A' };
const CLOCKS = { '12h': 'h:mm A', '24h': 'HH:mm' };

let clock: '12h' | '24h' | null = null;

export function applyTimeFormat(format: TimeFormat): void {
  const uses24hourClock = format === 'system' ? getCalendars()[0]?.uses24hourClock : format === '24h';
  clock = uses24hourClock == null ? null : uses24hourClock ? '24h' : '12h';
}

function localized(token: 'LT' | 'LLL'): string {
  const formats = { ...ENGLISH_FORMATS, ...dayjs.Ls[dayjs.locale()]?.formats };
  const time = clock && /h/.test(formats.LT) !== (clock === '12h') ? CLOCKS[clock] : formats.LT;
  return token === 'LT' ? time : formats.LLL.replace(formats.LT, time);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatListDate(timestamp: number): string {
  const date = dayjs(timestamp);
  const today = dayjs();
  if (date.isSame(today, 'day')) return date.format(localized('LT'));
  if (date.isSame(today.subtract(1, 'day'), 'day')) return i18n.t('dates.yesterday');
  if (today.diff(date, 'day') < 7) return capitalize(date.format('dddd'));
  return date.format('L');
}

export function formatFullDate(timestamp: number): string {
  return dayjs(timestamp).format(localized('LLL'));
}

export function formatTime(timestamp: number): string {
  return dayjs(timestamp).format(localized('LT'));
}
