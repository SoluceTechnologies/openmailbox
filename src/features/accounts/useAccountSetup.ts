import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CoreError, Security, type Account, type ServerConfig } from '@openmailbox/mail-core';

import { mailCore } from '@/core/mailCore';
import { queryClient, queryKeys } from '@/core/queryClient';
import { saveSecret } from '@/core/secrets';
import { isEmail } from '@/utils/addresses';

import { describeCoreError } from './coreErrors';
import type { MailProvider } from './providers';

export type SetupPhase = 'idle' | 'discovering' | 'connecting';

function emptyServers(email: string): ServerConfig {
  return {
    imap: { host: '', port: 993, security: Security.Tls },
    smtp: { host: '', port: 465, security: Security.Tls },
    username: email,
  };
}

export function useAccountSetup(provider: MailProvider, onDone: (account: Account) => void) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(provider.account?.email ?? '');
  const [password, setPassword] = useState(provider.account?.password ?? '');
  const [displayName, setDisplayName] = useState('');
  const [servers, setServers] = useState<ServerConfig | null>(provider.servers ?? null);
  const [manual, setManual] = useState(provider.identifier === 'local' || !!provider.editableServers);
  const [phase, setPhase] = useState<SetupPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  const updateEmail = (value: string) => {
    setEmail(value.trim());
    if (!provider.servers && !manual) setServers(null);
  };

  const showManualSettings = async () => {
    if (!servers) {
      setPhase('discovering');
      const discovered = isEmail(email) ? await mailCore().discover(email).catch(() => null) : null;
      setServers(discovered ?? emptyServers(email));
      setPhase('idle');
    }
    setManual(true);
  };

  const submit = async () => {
    setError(null);
    try {
      let configuration = servers;
      if (!configuration) {
        setPhase('discovering');
        configuration = await mailCore().discover(email);
        setServers(configuration);
      }
      setPhase('connecting');
      const account = await mailCore().addAccount(
        {
          email,
          displayName: displayName.trim() || email,
          username: configuration.username || email,
          imap: configuration.imap,
          smtp: configuration.smtp,
        },
        password,
      );
      await saveSecret(account.id, password);
      queryClient.setQueryData(queryKeys.accounts, await mailCore().listAccounts());
      onDone(account);
    } catch (failure) {
      setError(describeCoreError(failure, t));
      if (!CoreError.Auth.instanceOf(failure)) {
        setServers((current) => current ?? emptyServers(email));
        setManual(true);
      }
    } finally {
      setPhase('idle');
    }
  };

  return {
    email,
    password,
    displayName,
    servers,
    manual,
    phase,
    error,
    busy: phase !== 'idle',
    canSubmit: isEmail(email) && password.length > 0 && phase === 'idle' && (!manual || servers !== null),
    setEmail: updateEmail,
    setPassword,
    setDisplayName,
    setServers,
    showManualSettings,
    submit,
  };
}
