import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';

import { useSettingsStore } from '@/stores/settingsStore';

import type { Frequency, Invite } from './invite';

export type AddResult = 'added' | 'denied' | 'unavailable';
type EventDetails = Parameters<typeof Calendar.createEventAsync>[1];

const FREQUENCY: Record<Frequency, Calendar.Frequency> = {
  DAILY: Calendar.Frequency.DAILY,
  WEEKLY: Calendar.Frequency.WEEKLY,
  MONTHLY: Calendar.Frequency.MONTHLY,
  YEARLY: Calendar.Frequency.YEARLY,
};

const utcMidnight = (date: Date) => new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

function eventDetails(invite: Invite): EventDetails {
  const floatingDay = invite.allDay && Platform.OS === 'android';
  return {
    title: invite.summary,
    startDate: floatingDay ? utcMidnight(invite.start) : invite.start,
    endDate: floatingDay ? utcMidnight(invite.end) : invite.end,
    allDay: invite.allDay,
    location: invite.location,
    notes: invite.description,
    timeZone: floatingDay ? 'UTC' : undefined,
    recurrenceRule: invite.repeat
      ? { frequency: FREQUENCY[invite.repeat.frequency], interval: invite.repeat.interval, endDate: invite.repeat.until, occurrence: invite.repeat.count }
      : undefined,
  };
}

async function writableCalendarId(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    const preferred = await Calendar.getDefaultCalendarAsync().catch(() => null);
    if (preferred?.allowsModifications) return preferred.id;
  }
  const writable = (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).filter((candidate) => candidate.allowsModifications);
  return (writable.find((candidate) => candidate.isPrimary) ?? writable[0])?.id ?? null;
}

export async function addInviteEvent(invite: Invite): Promise<AddResult> {
  if (!(await Calendar.requestCalendarPermissionsAsync()).granted) return 'denied';
  const details = eventDetails(invite);
  const existing = useSettingsStore.getState().inviteEvents[invite.uid];
  if (existing && (await Calendar.getEventAsync(existing).catch(() => null))) {
    await Calendar.updateEventAsync(existing, details);
    return 'added';
  }
  const calendarId = await writableCalendarId();
  if (!calendarId) return 'unavailable';
  useSettingsStore.getState().setInviteEvent(invite.uid, await Calendar.createEventAsync(calendarId, details));
  return 'added';
}

export async function removeInviteEvent(uid: string): Promise<void> {
  const eventId = useSettingsStore.getState().inviteEvents[uid];
  if (!eventId) return;
  await Calendar.deleteEventAsync(eventId).catch(() => undefined);
  useSettingsStore.getState().setInviteEvent(uid, null);
}
