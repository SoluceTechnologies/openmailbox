import { canAnswer, parseInvite, replyIcs } from '@/features/invites/invite';

import { ALLDAY_INVITE, CANCEL_INVITE, GOOGLE_INVITE, OUTLOOK_INVITE, REPLY_INVITE, WEEKLY_INVITE } from '../../helpers/invites';

const FIXTURES: Record<string, string> = {
  google: GOOGLE_INVITE,
  outlook: OUTLOOK_INVITE,
  allday: ALLDAY_INVITE,
  weekly: WEEKLY_INVITE,
  cancel: CANCEL_INVITE,
  reply: REPLY_INVITE,
};
const fixture = (name: string) => FIXTURES[name];
const BOB = ['bob@example.com'];
const BEFORE = new Date('2026-11-27T08:00:00Z');

describe('parseInvite', () => {
  it('reads a Google invitation', () => {
    const invite = parseInvite(fixture('google'), BOB)!;
    expect(invite).toMatchObject({
      method: 'REQUEST',
      uid: 'kickoff-2026@google.com',
      sequence: 0,
      summary: 'Atlas kickoff',
      location: 'Room 4',
      description: 'Agenda: scope and planning',
      allDay: false,
      organizer: { name: 'Claire Dubois', email: 'claire@atlas.example' },
      me: { address: { email: 'Bob@Example.com' }, partstat: 'NEEDS-ACTION', rsvp: true },
    });
    expect(invite.start.toISOString()).toBe('2026-12-03T09:00:00.000Z');
    expect(invite.end.toISOString()).toBe('2026-12-03T10:00:00.000Z');
  });

  it('reads an Outlook time zone from its VTIMEZONE', () => {
    const invite = parseInvite(fixture('outlook'), BOB)!;
    expect(invite.start.toISOString()).toBe('2026-12-03T09:00:00.000Z');
    expect(invite.end.toISOString()).toBe('2026-12-03T10:00:00.000Z');
    expect(invite.sequence).toBe(2);
    expect(invite.summary).toBe('Revue budget');
    expect(invite.me?.address).toEqual({ name: 'Bob Martin', email: 'bob@example.com' });
  });

  it('keeps an all-day invitation on its date', () => {
    const invite = parseInvite(fixture('allday'), BOB)!;
    expect(invite.allDay).toBe(true);
    expect([invite.start.getFullYear(), invite.start.getMonth(), invite.start.getDate(), invite.start.getHours()]).toEqual([2026, 11, 3, 0]);
    expect([invite.end.getMonth(), invite.end.getDate(), invite.end.getHours()]).toEqual([11, 4, 0]);
    expect(invite.method).toBe('PUBLISH');
  });

  it('reads a repeat', () => {
    const invite = parseInvite(fixture('weekly'), BOB)!;
    expect(invite.repeat).toEqual({ frequency: 'WEEKLY', interval: 2, until: new Date('2027-03-01T00:00:00Z'), count: undefined });
  });

  it('reads a cancellation', () => {
    expect(parseInvite(fixture('cancel'), BOB)).toMatchObject({ method: 'CANCEL', sequence: 1, summary: 'Atlas kickoff' });
  });

  it("reads someone's answer", () => {
    expect(parseInvite(fixture('reply'), BOB)).toMatchObject({
      method: 'REPLY',
      replier: { address: { name: 'Claire Dubois', email: 'claire@atlas.example' }, partstat: 'TENTATIVE' },
    });
  });

  it('finds me through an identity address', () => {
    expect(parseInvite(fixture('google'), ['support@example.org', 'BOB@example.com'])?.me?.address.email).toBe('Bob@Example.com');
  });

  it('has no me when I am not invited', () => {
    expect(parseInvite(fixture('google'), ['someone@else.org'])?.me).toBeUndefined();
  });

  it('returns null for text that is not a calendar', () => {
    expect(parseInvite('Hello', BOB)).toBeNull();
    expect(parseInvite('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n', BOB)).toBeNull();
  });
});

describe('canAnswer', () => {
  it('lets me answer an open request', () => {
    expect(canAnswer(parseInvite(fixture('google'), BOB)!, BEFORE)).toBe(true);
  });

  it('does not ask for an answer that is not wanted', () => {
    expect(canAnswer(parseInvite(fixture('allday'), BOB)!, BEFORE)).toBe(false);
    const noReply = fixture('google').replace('RSVP=TRUE;', 'RSVP=FALSE;');
    expect(canAnswer(parseInvite(noReply, BOB)!, BEFORE)).toBe(false);
    expect(canAnswer(parseInvite(fixture('google'), ['someone@else.org'])!, BEFORE)).toBe(false);
  });

  it('lets me answer when the invitation does not say whether it wants an answer', () => {
    const unsaid = fixture('google').replace('RSVP=TRUE;', '');
    expect(canAnswer(parseInvite(unsaid, BOB)!, BEFORE)).toBe(true);
  });

  it('stops once the event is over', () => {
    expect(canAnswer(parseInvite(fixture('google'), BOB)!, new Date('2026-12-03T10:00:01Z'))).toBe(false);
  });

  it('keeps a repeat open until its last date', () => {
    const weekly = parseInvite(fixture('weekly'), BOB)!;
    expect(canAnswer(weekly, new Date('2027-01-15T00:00:00Z'))).toBe(true);
    expect(canAnswer(weekly, new Date('2027-03-02T00:00:00Z'))).toBe(false);
  });
});

describe('replyIcs', () => {
  const reply = replyIcs(fixture('outlook'), { name: 'Bob Martin', email: 'bob@example.com' }, 'ACCEPTED', new Date('2026-11-27T10:30:00Z'));

  it('answers with the same event and only my attendance', () => {
    expect(reply).toContain('METHOD:REPLY');
    expect(reply).toContain('UID:040000008200E00074C5B7101A82E00800000000A1B2C3');
    expect(reply).toContain('SEQUENCE:2');
    expect(reply).toContain('ORGANIZER;CN=Claire Dubois:mailto:claire@atlas.example');
    expect(reply).toContain('DTSTART;TZID=Romance Standard Time:20261203T100000');
    expect(reply).toContain('BEGIN:VTIMEZONE');
    expect(reply).toContain('DTSTAMP:20261127T103000Z');
    expect(reply.match(/^ATTENDEE/gm)).toHaveLength(1);
    expect(reply).toMatch(/^ATTENDEE;[^\r\n]*PARTSTAT=ACCEPTED[^\r\n]*:mailto:bob@example\.com\r$/m);
    expect(reply).toMatch(/^ATTENDEE;[^\r\n]*CN=Bob Martin/m);
  });

  it('writes standard calendar lines', () => {
    expect(reply.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(reply.replace(/\r\n/g, '')).not.toContain('\n');
    expect(parseInvite(reply, ['claire@atlas.example'])?.replier?.partstat).toBe('ACCEPTED');
  });
});
