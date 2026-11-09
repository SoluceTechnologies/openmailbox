import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import { Destination, Keyword, MailboxRole, UnsubscribeOutcome } from '@openmailbox/mail-core';

import ThreadScreen from '../../app/thread/[threadId]';
import { queryClient, queryKeys } from '@/core/queryClient';
import i18n from '@/utils/i18n';

import { core, makeEmail, makeMailbox, NOW } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockParams = { threadId: 'thread-1', mailboxId: 'mailbox-inbox' };
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

const FIRST = makeEmail({ id: 'email-1', isSeen: true, receivedAt: NOW - 7_200_000, preview: 'Bonjour à tous.' });
const REPLY = makeEmail({
  id: 'email-2',
  subject: 'Re: Lancement du projet Atlas',
  from: [{ name: 'Nadia Benali', email: 'nadia@example.org' }],
  isSeen: false,
  receivedAt: NOW - 3_600_000,
  preview: 'Jeudi me convient.',
});

describe('reader', () => {
  beforeAll(async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    await i18n.changeLanguage('en');
  });

  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { threadId: 'thread-1', mailboxId: 'mailbox-inbox' };
    queryClient.clear();
    queryClient.setQueryData(queryKeys.mailboxes, [
      makeMailbox(),
      makeMailbox({ id: 'mailbox-archive', name: 'Archive', role: MailboxRole.Archive }),
      makeMailbox({ id: 'mailbox-junk', name: 'Junk', role: MailboxRole.Junk }),
      makeMailbox({ id: 'mailbox-trash', name: 'Trash', role: MailboxRole.Trash }),
    ]);
    core.threadEmails.mockResolvedValue([FIRST, REPLY]);
  });

  it('shows the conversation and marks its unread messages as read', async () => {
    renderWithProviders(<ThreadScreen />);
    expect(await screen.findByText('Re: Lancement du projet Atlas')).toBeOnTheScreen();
    expect(screen.getByText('Claire Dubois')).toBeOnTheScreen();
    expect(screen.getByText('Nadia Benali')).toBeOnTheScreen();
    await waitFor(() =>
      expect(core.setThreadKeywords).toHaveBeenCalledWith('mailbox-inbox', 'thread-1', [Keyword.Seen], []),
    );
  });

  it('opens the latest message and leaves read ones collapsed to their preview', async () => {
    renderWithProviders(<ThreadScreen />);
    await screen.findByText('Nadia Benali');
    expect(screen.getByText('Bonjour à tous.')).toBeOnTheScreen();
    expect(screen.queryByText('Jeudi me convient.')).toBeNull();
  });

  it('archives the thread from More and goes back to the list', async () => {
    core.moveThread.mockResolvedValue({ emailIds: ['email-1', 'email-2'], targetMailboxId: 'mailbox-archive' });
    renderWithProviders(<ThreadScreen />);
    await screen.findByText('Nadia Benali');
    fireEvent.press(screen.getByRole('button', { name: 'More' }));
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Archive' })));
    const [, , destination, hold] = core.moveThread.mock.calls[0];
    expect(Destination.Archive.instanceOf(destination)).toBe(true);
    expect(hold).toBe(5000);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('deletes from the toolbar and goes back', async () => {
    core.moveThread.mockResolvedValue({ emailIds: ['email-1'], targetMailboxId: 'mailbox-trash' });
    renderWithProviders(<ThreadScreen />);
    await screen.findByText('Nadia Benali');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Delete' })));
    expect(Destination.Trash.instanceOf(core.moveThread.mock.calls[0][2])).toBe(true);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('offers Not Junk when reading junk', async () => {
    mockParams = { threadId: 'thread-1', mailboxId: 'mailbox-junk' };
    renderWithProviders(<ThreadScreen />);
    await screen.findByText('Nadia Benali');
    fireEvent.press(screen.getByRole('button', { name: 'More' }));
    expect(await screen.findByRole('button', { name: 'Not Junk' })).toBeOnTheScreen();
  });

  describe('mailing lists', () => {
    const LIST_BODY = {
      text: 'Les nouvelles de la semaine.',
      hasRemoteContent: false,
      attachments: [],
      unsubscribe: { httpsUrl: 'https://lists.example/leave', mailto: undefined, oneClick: false },
    };

    it('says nothing for an ordinary message', async () => {
      renderWithProviders(<ThreadScreen />);
      await screen.findByText('Nadia Benali');
      expect(screen.queryByText(i18n.t('reader.mailingList'))).toBeNull();
    });

    it('opens the unsubscribe page when the list only has one', async () => {
      core.body.mockResolvedValue(LIST_BODY);
      core.unsubscribe.mockResolvedValue(new UnsubscribeOutcome.OpenInBrowser({ url: 'https://lists.example/leave' }));
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      const alert = jest.spyOn(Alert, 'alert');
      renderWithProviders(<ThreadScreen />);
      fireEvent.press(await screen.findByRole('button', { name: i18n.t('reader.unsubscribe') }));
      await act(async () => alert.mock.calls[0][2]!.find((button) => button.style !== 'cancel')!.onPress!());

      expect(core.unsubscribe).toHaveBeenCalledWith('email-2');
      expect(openURL).toHaveBeenCalledWith('https://lists.example/leave');
    });

    it('confirms once the list has been told', async () => {
      core.body.mockResolvedValue(LIST_BODY);
      core.unsubscribe.mockResolvedValue(new UnsubscribeOutcome.Done());
      const alert = jest.spyOn(Alert, 'alert');
      renderWithProviders(<ThreadScreen />);
      fireEvent.press(await screen.findByRole('button', { name: i18n.t('reader.unsubscribe') }));
      await act(async () => alert.mock.calls[0][2]!.find((button) => button.style !== 'cancel')!.onPress!());

      expect(await screen.findByText(i18n.t('reader.unsubscribed'))).toBeOnTheScreen();
    });
  });

  it('offers reply, reply all and forward from the reply button', async () => {
    renderWithProviders(<ThreadScreen />);
    await screen.findByText('Nadia Benali');
    fireEvent.press(screen.getByRole('button', { name: 'Reply' }));
    fireEvent.press(await screen.findByText('Reply All'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/compose',
      params: { mode: 'replyAll', emailId: 'email-2', threadId: 'thread-1', mailboxId: 'mailbox-inbox' },
    });
  });
});
