import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Destination, Keyword, MailboxRole } from '@openmailbox/mail-core';

import ThreadScreen from '../../app/thread/[threadId]';
import { queryClient, queryKeys } from '@/core/queryClient';
import i18n from '@/utils/i18n';

import { core, makeEmail, makeMailbox, NOW } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ threadId: 'thread-1', mailboxId: 'mailbox-inbox' }),
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
    queryClient.clear();
    queryClient.setQueryData(queryKeys.mailboxes, [
      makeMailbox(),
      makeMailbox({ id: 'mailbox-archive', name: 'Archive', role: MailboxRole.Archive }),
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

  it('archives the thread and goes back to the list', async () => {
    renderWithProviders(<ThreadScreen />);
    await screen.findByText('Nadia Benali');
    fireEvent.press(screen.getByRole('button', { name: 'Archive' }));
    expect(Destination.Archive.instanceOf(core.moveThread.mock.calls[0][2])).toBe(true);
    expect(mockRouter.back).toHaveBeenCalled();
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
