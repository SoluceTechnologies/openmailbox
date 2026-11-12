import { fireEvent, screen } from '@testing-library/react-native';
import { MailboxRole } from '@openmailbox/mail-core';

import MailboxesScreen from '../../app/index';
import { queryClient, queryKeys } from '@/core/queryClient';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSyncStore } from '@/stores/syncStore';
import i18n from '@/utils/i18n';

import { makeAccount, makeMailbox } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => mockRouter,
  router: { back: () => mockRouter.back(), replace: (href: string) => mockRouter.replace(href), canGoBack: () => true },
  Redirect: ({ href }: { href: string }) => require('react').createElement(require('react-native').Text, null, `redirect ${href}`),
}));

const ALICE = makeAccount();
const BOB = makeAccount({ id: 'account-2', email: 'bob@example.org', displayName: 'Bob', color: 1 });

describe('mailboxes', () => {
  beforeAll(() => i18n.changeLanguage('en'));

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    useSyncStore.setState({ statuses: {}, authRequired: {} });
    useSettingsStore.setState({ accountNames: { 'account-2': 'Personal' }, collapsedIds: [], accountOrder: [] });
    queryClient.setQueryData(queryKeys.accounts, [ALICE, BOB]);
    queryClient.setQueryData(queryKeys.mailboxes, [
      makeMailbox({ unreadCount: 3 }),
      makeMailbox({ id: 'alice-archive', name: 'Archive', role: MailboxRole.Archive, unreadCount: 0 }),
      makeMailbox({ id: 'alice-clients', name: 'Clients', role: undefined, depth: 1, unreadCount: 2 }),
      makeMailbox({ id: 'bob-inbox', accountId: 'account-2', unreadCount: 4 }),
    ]);
  });

  it('opens the unified inbox once when the app starts with accounts', () => {
    const { unmount } = renderWithProviders(<MailboxesScreen />);
    unmount();
    renderWithProviders(<MailboxesScreen />);
    expect(mockRouter.push.mock.calls).toEqual([['/mailbox/unified']]);
  });

  it('sums the unread mail of every inbox', () => {
    renderWithProviders(<MailboxesScreen />);
    const allInboxes = screen.getByRole('button', { name: 'All Inboxes' });
    expect(allInboxes).toHaveTextContent(/7/);
  });

  it('groups the folders of each account under its name', () => {
    renderWithProviders(<MailboxesScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Clients' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/mailbox/alice-clients');

    fireEvent.press(screen.getAllByRole('button', { expanded: true })[0]);
    expect(screen.queryByRole('button', { name: 'Clients' })).toBeNull();
    expect(useSettingsStore.getState().collapsedIds).toEqual(['account-1']);
  });

  it('folds a folder over its subfolders and keeps it folded', () => {
    const { unmount } = renderWithProviders(<MailboxesScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Archive', expanded: true }));
    expect(screen.queryByRole('button', { name: 'Clients' })).toBeNull();
    unmount();

    renderWithProviders(<MailboxesScreen />);
    expect(screen.getByRole('button', { name: 'Archive', expanded: false })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Clients' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Archive', expanded: false }));
    expect(screen.getByRole('button', { name: 'Clients' })).toBeOnTheScreen();
  });

  it('names each account by its account name, else its address, never the sender name', () => {
    renderWithProviders(<MailboxesScreen />);
    expect(screen.getAllByText('alice@example.com')).toHaveLength(2);
    expect(screen.getAllByText('Personal')).toHaveLength(2);
    expect(screen.queryByText('Bob')).toBeNull();
  });

  it('lists accounts in the order chosen in Settings', () => {
    useSettingsStore.setState({ accountOrder: ['account-2', 'account-1'] });
    renderWithProviders(<MailboxesScreen />);
    const names = screen.getAllByText(/^(Personal|alice@example\.com)$/).map((text) => text.props.children);
    expect(names).toEqual(['Personal', 'alice@example.com', 'Personal', 'alice@example.com']);
  });

  it('warns when an account needs its password again', () => {
    useSyncStore.setState({ authRequired: { 'account-2': true } });
    renderWithProviders(<MailboxesScreen />);
    fireEvent.press(screen.getByText(i18n.t('accounts.reconnectRequired')));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/settings/account/account-2');
  });

  it('sends a fresh install to onboarding', () => {
    queryClient.setQueryData(queryKeys.accounts, []);
    renderWithProviders(<MailboxesScreen />);
    expect(screen.getByText('redirect /onboarding')).toBeOnTheScreen();
  });
});
