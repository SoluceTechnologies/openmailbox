import { fireEvent, screen } from '@testing-library/react-native';
import { MailboxRole } from '@openmailbox/mail-core';

import MailboxesScreen from '../../app/index';
import { queryClient, queryKeys } from '@/core/queryClient';
import { useSyncStore } from '@/stores/syncStore';
import i18n from '@/utils/i18n';

import { makeAccount, makeMailbox } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => mockRouter,
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
