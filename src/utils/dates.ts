import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';

import i18n from '@/utils/i18n';

dayjs.extend(localizedFormat);

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatListDate(timestamp: number): string {
  const date = dayjs(timestamp);
  const today = dayjs();
  if (date.isSame(today, 'day')) return date.format('LT');
  if (date.isSame(today.subtract(1, 'day'), 'day')) return i18n.t('dates.yesterday');
  if (today.diff(date, 'day') < 7) return capitalize(date.format('dddd'));
  return date.format('L');
}

export function formatFullDate(timestamp: number): string {
  return dayjs(timestamp).format('LLL');
}

export function formatTime(timestamp: number): string {
  return dayjs(timestamp).format('LT');
}
