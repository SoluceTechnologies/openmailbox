import { Alert } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Security } from '@openmailbox/mail-core';

import SettingsScreen from '../../app/settings/index';
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
    useSettingsStore.setState({ language: 'en', loadRemoteImages: false, contactPictures: true });
    useSyncStore.setState({ statuses: {}, authRequired: {} });
    queryClient.setQueryData(queryKeys.accounts, [
      makeAccount({ imap: { host: 'imap.gmail.com', port: 993, security: Security.Tls } }),
      makeAccount({ id: 'account-2', email: 'bob@example.com', displayName: 'bob@example.com' }),
    ]);
  });

  it('lists accounts with their provider, without repeating an address used as the name', () => {
    useSettingsStore.setState({ notificationsEnabled: false });
    renderWithProviders(<SettingsScreen />);
    expect(screen.getByText('Alice Martin')).toBeOnTheScreen();
    expect(screen.getByText('Google · alice@example.com')).toBeOnTheScreen();
    // A server the app does not know is named after its domain.
    expect(screen.getByText('example.com')).toBeOnTheScreen();
    expect(screen.getAllByText('bob@example.com')).toHaveLength(1);
  });

  it('opens an account and the add account flow', () => {
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Alice Martin' }));
    fireEvent.press(screen.getByRole('button', { name: 'Add Account' }));
    expect(mockRouter.push.mock.calls).toEqual([['/settings/account/account-1'], ['/accounts/add']]);
  });

  it('blocks remote images until switched on', () => {
    renderWithProviders(<SettingsScreen />);
    const toggle = screen.getByRole('switch', { name: i18n.t('settings.loadRemoteImages') });
    expect(toggle).not.toBeChecked();
    fireEvent(toggle, 'valueChange', true);
    expect(useSettingsStore.getState().loadRemoteImages).toBe(true);
  });

  it('shows contact pictures until switched off', () => {
    renderWithProviders(<SettingsScreen />);
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
      renderWithProviders(<SettingsScreen />);
      fireEvent(screen.getByRole('switch', { name: 'Alice Martin' }), 'valueChange', false);
      expect(useSettingsStore.getState().silencedAccountIds).toEqual(['account-1']);
      fireEvent(screen.getByRole('switch', { name: i18n.t('settings.notifyNewMail') }), 'valueChange', false);
      expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
      expect(screen.queryByRole('switch', { name: 'Alice Martin' })).toBeNull();
    });

    it('explains how to allow notifications when the system refuses them', async () => {
      useSettingsStore.setState({ notificationsEnabled: false });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      renderWithProviders(<SettingsScreen />);
      await act(async () => fireEvent(screen.getByRole('switch', { name: i18n.t('settings.notifyNewMail') }), 'valueChange', true));
      expect(alert).toHaveBeenCalledWith(i18n.t('settings.notifications'), i18n.t('settings.notificationsDenied'), expect.any(Array));
      expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
    });
  });
});
