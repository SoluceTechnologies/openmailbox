import { Alert } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { CoreError } from '@openmailbox/mail-core';

import AccountSettingsScreen from '../../app/settings/account/[id]';
import { queryClient, queryKeys } from '@/core/queryClient';
import { readSecret, saveSecret } from '@/core/secrets';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSyncStore } from '@/stores/syncStore';
import i18n from '@/utils/i18n';

import { core, makeAccount } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => mockRouter,
  router: { back: () => mockRouter.back(), replace: (href: string) => mockRouter.replace(href), canGoBack: () => true },
  useLocalSearchParams: () => ({ id: 'account-1' }),
}));

describe('account settings', () => {
  beforeAll(() => i18n.changeLanguage('en'));

  beforeEach(() => {
    jest.clearAllMocks();
    useSyncStore.setState({ statuses: {}, authRequired: { 'account-1': true } });
    queryClient.setQueryData(queryKeys.accounts, [makeAccount()]);
  });

  it('shows the servers the account uses', () => {
    renderWithProviders(<AccountSettingsScreen />);
    expect(screen.getByText('imap.example.com:993 · SSL/TLS')).toBeOnTheScreen();
    expect(screen.getByText('smtp.example.com:465 · SSL/TLS')).toBeOnTheScreen();
  });

  it('renames the account when the name field is left', () => {
    renderWithProviders(<AccountSettingsScreen />);
    const name = screen.getByLabelText('Name');
    fireEvent.changeText(name, '  Alice D.  ');
    fireEvent(name, 'blur');
    expect(core.renameAccount).toHaveBeenCalledWith('account-1', 'Alice D.');
  });

  it('stores a new password and resumes syncing once the server accepts it', async () => {
    renderWithProviders(<AccountSettingsScreen />);
    fireEvent.changeText(screen.getByLabelText('Password'), 'new-secret');
    fireEvent.press(screen.getByText('Update Password'));

    expect(await screen.findByText('Password updated.')).toBeOnTheScreen();
    expect(core.updatePassword).toHaveBeenCalledWith('account-1', 'new-secret');
    expect(await readSecret('account-1')).toBe('new-secret');
    expect(useSyncStore.getState().authRequired['account-1']).toBe(false);
  });

  it('keeps the old password when the server rejects the new one', async () => {
    await saveSecret('account-1', 'old-secret');
    core.updatePassword.mockRejectedValueOnce(new CoreError.Auth());
    renderWithProviders(<AccountSettingsScreen />);
    fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
    fireEvent.press(screen.getByText('Update Password'));

    expect(await screen.findByText(i18n.t('errors.auth'))).toBeOnTheScreen();
    expect(await readSecret('account-1')).toBe('old-secret');
  });

  it('keeps a signature for the account', () => {
    renderWithProviders(<AccountSettingsScreen />);
    fireEvent.changeText(screen.getByLabelText(i18n.t('accounts.signature')), 'Charles\nSoluce Technologies');
    expect(useSettingsStore.getState().signatures['account-1']).toBe('Charles\nSoluce Technologies');
  });

  it('removes the account and its password after confirmation', async () => {
    useSettingsStore.getState().setSignature('account-1', 'Charles');
    useSettingsStore.getState().setAccountNotified('account-1', false);
    const alert = jest.spyOn(Alert, 'alert');
    renderWithProviders(<AccountSettingsScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Remove Account' }));

    const buttons = alert.mock.calls[0][2]!;
    await act(async () => {
      await buttons.find((button) => button.style === 'destructive')!.onPress!();
    });
    expect(mockRouter.back).toHaveBeenCalled();
    expect(core.removeAccount).toHaveBeenCalledWith('account-1');
    expect(await readSecret('account-1')).toBeNull();
    expect(useSettingsStore.getState().signatures['account-1']).toBeUndefined();
    expect(useSettingsStore.getState().silencedAccountIds).not.toContain('account-1');
  });
});
