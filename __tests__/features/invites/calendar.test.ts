import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';

import { addInviteEvent, removeInviteEvent } from '@/features/invites/calendar';
import { parseInvite } from '@/features/invites/invite';
import { useSettingsStore } from '@/stores/settingsStore';

import { ALLDAY_INVITE, GOOGLE_INVITE, WEEKLY_INVITE } from '../../helpers/invites';

const calendar = Calendar as jest.Mocked<typeof Calendar>;
type Calendars = Awaited<ReturnType<typeof Calendar.getCalendarsAsync>>;
type Permission = Awaited<ReturnType<typeof Calendar.requestCalendarPermissionsAsync>>;
const GOOGLE = parseInvite(GOOGLE_INVITE, ['bob@example.com'])!;

function onPlatform(os: 'ios' | 'android') {
  jest.replaceProperty(Platform, 'OS', os);
}

describe('invite events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ inviteEvents: {} });
  });

  afterEach(() => jest.restoreAllMocks());

  it('adds the event to the default calendar on iOS', async () => {
    onPlatform('ios');
    expect(await addInviteEvent(GOOGLE)).toBe('added');
    expect(calendar.createEventAsync).toHaveBeenCalledWith('default', {
      title: 'Atlas kickoff',
      startDate: new Date('2026-12-03T09:00:00Z'),
      endDate: new Date('2026-12-03T10:00:00Z'),
      allDay: false,
      location: 'Room 4',
      notes: 'Agenda: scope and planning',
    });
    expect(useSettingsStore.getState().inviteEvents).toEqual({ 'kickoff-2026@google.com': 'event-1' });
  });

  it('adds the event to the primary writable calendar on Android', async () => {
    onPlatform('android');
    calendar.getCalendarsAsync.mockResolvedValueOnce([
      { id: 'holidays', allowsModifications: false, isPrimary: false },
      { id: 'work', allowsModifications: true, isPrimary: false },
      { id: 'personal', allowsModifications: true, isPrimary: true },
    ] as Calendars);
    await addInviteEvent(GOOGLE);
    expect(calendar.createEventAsync).toHaveBeenCalledWith('personal', expect.objectContaining({ title: 'Atlas kickoff' }));
  });

  it('adds a repeating event with its rule', async () => {
    onPlatform('ios');
    await addInviteEvent(parseInvite(WEEKLY_INVITE, ['bob@example.com'])!);
    expect(calendar.createEventAsync).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ recurrenceRule: { frequency: 'weekly', interval: 2, endDate: new Date('2027-03-01T00:00:00Z') } }),
    );
  });

  it('keeps an all-day event on its date on Android', async () => {
    onPlatform('android');
    calendar.getCalendarsAsync.mockResolvedValueOnce([{ id: 'personal', allowsModifications: true, isPrimary: true }] as Calendars);
    await addInviteEvent(parseInvite(ALLDAY_INVITE, [])!);
    expect(calendar.createEventAsync).toHaveBeenCalledWith(
      'personal',
      expect.objectContaining({ allDay: true, startDate: new Date(Date.UTC(2026, 11, 3)), endDate: new Date(Date.UTC(2026, 11, 4)), timeZone: 'UTC' }),
    );
  });

  it('updates the event it already added', async () => {
    onPlatform('ios');
    useSettingsStore.setState({ inviteEvents: { 'kickoff-2026@google.com': 'event-1' } });
    expect(await addInviteEvent(GOOGLE)).toBe('added');
    expect(calendar.updateEventAsync).toHaveBeenCalledWith('event-1', expect.objectContaining({ title: 'Atlas kickoff' }));
    expect(calendar.createEventAsync).not.toHaveBeenCalled();
  });

  it('adds it again when the event it added was deleted', async () => {
    onPlatform('ios');
    useSettingsStore.setState({ inviteEvents: { 'kickoff-2026@google.com': 'gone' } });
    calendar.getEventAsync.mockRejectedValueOnce(new Error('not found'));
    await addInviteEvent(GOOGLE);
    expect(calendar.createEventAsync).toHaveBeenCalled();
    expect(useSettingsStore.getState().inviteEvents['kickoff-2026@google.com']).toBe('event-1');
  });

  it('reports a refused permission', async () => {
    calendar.requestCalendarPermissionsAsync.mockResolvedValueOnce({ granted: false, status: 'denied' } as Permission);
    expect(await addInviteEvent(GOOGLE)).toBe('denied');
    expect(calendar.createEventAsync).not.toHaveBeenCalled();
  });

  it('reports no writable calendar', async () => {
    onPlatform('android');
    calendar.getCalendarsAsync.mockResolvedValueOnce([{ id: 'holidays', allowsModifications: false }] as Calendars);
    expect(await addInviteEvent(GOOGLE)).toBe('unavailable');
  });

  it('removes the event it added', async () => {
    useSettingsStore.setState({ inviteEvents: { 'kickoff-2026@google.com': 'event-1' } });
    await removeInviteEvent('kickoff-2026@google.com');
    expect(calendar.deleteEventAsync).toHaveBeenCalledWith('event-1');
    expect(useSettingsStore.getState().inviteEvents).toEqual({});
  });

  it('does nothing when it added none', async () => {
    await removeInviteEvent('kickoff-2026@google.com');
    expect(calendar.deleteEventAsync).not.toHaveBeenCalled();
  });
});
