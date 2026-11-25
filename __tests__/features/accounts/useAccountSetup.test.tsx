import { act, renderHook } from '@testing-library/react-native';
import { CoreError, Security, type ServerConfig } from '@openmailbox/mail-core';

import { queryClient, queryKeys } from '@/core/queryClient';
import { readSecret, smtpSecretId } from '@/core/secrets';
import { LOCAL_TEST_PROVIDER, PROVIDERS } from '@/features/accounts/providers';
import { useAccountSetup } from '@/features/accounts/useAccountSetup';
import i18n from '@/utils/i18n';

import { core, makeAccount } from '../../helpers/fixtures';

const GOOGLE = PROVIDERS.find((provider) => provider.identifier === 'gmail')!;
const OTHER = PROVIDERS.find((provider) => provider.identifier === 'other')!;
const DISCOVERED: ServerConfig = {
  imap: { host: 'imap.gmail.com', port: 993, security: Security.Tls },
  smtp: { host: 'smtp.gmail.com', port: 465, security: Security.Tls },
  username: 'alice@gmail.com',
};

function setup(provider = GOOGLE) {
  const onDone = jest.fn();
  const hook = renderHook(() => useAccountSetup(provider, onDone));
  return { ...hook, onDone };
}

async function fill(result: ReturnType<typeof setup>['result'], email: string, password: string) {
  await act(async () => {
    result.current.setEmail(` ${email} `);
    result.current.setPassword(password);
  });
}

