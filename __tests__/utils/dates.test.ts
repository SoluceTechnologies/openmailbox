import { formatFullDate, formatListDate, formatTime } from '@/utils/dates';
import i18n from '@/utils/i18n';

const NOW = new Date(2026, 10, 6, 15, 30);

describe('dates', () => {
  beforeAll(async () => {
    jest.useFakeTimers({ now: NOW });
    await i18n.changeLanguage('en');
  });

  afterAll(() => jest.useRealTimers());

  it('shows the time for messages received today', () => {
    expect(formatListDate(new Date(2026, 10, 6, 9, 5).getTime())).toBe('9:05 AM');
  });

  it('says Yesterday for the day before', () => {
    expect(formatListDate(new Date(2026, 10, 5, 23, 59).getTime())).toBe('Yesterday');
  });

  it('shows the weekday within the last week', () => {
    expect(formatListDate(new Date(2026, 10, 2, 12, 0).getTime())).toBe('Monday');
  });

  it('shows the date for older messages', () => {
    expect(formatListDate(new Date(2026, 9, 20, 12, 0).getTime())).toBe('10/20/2026');
  });

  it('formats the full date and time for the reader', () => {
    expect(formatFullDate(new Date(2026, 10, 6, 9, 5).getTime())).toBe('November 6, 2026 9:05 AM');
    expect(formatTime(new Date(2026, 10, 6, 21, 42).getTime())).toBe('9:42 PM');
  });
});
