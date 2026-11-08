import { Platform } from 'react-native';
import { Security, type ServerConfig } from '@openmailbox/mail-core';

export type ProviderIdentifier = 'icloud' | 'gmail' | 'yahoo' | 'fastmail' | 'other' | 'local';

export interface MailProvider {
  identifier: ProviderIdentifier;
  name: string;
  domains: string[];
  color?: string;
  appPasswordHelp?: string;
  servers?: ServerConfig;
  account?: { email: string; password: string };
}

const LOCAL_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const PROVIDERS: MailProvider[] = [
  { identifier: 'icloud', name: 'iCloud', color: '#3693f3', domains: ['icloud.com', 'me.com', 'mac.com'], appPasswordHelp: 'https://support.apple.com/102654' },
  { identifier: 'gmail', name: 'Google', color: '#ea4335', domains: ['gmail.com', 'googlemail.com'], appPasswordHelp: 'https://support.google.com/accounts/answer/185833' },
  { identifier: 'yahoo', name: 'Yahoo', color: '#6001d2', domains: ['yahoo.com', 'yahoo.fr', 'ymail.com'], appPasswordHelp: 'https://help.yahoo.com/kb/SLN15241.html' },
  { identifier: 'fastmail', name: 'Fastmail', color: '#0067b9', domains: ['fastmail.com', 'fastmail.fm'], appPasswordHelp: 'https://www.fastmail.help/hc/en-us/articles/360058752854' },
  { identifier: 'other', name: '', domains: [] },
];

export const LOCAL_TEST_PROVIDER: MailProvider = {
  identifier: 'local',
  name: 'GreenMail',
  domains: ['example.com'],
  account: { email: 'alice@example.com', password: 'secret' },
  servers: {
    imap: { host: LOCAL_HOST, port: 3993, security: Security.Tls },
    smtp: { host: LOCAL_HOST, port: 3465, security: Security.Tls },
    username: 'alice@example.com',
  },
};

export function providerForAddress(email: string): MailProvider | undefined {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? PROVIDERS.find((provider) => provider.domains.includes(domain)) : undefined;
}
