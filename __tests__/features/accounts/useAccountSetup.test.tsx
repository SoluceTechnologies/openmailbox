import { act, renderHook } from '@testing-library/react-native';
import { CoreError, Security, type ServerConfig } from '@openmailbox/mail-core';

import { queryClient, queryKeys } from '@/core/queryClient';
import { readSecret } from '@/core/secrets';
import { LOCAL_TEST_PROVIDER, PROVIDERS } from '@/features/accounts/providers';
import { useAccountSetup } from '@/features/accounts/useAccountSetup';
import i18n from '@/utils/i18n';

import { core, makeAccount } from '../../helpers/fixtures';

const GOOGLE = PROVIDERS.find((provider) => provider.identifier === 'gmail')!;
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

  it('discovers the servers, adds the account and keeps the password in the keychain', async () => {
    const account = makeAccount({ id: 'account-9', email: 'alice@gmail.com' });
    core.discover.mockResolvedValue(DISCOVERED);
    core.addAccount.mockResolvedValue(account);
    core.listAccounts.mockResolvedValue([account]);
    const { result, onDone } = setup();
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
    );
    expect(await readSecret('account-9')).toBe('app-password');
    expect(queryClient.getQueryData(queryKeys.accounts)).toEqual([account]);
    expect(onDone).toHaveBeenCalledWith(account);
    expect(result.current.phase).toBe('idle');
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
