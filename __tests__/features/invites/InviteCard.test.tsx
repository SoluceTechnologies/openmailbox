import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Calendar from 'expo-calendar';

import { queryClient, queryKeys } from '@/core/queryClient';
import { MessageBody } from '@/features/reader/components/MessageBody';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatTime } from '@/utils/dates';
import i18n from '@/utils/i18n';

import { core, makeAccount } from '../../helpers/fixtures';
import { ALLDAY_INVITE, CANCEL_INVITE, GOOGLE_INVITE, REPLY_INVITE, WEEKLY_INVITE } from '../../helpers/invites';
import { renderWithProviders } from '../../helpers/render';

jest.mock('@/features/attachments/openAttachment', () => ({ openAttachment: jest.fn(async () => undefined) }));

const calendar = Calendar as jest.Mocked<typeof Calendar>;
type Permission = Awaited<ReturnType<typeof Calendar.requestCalendarPermissionsAsync>>;
const BOB = makeAccount({ email: 'bob@example.com', displayName: 'Bob Martin' });
const SIGNATURE = { html: '', text: '' };
const CHIPS = [
  { index: 0, filename: 'attachment-1', mimeType: 'text/calendar', size: 900 },
  { index: 1, filename: 'invite.ics', mimeType: 'application/ics', size: 900 },
];

function showInvite(ics: string) {
  core.body.mockResolvedValue({ text: 'You are invited', bcc: [], hasRemoteContent: false, attachments: CHIPS, calendar: ics });
  return renderWithProviders(<MessageBody emailId="email-1" accountId="account-1" />);
}

describe('invitation card', () => {
  beforeAll(async () => {
    jest.useFakeTimers({ now: new Date('2026-11-27T08:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    await i18n.changeLanguage('en');
  });

  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    queryClient.setQueryData(queryKeys.accounts, [BOB]);
    useSettingsStore.setState({
      inviteAnswers: {},
      inviteEvents: {},
      identities: { 'account-1': [{ id: 'identity-1', name: 'Support', email: 'support@example.org', signature: SIGNATURE }] },
    });
  });

  it('shows the event of an invitation', async () => {
    showInvite(GOOGLE_INVITE);
    expect(await screen.findByText('Atlas kickoff')).toBeOnTheScreen();
    const start = Date.UTC(2026, 11, 3, 9);
    expect(screen.getByText(new RegExp(`${formatTime(start)} – ${formatTime(start + 3_600_000)}`))).toBeOnTheScreen();
    expect(screen.getByText('Room 4')).toBeOnTheScreen();
    expect(screen.getByText('from Claire Dubois')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeOnTheScreen();
  });

  it('shows all-day and repeat lines', async () => {
    showInvite(ALLDAY_INVITE);
    expect(await screen.findByText(/All day/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add to Calendar' })).toBeOnTheScreen();
  });

  it('says how an event repeats', async () => {
    showInvite(WEEKLY_INVITE);
    expect(await screen.findByText('Every 2 weeks')).toBeOnTheScreen();
  });

  it('shows a cancellation with a way to remove the event it added', async () => {
    useSettingsStore.setState({ inviteEvents: { 'kickoff-2026@google.com': 'event-1' } });
    showInvite(CANCEL_INVITE);
    expect(await screen.findByText('This event was cancelled.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Remove from Calendar' })));
    expect(calendar.deleteEventAsync).toHaveBeenCalledWith('event-1');
  });

  it("shows someone's answer", async () => {
    showInvite(REPLY_INVITE);
    expect(await screen.findByText('Claire Dubois might attend.')).toBeOnTheScreen();
  });

  it('accepting sends the reply and adds the event', async () => {
    showInvite(GOOGLE_INVITE);
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Accept' })));
    expect(core.send).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'account-1',
        to: [{ name: 'Claire Dubois', email: 'claire@atlas.example' }],
        subject: 'Accepted: Atlas kickoff',
        bodyText: 'Bob Martin accepted the invitation.',
        inReplyToEmailId: 'email-1',
        from: undefined,
        calendar: expect.stringContaining('PARTSTAT=ACCEPTED'),
      }),
    );
    expect(calendar.createEventAsync).toHaveBeenCalled();
    expect(useSettingsStore.getState().inviteAnswers).toEqual({ 'kickoff-2026@google.com': { sequence: 0, partstat: 'ACCEPTED' } });
    expect(screen.getByRole('button', { name: 'Accept' })).toBeSelected();
  });

  it('declining removes the event it added', async () => {
    useSettingsStore.setState({ inviteEvents: { 'kickoff-2026@google.com': 'event-1' } });
    showInvite(GOOGLE_INVITE);
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Decline' })));
    expect(core.send.mock.calls[0][0].calendar).toContain('PARTSTAT=DECLINED');
    expect(calendar.deleteEventAsync).toHaveBeenCalledWith('event-1');
    expect(calendar.createEventAsync).not.toHaveBeenCalled();
  });

  it('answers from the identity that was invited', async () => {
    showInvite(GOOGLE_INVITE.replace('mailto:Bob@Example.com', 'mailto:support@example.org'));
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Maybe' })));
    expect(core.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: 'Support', email: 'support@example.org' },
        subject: 'Maybe: Atlas kickoff',
        calendar: expect.stringContaining('mailto:support@example.org'),
      }),
    );
  });

  it('keeps the previous answer when sending fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    core.send.mockRejectedValueOnce(new Error('offline'));
    showInvite(GOOGLE_INVITE);
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Accept' })));
    expect(alert).toHaveBeenCalledWith("The answer couldn't be sent.");
    expect(useSettingsStore.getState().inviteAnswers).toEqual({});
    expect(calendar.createEventAsync).not.toHaveBeenCalled();
  });

  it('says when the event could not be added', async () => {
    calendar.requestCalendarPermissionsAsync.mockResolvedValueOnce({ granted: false, status: 'denied' } as Permission);
    showInvite(GOOGLE_INVITE);
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Accept' })));
    expect(screen.getByText("The event couldn't be added to your calendar.")).toBeOnTheScreen();
    expect(core.send).toHaveBeenCalled();
  });

  it('remembers the answer of this sequence and asks again for an update', async () => {
    useSettingsStore.setState({ inviteAnswers: { 'kickoff-2026@google.com': { sequence: 0, partstat: 'ACCEPTED' } } });
    const { unmount } = showInvite(GOOGLE_INVITE);
    expect(await screen.findByRole('button', { name: 'Accept' })).toBeSelected();
    expect(screen.getByText('You accepted')).toBeOnTheScreen();
    unmount();
    queryClient.removeQueries({ queryKey: queryKeys.body('email-1') });
    showInvite(GOOGLE_INVITE.replace('SEQUENCE:0', 'SEQUENCE:1'));
    expect(await screen.findByText('This invitation was updated.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Accept' })).not.toBeSelected();
  });

  it('hides the invitation files once the card shows', async () => {
    showInvite(GOOGLE_INVITE);
    await screen.findByText('Atlas kickoff');
    expect(screen.queryByRole('button', { name: 'Open invite.ics' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open attachment-1' })).toBeNull();
  });

  it('keeps the invitation files when the invitation cannot be read', async () => {
    showInvite('not a calendar');
    expect(await screen.findByRole('button', { name: 'Open invite.ics' })).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull());
  });
});
