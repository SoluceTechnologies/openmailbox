import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { CoreError, Security } from '@openmailbox/mail-core';

import ServerSettingsScreen from '../../app/settings/servers';
import { queryClient, queryKeys } from '@/core/queryClient';
import { readSecret, saveSecret, smtpSecretId } from '@/core/secrets';
import { useSyncStore } from '@/stores/syncStore';
import i18n from '@/utils/i18n';

import { core, makeAccount } from '../helpers/fixtures';
import { renderWithProviders } from '../helpers/render';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => mockRouter,
  router: { back: () => mockRouter.back(), replace: (href: string) => mockRouter.replace(href), canGoBack: () => true },
  useLocalSearchParams: () => ({ accountId: 'account-1' }),
}));

const account = makeAccount();

describe('server settings', () => {
  beforeAll(() => i18n.changeLanguage('en'));

  beforeEach(async () => {
    jest.clearAllMocks();
    useSyncStore.setState({ statuses: {}, authRequired: { 'account-1': true } });
    queryClient.setQueryData(queryKeys.accounts, [account]);
    await saveSecret('account-1', 'old-secret');
  });

  it('saves new servers once they sign in and keeps the typed password', async () => {
    renderWithProviders(<ServerSettingsScreen />);
    fireEvent.changeText(screen.getAllByLabelText('Server')[0], ' mail.example.org ');
    fireEvent.changeText(screen.getByLabelText('Username'), ' alice ');
    fireEvent.changeText(screen.getByLabelText('Password'), 'new');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(core.updateServers).toHaveBeenCalledWith(
      'account-1',
      {
        imap: { host: 'mail.example.org', port: 993, security: Security.Tls },
        smtp: account.smtp,
        username: 'alice',
        smtpUsername: undefined,
      },
      'new',
      undefined,
    );
    expect(await readSecret('account-1')).toBe('new');
    expect(useSyncStore.getState().authRequired['account-1']).toBe(false);
  });

  it('keeps the old settings when a server refuses them', async () => {
    core.updateServers.mockRejectedValueOnce(new CoreError.Auth());
    renderWithProviders(<ServerSettingsScreen />);
    fireEvent.changeText(screen.getAllByLabelText('Server')[0], 'mail.example.org');
    fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(i18n.t('errors.auth'))).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(await readSecret('account-1')).toBe('old-secret');
    expect(useSyncStore.getState().authRequired['account-1']).toBe(true);
    expect(screen.getAllByLabelText('Server')[0]).toHaveProp('value', 'mail.example.org');
  });

  it('saves only once while the servers are checked', async () => {
    let finish: () => void = () => undefined;
    core.updateServers.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    renderWithProviders(<ServerSettingsScreen />);
    fireEvent.changeText(screen.getAllByLabelText('Port')[0], '143');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull());
    expect(screen.getByLabelText('Connecting to imap.example.com…')).toBeOnTheScreen();
    expect(core.updateServers).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it('keeps Save inactive until a setting changes and every port is set', () => {
    renderWithProviders(<ServerSettingsScreen />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.changeText(screen.getAllByLabelText('Server')[0], 'mail.example.org');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.changeText(screen.getAllByLabelText('Port')[0], '');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('signs in to the outgoing server apart once an outgoing password is typed', async () => {
    renderWithProviders(<ServerSettingsScreen />);
    fireEvent.changeText(screen.getByLabelText('Outgoing Password'), 'smtp-new');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(core.updateServers).toHaveBeenCalledWith(
      'account-1',
      expect.objectContaining({ smtpUsername: 'alice@example.com' }),
      undefined,
      'smtp-new',
    );
    expect(await readSecret(smtpSecretId('account-1'))).toBe('smtp-new');
  });

  it('forgets the outgoing password when the outgoing server shares the incoming sign-in', async () => {
    queryClient.setQueryData(queryKeys.accounts, [makeAccount({ smtpUsername: 'smtp-user' })]);
    await saveSecret(smtpSecretId('account-1'), 'smtp-secret');
    renderWithProviders(<ServerSettingsScreen />);
    fireEvent.changeText(screen.getByLabelText('Outgoing Username'), '');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(core.updateServers).toHaveBeenCalledWith(
      'account-1',
      expect.objectContaining({ smtpUsername: undefined }),
      undefined,
      undefined,
    );
    expect(await readSecret(smtpSecretId('account-1'))).toBeNull();
    expect(await readSecret('account-1')).toBe('old-secret');
  });
});
