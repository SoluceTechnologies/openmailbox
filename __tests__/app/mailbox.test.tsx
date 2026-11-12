import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Category, Destination, MailboxRole } from '@openmailbox/mail-core';

import MailboxScreen from '../../app/mailbox/[id]';
import { queryClient, queryKeys } from '@/core/queryClient';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUndoStore } from '@/stores/undoStore';
import i18n from '@/utils/i18n';

import { core, makeAccount, makeEmail, makeMailbox, makeThread, NOW } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockParams = { id: 'unified' };
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => mockRouter,
  router: { back: () => mockRouter.back(), replace: (href: string) => mockRouter.replace(href), canGoBack: () => true },
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
    useSettingsStore.setState({ inboxFilter: 'primary', categorySeenAt: {} });
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
    expect(core.listThreads).toHaveBeenCalledWith(expect.anything(), true, Category.Primary, undefined, 50);
  });

  it('marks the categories that received unread mail since their list was last shown', async () => {
    const newUpdate = makeThread({ threadId: 'thread-update', lastReceivedAt: NOW });
    const oldPromotion = makeThread({ threadId: 'thread-promotion', lastReceivedAt: NOW - 60_000 });
    useSettingsStore.setState({ categorySeenAt: { updates: NOW - 120_000, promotions: NOW - 60_000 } });
    core.listThreads.mockImplementation(async (_scope, unreadOnly, category, _cursor, limit) => ({
      threads:
        limit === 1
          ? category === Category.Updates
            ? [newUpdate]
            : category === Category.Promotions
              ? [oldPromotion]
              : []
          : category === Category.Updates
            ? [newUpdate]
            : unreadOnly
              ? [UNREAD]
              : [UNREAD, READ],
    }));
    renderWithProviders(<MailboxScreen />);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Updates' })).toHaveAccessibilityValue({ text: 'New mail' }));
    expect(screen.getByRole('tab', { name: 'Promotions' })).not.toHaveAccessibilityValue({ text: 'New mail' });

    fireEvent.press(screen.getByRole('tab', { name: 'Updates' }));
    await waitFor(() => expect(useSettingsStore.getState().categorySeenAt.updates).toBe(NOW));
    fireEvent.press(screen.getByRole('tab', { name: 'Primary' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Updates' })).not.toHaveAccessibilityValue({ text: 'New mail' }));
  });

  it('shows one inbox category at a time and remembers the choice', async () => {
    renderWithProviders(<MailboxScreen />);
    await screen.findByText('Facture disponible');
    expect(core.listThreads).toHaveBeenCalledWith(expect.anything(), false, Category.Primary, undefined, 50);
    fireEvent.press(screen.getByRole('tab', { name: 'Promotions' }));
    await waitFor(() =>
      expect(core.listThreads).toHaveBeenCalledWith(expect.anything(), false, Category.Promotions, undefined, 50),
    );
    expect(useSettingsStore.getState().inboxFilter).toBe('promotions');
    fireEvent.press(screen.getByRole('tab', { name: 'All Mail' }));
    await waitFor(() => expect(core.listThreads).toHaveBeenCalledWith(expect.anything(), false, undefined, undefined, 50));
  });

  it('lists every thread of other folders, without categories', async () => {
    mockParams = { id: 'mailbox-archive' };
    queryClient.setQueryData(queryKeys.mailboxes, [makeMailbox({ id: 'mailbox-archive', role: MailboxRole.Archive, name: 'Archive' })]);
    renderWithProviders(<MailboxScreen />);
    await screen.findByText('Facture disponible');
    expect(screen.queryByRole('tab', { name: 'Promotions' })).toBeNull();
    expect(core.listThreads).toHaveBeenCalledWith(expect.anything(), false, undefined, undefined, 50);
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

  describe('selection', () => {
    const OTHER_ACCOUNT_THREAD = makeThread({
      key: 'bob-inbox:thread-3',
      mailboxId: 'bob-inbox',
      accountId: 'account-2',
      latest: makeEmail({ id: 'email-3', threadId: 'thread-3', accountId: 'account-2', subject: 'Devis signé' }),
    });

    beforeEach(() => {
      queryClient.setQueryData(queryKeys.accounts, [makeAccount(), makeAccount({ id: 'account-2', email: 'bob@example.org' })]);
      queryClient.setQueryData(queryKeys.mailboxes, [
        makeMailbox({ unreadCount: 1 }),
        makeMailbox({ id: 'mailbox-archive', name: 'Archive', role: MailboxRole.Archive }),
        makeMailbox({ id: 'bob-inbox', accountId: 'account-2' }),
        makeMailbox({ id: 'bob-archive', accountId: 'account-2', name: 'Archive', role: MailboxRole.Archive }),
      ]);
      core.listThreads.mockResolvedValue({ threads: [UNREAD, READ, OTHER_ACCOUNT_THREAD] });
      core.moveThread.mockImplementation(async (mailboxId) => ({
        emailIds: [`${mailboxId}-email`],
        targetMailboxId: mailboxId === 'bob-inbox' ? 'bob-archive' : 'mailbox-archive',
      }));
    });

    it('turns rows into checkboxes', async () => {
      renderWithProviders(<MailboxScreen />);
      await screen.findByText('Devis signé');
      fireEvent.press(screen.getByRole('button', { name: 'Select' }));
      expect(screen.getAllByRole('checkbox')).toHaveLength(3);
      fireEvent.press(screen.getByText('Facture disponible'));
      expect(screen.getByText('1 selected')).toBeOnTheScreen();
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('archives threads of two accounts with one undo', async () => {
      renderWithProviders(<MailboxScreen />);
      await screen.findByText('Devis signé');
      fireEvent.press(screen.getByRole('button', { name: 'Select' }));
      fireEvent.press(screen.getByText('Facture disponible'));
      fireEvent.press(screen.getByText('Devis signé'));
      expect(screen.getByRole('button', { name: 'Move…' })).toBeDisabled();

      await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Archive' })));

      expect(core.moveThread.mock.calls.map(([mailboxId, threadId]) => [mailboxId, threadId])).toEqual([
        ['mailbox-inbox', 'thread-2'],
        ['bob-inbox', 'thread-3'],
      ]);
      await act(() => useUndoStore.getState().undo());
      expect(core.moveEmails).toHaveBeenCalledTimes(2);
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    });
  });
});
