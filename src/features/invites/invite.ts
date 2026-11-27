import ICAL from 'ical.js';

import type { MailAddress } from '@/utils/addresses';

export type InviteMethod = 'REQUEST' | 'CANCEL' | 'REPLY' | 'PUBLISH';
export type Partstat = 'ACCEPTED' | 'TENTATIVE' | 'DECLINED' | 'NEEDS-ACTION';
export type Answer = Exclude<Partstat, 'NEEDS-ACTION'>;
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface Invite {
  method: InviteMethod;
  uid: string;
  sequence: number;
  recurrenceId?: string;
  summary: string;
  location?: string;
  description?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  timeZone?: string;
  organizer?: MailAddress;
  me?: { address: MailAddress; partstat: Partstat; rsvp: boolean };
  repeat?: { frequency: Frequency; interval: number; until?: Date; count?: number };
  replier?: { address: MailAddress; partstat: Partstat };
}

const METHODS: InviteMethod[] = ['REQUEST', 'CANCEL', 'REPLY', 'PUBLISH'];
const PARTSTATS: Partstat[] = ['ACCEPTED', 'TENTATIVE', 'DECLINED', 'NEEDS-ACTION'];
const FREQUENCIES: Frequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const PRODID = '-//Open Mailbox//Open Mailbox//EN';
const KEPT = ['uid', 'sequence', 'recurrence-id', 'dtstart', 'dtend', 'duration', 'summary', 'organizer'];

function calendarOf(ics: string): ICAL.Component | null {
  try {
    const root = new ICAL.Component(ICAL.parse(ics));
    return root.name === 'vcalendar' ? root : null;
  } catch {
    return null;
  }
}

function registerZones(root: ICAL.Component) {
  for (const zone of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(zone);
}

function addressOf(property: ICAL.Property | null): MailAddress | undefined {
  const value = property?.getFirstValue();
  if (typeof value !== 'string') return undefined;
  const email = value.replace(/^mailto:/i, '').trim();
  if (!email) return undefined;
  const name = property?.getParameter('cn');
  return typeof name === 'string' && name && name.toLowerCase() !== email.toLowerCase() ? { name, email } : { email };
}

function partstatOf(property: ICAL.Property): Partstat {
  const value = String(property.getParameter('partstat') ?? '').toUpperCase();
  return PARTSTATS.find((partstat) => partstat === value) ?? 'NEEDS-ACTION';
}

function text(component: ICAL.Component, name: string): string | undefined {
  const value = component.getFirstPropertyValue(name);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function parseInvite(ics: string, myAddresses: string[]): Invite | null {
  const root = calendarOf(ics);
  const vevent = root?.getFirstSubcomponent('vevent');
  if (!root || !vevent) return null;
  registerZones(root);
  const event = new ICAL.Event(vevent);
  if (!event.uid || !event.startDate) return null;
  const method = METHODS.find((candidate) => candidate === String(root.getFirstPropertyValue('method') ?? '').toUpperCase()) ?? 'PUBLISH';
  const allDay = event.startDate.isDate;
  const start = event.startDate.toJSDate();
  const end = event.endDate ? event.endDate.toJSDate() : new Date(start.getTime() + (allDay ? 86_400_000 : 0));
  const mine = new Set(myAddresses.map((address) => address.toLowerCase()));
  const attendees = vevent.getAllProperties('attendee');
  const myProperty = attendees.find((attendee) => {
    const address = addressOf(attendee);
    return address !== undefined && mine.has(address.email.toLowerCase());
  });
  const rrule = vevent.getFirstPropertyValue('rrule');
  const frequency = rrule instanceof ICAL.Recur ? FREQUENCIES.find((candidate) => candidate === rrule.freq) : undefined;
  const replierProperty = method === 'REPLY' ? attendees[0] : undefined;
  const zone = event.startDate.zone?.tzid;
  return {
    method,
    uid: event.uid,
    sequence: event.sequence ?? 0,
    recurrenceId: event.recurrenceId?.toString(),
    summary: event.summary ?? '',
    location: text(vevent, 'location'),
    description: text(vevent, 'description'),
    start,
    end,
    allDay,
    timeZone: zone && zone !== 'floating' ? zone : undefined,
    organizer: addressOf(vevent.getFirstProperty('organizer')),
    me: myProperty
      ? {
          address: addressOf(myProperty)!,
          partstat: partstatOf(myProperty),
          rsvp: String(myProperty.getParameter('rsvp') ?? '').toUpperCase() !== 'FALSE',
        }
      : undefined,
    repeat:
      rrule instanceof ICAL.Recur && frequency
        ? { frequency, interval: rrule.interval || 1, until: rrule.until?.toJSDate(), count: rrule.count ?? undefined }
        : undefined,
    replier: replierProperty ? { address: addressOf(replierProperty)!, partstat: partstatOf(replierProperty) } : undefined,
  };
}

export function canAnswer(invite: Invite, now: Date): boolean {
  if (invite.method !== 'REQUEST' || !invite.me?.rsvp) return false;
  if (invite.repeat) return !invite.repeat.until || invite.repeat.until >= now;
  return invite.end >= now;
}

export function replyIcs(source: string, me: MailAddress, answer: Answer, now: Date): string {
  const root = calendarOf(source);
  const vevent = root?.getFirstSubcomponent('vevent');
  if (!root || !vevent) throw new Error('not a calendar invitation');
  const reply = new ICAL.Component('vcalendar');
  reply.addPropertyWithValue('prodid', PRODID);
  reply.addPropertyWithValue('version', '2.0');
  reply.addPropertyWithValue('method', 'REPLY');
  for (const zone of root.getAllSubcomponents('vtimezone')) reply.addSubcomponent(zone);
  const event = new ICAL.Component('vevent');
  for (const name of KEPT) {
    for (const property of vevent.getAllProperties(name)) event.addProperty(property);
  }
  event.addPropertyWithValue('dtstamp', ICAL.Time.fromJSDate(now, true));
  const attendee = new ICAL.Property('attendee');
  attendee.setValue(`mailto:${me.email}`);
  attendee.setParameter('partstat', answer);
  if (me.name) attendee.setParameter('cn', me.name);
  event.addProperty(attendee);
  reply.addSubcomponent(event);
  return reply.toString().replace(/\r?\n/g, '\r\n') + '\r\n';
}
