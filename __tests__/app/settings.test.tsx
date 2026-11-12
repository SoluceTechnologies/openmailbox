import { Alert } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Security } from '@openmailbox/mail-core';

import AccountsSettingsScreen from '../../app/settings/accounts';
import SettingsScreen from '../../app/settings/index';
import NotificationSettingsScreen from '../../app/settings/notifications';
import ReadingSettingsScreen from '../../app/settings/reading';
import { queryClient, queryKeys } from '@/core/queryClient';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSyncStore } from '@/stores/syncStore';
import i18n from '@/utils/i18n';

import { makeAccount } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useRouter: () => mockRouter, router: { back: () => mockRouter.back(), replace: (href: string) => mockRouter.replace(href), canGoBack: () => true } }));

describe('settings', () => {
  beforeAll(() => i18n.changeLanguage('en'));

  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'en', loadRemoteImages: false, contactPictures: true, accountNames: { 'account-1': 'Work' }, accountOrder: [], defaultAccountId: null });
    useSyncStore.setState({ statuses: {}, authRequired: {} });
    queryClient.setQueryData(queryKeys.accounts, [
      makeAccount({ imap: { host: 'imap.gmail.com', port: 993, security: Security.Tls } }),
      makeAccount({ id: 'account-2', email: 'bob@example.com', displayName: 'bob@example.com' }),
    ]);
  });

  it('opens a page for each category', () => {
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Accounts' }));
    fireEvent.press(screen.getByRole('button', { name: 'Notifications' }));
    fireEvent.press(screen.getByRole('button', { name: 'Reading' }));
    expect(mockRouter.push.mock.calls).toEqual([['/settings/accounts'], ['/settings/notifications'], ['/settings/reading']]);
    expect(screen.getByRole('button', { name: 'Accounts' })).toHaveTextContent(/2/);
  });

  it('lists accounts by name with their provider, without repeating an address used as the name', () => {
    renderWithProviders(<AccountsSettingsScreen />);
    expect(screen.getByLabelText('Work')).toBeOnTheScreen();
    expect(screen.queryByText('Alice Martin')).toBeNull();
    expect(screen.getByText('Google · alice@example.com')).toBeOnTheScreen();
    // A server the app does not know is named after its domain.
    expect(screen.getByText('example.com')).toBeOnTheScreen();
    expect(screen.getAllByText('bob@example.com')).toHaveLength(1);
  });

  it('moves an account with the accessibility actions, which reorders it everywhere', () => {
    renderWithProviders(<AccountsSettingsScreen />);
    expect(screen.getByText(i18n.t('accounts.reorderHint'))).toBeOnTheScreen();
    const work = screen.getByLabelText('Work');
    expect(work.props.accessibilityActions).toEqual([{ name: 'moveDown', label: 'Move Down' }]);
    fireEvent(work, 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
    expect(useSettingsStore.getState().accountOrder).toEqual(['account-2', 'account-1']);
    expect(screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)).toEqual(['Back', 'bob@example.com', 'Work', 'Add Account', 'Default Account']);
  });

  it('opens an account and the add account flow', () => {
    renderWithProviders(<AccountsSettingsScreen />);
    fireEvent.press(screen.getByLabelText('Work'));
    fireEvent.press(screen.getByRole('button', { name: 'Add Account' }));
    expect(mockRouter.push.mock.calls).toEqual([['/settings/account/account-1'], ['/accounts/add']]);
  });

  it('picks the default account, the first one until another is chosen', () => {
    renderWithProviders(<AccountsSettingsScreen />);
    const picker = screen.getByRole('button', { name: 'Default Account' });
    expect(picker).toHaveTextContent(/Work/);
    expect(screen.getByText(i18n.t('accounts.defaultAccountHint'))).toBeOnTheScreen();
    fireEvent.press(picker);
    fireEvent.press(screen.getAllByText('bob@example.com').at(-1)!);
    expect(useSettingsStore.getState().defaultAccountId).toBe('account-2');
    expect(screen.getByRole('button', { name: 'Default Account' })).toHaveTextContent(/bob@example\.com/);
  });

  it('hides the default account picker with a single account', () => {
    queryClient.setQueryData(queryKeys.accounts, [makeAccount()]);
    renderWithProviders(<AccountsSettingsScreen />);
    expect(screen.queryByRole('button', { name: 'Default Account' })).toBeNull();
  });

  it('blocks remote images until switched on', () => {
    renderWithProviders(<ReadingSettingsScreen />);
    const toggle = screen.getByRole('switch', { name: i18n.t('settings.loadRemoteImages') });
    expect(toggle).not.toBeChecked();
    fireEvent(toggle, 'valueChange', true);
    expect(useSettingsStore.getState().loadRemoteImages).toBe(true);
  });

  it('shows contact pictures until switched off', () => {
    renderWithProviders(<ReadingSettingsScreen />);
    const toggle = screen.getByRole('switch', { name: 'Contact Pictures' });
    expect(toggle).toBeChecked();
    fireEvent(toggle, 'valueChange', false);
    expect(useSettingsStore.getState().contactPictures).toBe(false);
    expect(screen.getByText('Pictures come from Gravatar, or from the logo or the website of the sender’s company, which can tell that you are in touch.')).toBeOnTheScreen();
  });

  it('shows the current language next to Appearance', () => {
    useSettingsStore.setState({ language: 'nl' });
    renderWithProviders(<SettingsScreen />);
    expect(screen.getByText('Nederlands')).toBeOnTheScreen();
  });

  describe('notifications', () => {
    beforeEach(() => useSettingsStore.setState({ notificationsEnabled: true, silencedAccountIds: [] }));

    it('turns new mail notifications off, then off for one account', () => {
      renderWithProviders(<NotificationSettingsScreen />);
      fireEvent(screen.getByRole('switch', { name: 'Work' }), 'valueChange', false);
      expect(useSettingsStore.getState().silencedAccountIds).toEqual(['account-1']);
      fireEvent(screen.getByRole('switch', { name: i18n.t('settings.notifyNewMail') }), 'valueChange', false);
      expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
      expect(screen.queryByRole('switch', { name: 'Work' })).toBeNull();
    });

    it('explains how to allow notifications when the system refuses them', async () => {
      useSettingsStore.setState({ notificationsEnabled: false });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      renderWithProviders(<NotificationSettingsScreen />);
      await act(async () => fireEvent(screen.getByRole('switch', { name: i18n.t('settings.notifyNewMail') }), 'valueChange', true));
      expect(alert).toHaveBeenCalledWith(i18n.t('settings.notifications'), i18n.t('settings.notificationsDenied'), expect.any(Array));
      expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
    });
  });
});
