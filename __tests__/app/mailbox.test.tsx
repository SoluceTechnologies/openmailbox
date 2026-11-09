import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Destination, MailboxRole } from '@openmailbox/mail-core';

import MailboxScreen from '../../app/mailbox/[id]';
import { queryClient, queryKeys } from '@/core/queryClient';
import i18n from '@/utils/i18n';

import { core, makeAccount, makeEmail, makeMailbox, makeThread, NOW } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockParams = { id: 'unified' };
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

const UNREAD = makeThread();
const READ = makeThread({
  key: 'mailbox-inbox:thread-2',
  latest: makeEmail({ id: 'email-2', threadId: 'thread-2', subject: 'Facture disponible', isSeen: true }),
});

describe('thread list', () => {
  beforeAll(async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    await i18n.changeLanguage('en');
  });

  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: 'unified' };
    queryClient.clear();
    queryClient.setQueryData(queryKeys.accounts, [makeAccount()]);
    queryClient.setQueryData(queryKeys.mailboxes, [makeMailbox({ unreadCount: 1 })]);
    core.listThreads.mockImplementation(async (_scope, unreadOnly) => ({ threads: unreadOnly ? [UNREAD] : [UNREAD, READ] }));
  });

  it('lists the threads of every inbox under the unread count', async () => {
    renderWithProviders(<MailboxScreen />);
    expect(screen.getByText('All Inboxes')).toBeOnTheScreen();
    expect(screen.getByText('1 unread')).toBeOnTheScreen();
    expect(await screen.findByText('Facture disponible')).toBeOnTheScreen();
    expect(screen.getByText('Lancement du projet Atlas')).toBeOnTheScreen();
  });

  it('filters down to unread threads', async () => {
    renderWithProviders(<MailboxScreen />);
    await screen.findByText('Facture disponible');
    fireEvent.press(screen.getByRole('tab', { name: 'Unread' }));
    await waitFor(() => expect(screen.queryByText('Facture disponible')).toBeNull());
    expect(core.listThreads).toHaveBeenLastCalledWith(expect.anything(), true, undefined, 50);
  });

  it('opens a thread in the mailbox it was listed from', async () => {
    renderWithProviders(<MailboxScreen />);
    fireEvent.press(await screen.findByText('Facture disponible'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/thread/[threadId]',
      params: { threadId: 'thread-2', mailboxId: 'mailbox-inbox' },
    });
  });

  it('says so when there is no mail', async () => {
    core.listThreads.mockResolvedValue({ threads: [] });
    renderWithProviders(<MailboxScreen />);
    expect(await screen.findByText(i18n.t('threads.empty'))).toBeOnTheScreen();
  });

  it('previews a thread on long press without marking it read', async () => {
    core.body.mockResolvedValue({ text: 'Bonjour, voici la facture du mois.', hasRemoteContent: false, attachments: [] });
    renderWithProviders(<MailboxScreen />);
    fireEvent(await screen.findByText('Facture disponible'), 'longPress');

    expect(await screen.findByText('Bonjour, voici la facture du mois.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Reply All' })).toBeOnTheScreen();
    expect(core.setThreadKeywords).not.toHaveBeenCalled();
  });

  it('moves junk back to the inbox from the preview', async () => {
    mockParams = { id: 'mailbox-junk' };
    queryClient.setQueryData(queryKeys.mailboxes, [
      makeMailbox({ unreadCount: 1 }),
      makeMailbox({ id: 'mailbox-junk', name: 'Junk', role: MailboxRole.Junk }),
      makeMailbox({ id: 'mailbox-trash', name: 'Trash', role: MailboxRole.Trash }),
    ]);
    const junk = makeThread({ key: 'mailbox-junk:thread-9', mailboxId: 'mailbox-junk' });
    core.listThreads.mockResolvedValue({ threads: [junk] });
    core.moveThread.mockResolvedValue({ emailIds: ['email-1'], targetMailboxId: 'mailbox-inbox' });
    renderWithProviders(<MailboxScreen />);
    fireEvent(await screen.findByText('Lancement du projet Atlas'), 'longPress');

    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Not Junk' })));

    const [mailboxId, , destination, hold] = core.moveThread.mock.calls[0];
    expect(mailboxId).toBe('mailbox-junk');
    expect(Destination.Inbox.instanceOf(destination)).toBe(true);
    expect(hold).toBe(5000);
  });

  it('moves a thread to the folder picked from Move…', async () => {
    queryClient.setQueryData(queryKeys.mailboxes, [
      makeMailbox({ unreadCount: 1 }),
      makeMailbox({ id: 'mailbox-clients', name: 'Clients', role: undefined }),
    ]);
    core.moveThread.mockResolvedValue({ emailIds: ['email-1'], targetMailboxId: 'mailbox-clients' });
    renderWithProviders(<MailboxScreen />);
    fireEvent(await screen.findByText('Facture disponible'), 'longPress');
    fireEvent.press(await screen.findByRole('button', { name: 'Move…' }));

    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Clients' })));

    const [, , destination] = core.moveThread.mock.calls[0];
    expect(Destination.Mailbox.instanceOf(destination) && destination.inner.mailboxId).toBe('mailbox-clients');
  });
});
