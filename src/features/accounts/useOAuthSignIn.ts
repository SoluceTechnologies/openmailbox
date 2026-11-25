import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import { CoreError, type Account, type ServerConfig, type SignInRequest } from '@openmailbox/mail-core';

import { mailCore } from '@/core/mailCore';
import { queryClient, queryKeys } from '@/core/queryClient';

import { describeCoreError } from './coreErrors';
import type { MailProvider, ProviderIdentifier } from './providers';

export function useOAuthSignIn(onDone: (account: Account) => void) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<ProviderIdentifier | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (provider: MailProvider, start: () => SignInRequest | Promise<SignInRequest>) => {
    setError(null);
    setPending(provider.identifier);
    try {
      const request = await start();
      const answer = await WebBrowser.openAuthSessionAsync(request.url, request.redirectUri);
      if (answer.type !== 'success') return;
      const account = await mailCore().addOauthAccount(answer.url, '');
      queryClient.setQueryData(queryKeys.accounts, await mailCore().listAccounts());
      onDone(account);
    } catch (failure) {
      if (!CoreError.Cancelled.instanceOf(failure)) setError(describeCoreError(failure, t));
    } finally {
      setPending(null);
    }
  };

  const signIn = async (provider: MailProvider) => {
    const authentication = provider.oauth;
    if (authentication === undefined) return;
    await run(provider, () => mailCore().beginSignIn(authentication, undefined));
  };

  const signInToServer = (provider: MailProvider, email: string, servers: ServerConfig) =>
    run(provider, () => mailCore().beginServerSignIn(email, servers));

  return { signIn, signInToServer, pending, error };
}
