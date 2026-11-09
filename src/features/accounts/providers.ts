import { Platform } from 'react-native';
import { Security, type ServerConfig } from '@openmailbox/mail-core';

export type ProviderIdentifier = 'gmail' | 'icloud' | 'ovhcloud' | 'orange' | 'free' | 'sfr' | 'laposte' | 'yahoo' | 'other' | 'local';

/** A brand mark from Simple Icons (CC0) drawn on a 24×24 grid, or a monogram when Simple Icons has none. */
export interface BrandMark {
  color: string;
  path?: string;
  monogram?: string;
  monogramColor?: string;
}

export interface MailProvider {
  identifier: ProviderIdentifier;
  name: string;
  domains: string[];
  brand?: BrandMark;
  appPasswordHelp?: string;
  servers?: ServerConfig;
  editableServers?: boolean;
  account?: { email: string; password: string };
}

function servers(imap: string, smtp: string, smtpPort = 465): ServerConfig {
  return {
    imap: { host: imap, port: 993, security: Security.Tls },
    smtp: { host: smtp, port: smtpPort, security: smtpPort === 587 ? Security.StartTls : Security.Tls },
    username: '',
  };
}

const OVH_BRAND: BrandMark = {
  color: '#123F6D',
  path: 'M19.881 10.095l2.563-4.45C23.434 7.389 24 9.404 24 11.555c0 2.88-1.017 5.523-2.71 7.594h-6.62l2.04-3.541h-2.696l3.176-5.513h2.691zm-2.32-5.243L9.333 19.14l.003.009H2.709C1.014 17.077 0 14.435 0 11.555c0-2.152.57-4.17 1.561-5.918L5.855 13.1 10.6 4.852h6.961z',
};

export const PROVIDERS: MailProvider[] = [
  {
    identifier: 'gmail',
    name: 'Google',
    domains: ['gmail.com', 'googlemail.com'],
    brand: {
      color: '#4285F4',
      path: 'M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z',
    },
    appPasswordHelp: 'https://support.google.com/accounts/answer/185833',
    servers: servers('imap.gmail.com', 'smtp.gmail.com'),
  },
  {
    identifier: 'icloud',
    name: 'iCloud',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    brand: {
      color: '#3693F3',
      path: 'M13.762 4.29a6.51 6.51 0 0 0-5.669 3.332 3.571 3.571 0 0 0-1.558-.36 3.571 3.571 0 0 0-3.516 3A4.918 4.918 0 0 0 0 14.796a4.918 4.918 0 0 0 4.92 4.914 4.93 4.93 0 0 0 .617-.045h14.42c2.305-.272 4.041-2.258 4.043-4.589v-.009a4.594 4.594 0 0 0-3.727-4.508 6.51 6.51 0 0 0-6.511-6.27z',
    },
    appPasswordHelp: 'https://support.apple.com/102654',
    servers: servers('imap.mail.me.com', 'smtp.mail.me.com', 587),
  },
  { identifier: 'ovhcloud', name: 'OVHcloud', domains: [], brand: OVH_BRAND },
  {
    identifier: 'orange',
    name: 'Orange',
    domains: ['orange.fr', 'wanadoo.fr'],
    brand: { color: '#FF7900', path: 'M0 0h24v24H0V0Zm3.43 20.572h17.143v-3.429H3.43v3.429Z' },
    servers: servers('imap.orange.fr', 'smtp.orange.fr'),
  },
  {
    identifier: 'free',
    name: 'Free',
    domains: ['free.fr'],
    brand: { color: '#CD1E25', monogram: 'free' },
    servers: servers('imap.free.fr', 'smtp.free.fr'),
  },
  {
    identifier: 'sfr',
    name: 'SFR',
    domains: ['sfr.fr', 'neuf.fr'],
    brand: { color: '#E2001A', monogram: 'SFR' },
    servers: servers('imap.sfr.fr', 'smtp-auth.sfr.fr'),
  },
  {
    identifier: 'laposte',
    name: 'La Poste',
    domains: ['laposte.net'],
    brand: { color: '#FFC917', monogram: 'LP', monogramColor: '#003DA5' },
    servers: servers('imap.laposte.net', 'smtp.laposte.net'),
  },
  {
    identifier: 'yahoo',
    name: 'Yahoo',
    domains: ['yahoo.com', 'yahoo.fr', 'ymail.com'],
    brand: { color: '#6001D2', monogram: 'Y!' },
    appPasswordHelp: 'https://help.yahoo.com/kb/SLN15241.html',
    servers: servers('imap.mail.yahoo.com', 'smtp.mail.yahoo.com'),
  },
  { identifier: 'other', name: '', domains: [] },
];

export interface OvhOffer {
  identifier: 'mxplan' | 'emailpro' | 'exchange' | 'zimbra';
  name: string;
  servers: ServerConfig;
  /** The server name differs from one customer to another and must be checked against the control panel. */
  editableHost: boolean;
}

export const OVH_OFFERS: OvhOffer[] = [
  { identifier: 'mxplan', name: 'MX Plan', servers: servers('ssl0.ovh.net', 'ssl0.ovh.net'), editableHost: false },
  {
    identifier: 'emailpro',
    name: 'Email Pro',
    servers: servers('pro1.mail.ovh.net', 'pro1.mail.ovh.net', 587),
    editableHost: true,
  },
  {
    identifier: 'exchange',
    name: 'Hosted Exchange',
    servers: servers('ex5.mail.ovh.net', 'ex5.mail.ovh.net', 587),
    editableHost: true,
  },
  {
    identifier: 'zimbra',
    name: 'Zimbra',
    servers: servers('zimbra1.mail.ovh.net', 'zimbra1.mail.ovh.net', 587),
    editableHost: true,
  },
];

export function ovhProvider(offer: OvhOffer): MailProvider {
  return {
    identifier: 'ovhcloud',
    name: 'OVHcloud',
    domains: [],
    brand: OVH_BRAND,
    servers: offer.servers,
    editableServers: offer.editableHost,
  };
}

const LOCAL_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

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
