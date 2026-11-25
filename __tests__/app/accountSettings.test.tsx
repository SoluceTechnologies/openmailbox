import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { Authentication, CoreError, Security } from '@openmailbox/mail-core';

import AccountSettingsScreen from '../../app/settings/account/[id]';
import { queryClient, queryKeys } from '@/core/queryClient';
import { readSecret, saveSecret, smtpSecretId } from '@/core/secrets';
import { useSignatureEditor } from '@/features/signatures/signatureEditorStore';
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

  it('names the account in the app apart from the name recipients see', () => {
    useSettingsStore.setState({ accountNames: {} });
    renderWithProviders(<AccountSettingsScreen />);
    const name = screen.getByLabelText('Account Name');
    expect(name).toHaveProp('placeholder', 'alice@example.com');
    expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0);
    fireEvent.changeText(name, 'Work');
    expect(useSettingsStore.getState().accountNames['account-1']).toBe('Work');
    expect(screen.getByText('Work')).toBeOnTheScreen();
    expect(core.renameAccount).not.toHaveBeenCalled();
  });

  it('picks the color that marks the account from its row', async () => {
    renderWithProviders(<AccountSettingsScreen />);
    expect(screen.queryByRole('radio', { name: 'Mint' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Color, Blue' }));
    expect(screen.getByRole('radio', { name: 'Blue' })).toBeChecked();
    fireEvent.press(screen.getByRole('radio', { name: 'Mint' }));
    expect(core.setAccountColor).toHaveBeenCalledWith('account-1', 11);
    expect(await screen.findByRole('button', { name: 'Color, Mint' })).toBeOnTheScreen();
  });

  it('shows the whole address of the account as text', () => {
    renderWithProviders(<AccountSettingsScreen />);
    expect(screen.queryByDisplayValue('alice@example.com')).toBeNull();
    expect(screen.getByText('Email')).toBeOnTheScreen();
    expect(screen.getAllByText('alice@example.com').length).toBeGreaterThanOrEqual(2);
  });

  it('signs in again only once while a sign-in is running', async () => {
    queryClient.setQueryData(queryKeys.accounts, [makeAccount({ authentication: Authentication.Microsoft })]);
    core.beginAccountSignIn.mockReturnValue({ url: 'https://login.microsoftonline.com/authorize', redirectUri: 'openmailbox://oauth' });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url: 'openmailbox://oauth?code=c' });
    let finish: () => void = () => undefined;
    core.reauthorize.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    renderWithProviders(<AccountSettingsScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Sign in Again' }));
    await waitFor(() => expect(core.reauthorize).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Sign in Again' })).toBeNull();
    expect(screen.getByTestId('sign-in-again-progress')).toBeOnTheScreen();

    await act(async () => finish());
    expect(await screen.findByText('Signed in.')).toBeOnTheScreen();
    expect(core.beginAccountSignIn).toHaveBeenCalledTimes(1);
  });

  it('lists sender identities and opens them', () => {
    useSettingsStore.setState({ identities: { 'account-1': [{ id: 'identity-1', name: 'Support', email: 'info@example.com', signature: { html: '', text: '' } }] } });
    renderWithProviders(<AccountSettingsScreen />);
    fireEvent.press(screen.getByText('info@example.com'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/settings/identity',
      params: { accountId: 'account-1', identityId: 'identity-1' },
    });
    fireEvent.press(screen.getByText('Add Identity'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/settings/identity', params: { accountId: 'account-1' } });
  });

  it('changes the sender name when its field is left', () => {
    renderWithProviders(<AccountSettingsScreen />);
    const name = screen.getByLabelText('Sender Name');
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

  it('keeps Update Password inactive until a password is typed', () => {
    renderWithProviders(<AccountSettingsScreen />);
    expect(screen.queryByRole('button', { name: 'Update Password' })).toBeNull();
    fireEvent.press(screen.getByText('Update Password'));
    expect(core.updatePassword).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Password'), 'new-secret');
    expect(screen.getByRole('button', { name: 'Update Password' })).toBeOnTheScreen();
  });

  it('stores a new outgoing password for an account that signs in to its outgoing server apart', async () => {
    queryClient.setQueryData(queryKeys.accounts, [makeAccount({ smtpUsername: 'alice-smtp' })]);
    renderWithProviders(<AccountSettingsScreen />);
    expect(screen.getByText('Outgoing Username')).toBeOnTheScreen();
    expect(screen.getByText('alice-smtp')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Outgoing Password'), 'smtp-new');
    fireEvent.press(screen.getByText('Update Password'));

    expect(await screen.findByText('Password updated.')).toBeOnTheScreen();
    expect(core.updateSmtpPassword).toHaveBeenCalledWith('account-1', 'smtp-new');
    expect(core.updatePassword).not.toHaveBeenCalled();
    expect(await readSecret(smtpSecretId('account-1'))).toBe('smtp-new');
  });

  it('asks for one password when the outgoing server shares the incoming credentials', () => {
    renderWithProviders(<AccountSettingsScreen />);
    expect(screen.queryByText('Outgoing Username')).toBeNull();
    expect(screen.queryByLabelText('Outgoing Password')).toBeNull();
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

  it('signs in again on the provider page for an account added that way', async () => {
    queryClient.setQueryData(queryKeys.accounts, [
      makeAccount({
        authentication: Authentication.Microsoft,
        imap: { host: 'outlook.office365.com', port: 993, security: Security.Tls },
      }),
    ]);
    core.beginAccountSignIn.mockReturnValue({ url: 'https://login.microsoftonline.com/authorize', redirectUri: 'openmailbox://oauth' });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url: 'openmailbox://oauth?code=c' });
    renderWithProviders(<AccountSettingsScreen />);
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByText('Microsoft asks you to sign in again to resume syncing.')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Sign in Again' }));

    await waitFor(() => expect(core.reauthorize).toHaveBeenCalledWith('account-1', 'openmailbox://oauth?code=c'));
    expect(core.beginAccountSignIn).toHaveBeenCalledWith('account-1');
    expect(await screen.findByText('Signed in.')).toBeOnTheScreen();
    expect(useSyncStore.getState().authRequired['account-1']).toBe(false);
  });

  it('says why signing in again failed and stays quiet when it was cancelled', async () => {
    queryClient.setQueryData(queryKeys.accounts, [makeAccount({ authentication: Authentication.Microsoft })]);
    core.beginAccountSignIn.mockReturnValue({ url: 'https://login.microsoftonline.com/authorize', redirectUri: 'openmailbox://oauth' });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'cancel' });
    renderWithProviders(<AccountSettingsScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Sign in Again' }));
    await waitFor(() => expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalled());
    expect(core.reauthorize).not.toHaveBeenCalled();

    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url: 'openmailbox://oauth?code=c' });
    core.reauthorize.mockRejectedValueOnce(new CoreError.InvalidInput({ message: 'signed in as bob@outlook.com' }));
    fireEvent.press(screen.getByRole('button', { name: 'Sign in Again' }));
    expect(await screen.findByText(/signed in as bob@outlook.com/)).toBeOnTheScreen();
  });

  it('edits the account signature in the signature editor', () => {
    useSettingsStore.getState().setSignature('account-1', { html: 'Charles', text: 'Charles' });
    renderWithProviders(<AccountSettingsScreen />);
    fireEvent.press(screen.getByRole('button', { name: i18n.t('accounts.editSignature') }));
    expect(mockRouter.push).toHaveBeenCalledWith('/signature');
    expect(useSignatureEditor.getState().value).toEqual({ html: 'Charles', text: 'Charles' });

    act(() => useSignatureEditor.getState().onDone!({ html: '<b>Charles</b><br>Soluce', text: 'Charles\nSoluce' }));
    expect(useSettingsStore.getState().signatures['account-1']).toEqual({ html: '<b>Charles</b><br>Soluce', text: 'Charles\nSoluce' });
  });

  it('removes the account and its password after confirmation', async () => {
    await saveSecret(smtpSecretId('account-1'), 'smtp-secret');
    useSettingsStore.getState().setSignature('account-1', { html: 'Charles', text: 'Charles' });
    useSettingsStore.getState().setAccountNotified('account-1', false);
    useSettingsStore.getState().setAccountName('account-1', 'Work');
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
    expect(await readSecret(smtpSecretId('account-1'))).toBeNull();
    expect(useSettingsStore.getState().signatures['account-1']).toBeUndefined();
    expect(useSettingsStore.getState().silencedAccountIds).not.toContain('account-1');
    expect(useSettingsStore.getState().accountNames['account-1']).toBeUndefined();
  });
});
