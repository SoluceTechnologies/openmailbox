import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import MailboxScreen from '../../app/mailbox/[id]';
import { queryClient, queryKeys } from '@/core/queryClient';
import i18n from '@/utils/i18n';

import { core, makeAccount, makeEmail, makeMailbox, makeThread, NOW } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ id: 'unified' }),
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
});