describe('account setup', () => {
  beforeAll(() => i18n.changeLanguage('en'));

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('needs a valid address and a password before signing in', async () => {
    const { result } = setup();
    expect(result.current.canSubmit).toBe(false);
    await fill(result, 'alice@', 'app-password');
    expect(result.current.canSubmit).toBe(false);
    await fill(result, 'alice@gmail.com', 'app-password');
    expect(result.current.email).toBe('alice@gmail.com');
    expect(result.current.canSubmit).toBe(true);
  });

  it('adds the account once when Sign In is tapped twice before the screen updates', async () => {
    const account = makeAccount({ id: 'account-9', email: 'alice@gmail.com' });
    core.discover.mockResolvedValue(DISCOVERED);
    core.addAccount.mockResolvedValue(account);
    core.listAccounts.mockResolvedValue([account]);
    const { result, onDone } = setup(OTHER);
    await fill(result, 'alice@gmail.com', 'app-password');

    const { submit } = result.current;
    await act(() => Promise.all([submit(), submit()]));

    expect(core.addAccount).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('discovers the servers of other providers, adds the account and keeps the password in the keychain', async () => {
    const account = makeAccount({ id: 'account-9', email: 'alice@gmail.com' });
    core.discover.mockResolvedValue(DISCOVERED);
    core.addAccount.mockResolvedValue(account);
    core.listAccounts.mockResolvedValue([account]);
    const { result, onDone } = setup(OTHER);
    await fill(result, 'alice@gmail.com', 'app-password');

    await act(() => result.current.submit());

    expect(core.discover).toHaveBeenCalledWith('alice@gmail.com');
    expect(core.addAccount).toHaveBeenCalledWith(
      {
        email: 'alice@gmail.com',
        displayName: 'alice@gmail.com',
        username: 'alice@gmail.com',
        imap: DISCOVERED.imap,
        smtp: DISCOVERED.smtp,
      },
      'app-password',
      undefined,
    );
    expect(await readSecret('account-9')).toBe('app-password');
    expect(await readSecret(smtpSecretId('account-9'))).toBeNull();
    expect(queryClient.getQueryData(queryKeys.accounts)).toEqual([account]);
    expect(onDone).toHaveBeenCalledWith(account);
    expect(result.current.phase).toBe('idle');
  });

  describe('with outgoing credentials of its own', () => {
    const ORG: ServerConfig = {
      imap: { host: 'imap.example.org', port: 993, security: Security.Tls },
      smtp: { host: 'mail.example.org', port: 587, security: Security.StartTls },
      username: 'alice@example.org',
    };

    async function submitManually(smtpUsername: string, smtpPassword: string, id = 'account-9') {
      core.discover.mockResolvedValue(ORG);
      core.addAccount.mockResolvedValue(makeAccount({ id, email: 'alice@example.org' }));
      const { result } = setup(OTHER);
      await fill(result, 'alice@example.org', 'imap-secret');
      await act(() => result.current.showManualSettings());
      await act(async () => {
        result.current.setServers({ ...result.current.servers!, smtpUsername });
        result.current.setSmtpPassword(smtpPassword);
      });
      await act(() => result.current.submit());
      return core.addAccount.mock.calls[0];
    }

    it('signs in to the outgoing server with its own username and password', async () => {
      const [config, secret, smtpSecret] = await submitManually('alice-smtp', 'smtp-secret');
      expect(config).toMatchObject({ username: 'alice@example.org', smtpUsername: 'alice-smtp', smtp: ORG.smtp });
      expect(secret).toBe('imap-secret');
      expect(smtpSecret).toBe('smtp-secret');
      expect(await readSecret('account-9')).toBe('imap-secret');
      expect(await readSecret(smtpSecretId('account-9'))).toBe('smtp-secret');
    });

    it('uses the incoming username when only an outgoing password is given', async () => {
      const [config, , smtpSecret] = await submitManually('', 'smtp-secret');
      expect(config.smtpUsername).toBe('alice@example.org');
      expect(smtpSecret).toBe('smtp-secret');
    });

    it('keeps no copy of the incoming password when only an outgoing username is given', async () => {
      const [config, , smtpSecret] = await submitManually('alice-smtp', '', 'account-11');
      expect(config.smtpUsername).toBe('alice-smtp');
      expect(smtpSecret).toBeUndefined();
      expect(await readSecret(smtpSecretId('account-11'))).toBeNull();
    });

    it('shares the incoming credentials when both outgoing fields are empty', async () => {
      const [config, , smtpSecret] = await submitManually('', '', 'account-10');
      expect(config.smtpUsername).toBeUndefined();
      expect(smtpSecret).toBeUndefined();
      expect(await readSecret('account-10')).toBe('imap-secret');
      expect(await readSecret(smtpSecretId('account-10'))).toBeNull();
    });
  });

  it('keeps the simple form when the password is wrong', async () => {
    core.discover.mockResolvedValue(DISCOVERED);
    core.addAccount.mockRejectedValue(new CoreError.Auth());
    const { result, onDone } = setup();
    await fill(result, 'alice@gmail.com', 'wrong');

    await act(() => result.current.submit());

    expect(result.current.error).toBe('The server rejected the email address or password.');
    expect(result.current.manual).toBe(false);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('opens the server settings when the servers cannot be found', async () => {
    core.discover.mockRejectedValue(new CoreError.Network({ message: 'no autoconfig' }));
    const { result } = setup(PROVIDERS.find((provider) => provider.identifier === 'other'));
    await fill(result, 'alice@example.org', 'secret');

    await act(() => result.current.submit());

    expect(result.current.error).toBe("The server can't be reached (no autoconfig).");
    expect(result.current.manual).toBe(true);
    expect(result.current.servers?.username).toBe('alice@example.org');
    expect(core.addAccount).not.toHaveBeenCalled();
  });

  it('fills in blank server settings when asked for them without a discoverable address', async () => {
    const { result } = setup(PROVIDERS.find((provider) => provider.identifier === 'other'));
    await act(() => result.current.showManualSettings());
    expect(core.discover).not.toHaveBeenCalled();
    expect(result.current.manual).toBe(true);
    expect(result.current.servers?.imap).toEqual({ host: '', port: 993, security: Security.Tls });
  });

  it('starts the development entry ready to sign in to GreenMail', async () => {
    core.addAccount.mockResolvedValue(makeAccount({ email: 'alice@example.com' }));
    const { result } = setup(LOCAL_TEST_PROVIDER);
    expect(result.current.canSubmit).toBe(true);
    expect(result.current.manual).toBe(true);

    await act(() => result.current.submit());

    expect(core.discover).not.toHaveBeenCalled();
    expect(core.addAccount.mock.calls[0][0].imap.port).toBe(3993);
  });
});
