import { Platform } from 'react-native';
import { Security, type ServerConfig } from '@openmailbox/mail-core';

import { organizationDomain } from '@/utils/addresses';

export type ProviderIdentifier = 'gmail' | 'icloud' | 'ovhcloud' | 'ionos' | 'yahoo' | 'other' | 'local';

export interface BrandMark {
  background: string;
  shapes?: { d: string; fill: string }[];
  viewBox?: string;
  gradient?: [string, string];
  scale?: number;
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

const WHITE = '#ffffff';

const OVH_BRAND: BrandMark = {
  background: WHITE,
  shapes: [
    {
      fill: '#123F6D',
      d: 'M19.881 10.095l2.563-4.45C23.434 7.389 24 9.404 24 11.555c0 2.88-1.017 5.523-2.71 7.594h-6.62l2.04-3.541h-2.696l3.176-5.513h2.691zm-2.32-5.243L9.333 19.14l.003.009H2.709C1.014 17.077 0 14.435 0 11.555c0-2.152.57-4.17 1.561-5.918L5.855 13.1 10.6 4.852h6.961z',
    },
  ],
  scale: 0.66,
};

export const PROVIDERS: MailProvider[] = [
  {
    identifier: 'gmail',
    name: 'Google',
    domains: ['gmail.com', 'googlemail.com'],
    // Google's own "G", in its four colors.
    brand: {
      background: WHITE,
      viewBox: '0 0 48 48',
      scale: 0.6,
      shapes: [
        { fill: '#EA4335', d: 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z' },
        { fill: '#4285F4', d: 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z' },
        { fill: '#FBBC05', d: 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z' },
        { fill: '#34A853', d: 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z' },
      ],
    },
    appPasswordHelp: 'https://support.google.com/accounts/answer/185833',
    servers: servers('imap.gmail.com', 'smtp.gmail.com'),
  },
  {
    identifier: 'icloud',
    name: 'iCloud',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    brand: {
      background: WHITE,
      gradient: ['#4FC1FB', '#1A73F0'],
      scale: 0.72,
      shapes: [
        {
          fill: '#3693F3',
          d: 'M13.762 4.29a6.51 6.51 0 0 0-5.669 3.332 3.571 3.571 0 0 0-1.558-.36 3.571 3.571 0 0 0-3.516 3A4.918 4.918 0 0 0 0 14.796a4.918 4.918 0 0 0 4.92 4.914 4.93 4.93 0 0 0 .617-.045h14.42c2.305-.272 4.041-2.258 4.043-4.589v-.009a4.594 4.594 0 0 0-3.727-4.508 6.51 6.51 0 0 0-6.511-6.27z',
        },
      ],
    },
    appPasswordHelp: 'https://support.apple.com/102654',
    servers: servers('imap.mail.me.com', 'smtp.mail.me.com', 587),
  },
  { identifier: 'ovhcloud', name: 'OVHcloud', domains: [], brand: OVH_BRAND },
  {
    identifier: 'ionos',
    name: 'IONOS',
    domains: [],
    // The certified logo IONOS publishes in its BIMI record (vmc.digicert.com).
    brand: {
      background: WHITE,
      viewBox: '0 0 400 400',
      scale: 1,
      shapes: [
        {
          fill: '#003D8F',
          d: 'M60.3,240.6c-4,0-7.2-3.2-7.2-7.3v-72.9l0-0.2c0-4,3.2-7.1,7.3-7.1c3.3,0,6.1,2.1,6.9,5.3 c0,0.1,0.1,0.3,0.1,0.5l0.1,0.3c0.1,0.4,0.1,0.8,0.1,1.1c0,0,0,72,0,72.8C67.5,237.4,64.3,240.6,60.3,240.6 M330.4,240.6c-1.5,0-3-0.2-4.4-0.4c-6.3-1.3-11.8-5.2-15.1-10.8l-0.1-0.2c-1.6-3.3-0.6-7.1,2.5-9 c1-0.6,2.2-0.9,3.4-0.9c2.4,0,4.6,1.3,5.8,3.4c0.1,0.1,0.1,0.2,0.2,0.4l0.7,1l0.9,1c1.2,1,2.7,1.8,4.3,2.1c2.6,0.5,5.4-0.1,7.4-1.7 c2.2-1.6,3.5-4,3.7-6.7c0.2-2.7-0.8-5.4-2.6-7.2c0,0-20-20.8-20.9-21.7c-0.5-0.5-1.4-1.5-2.4-2.9c-2.8-4-3.7-8.7-3.3-13.4 c0.2-3.2,1.2-6.4,2.8-9.3c0,0,0.9-1.6,1.2-1.9c1.1-1.6,3.1-3.5,4.6-4.7c1.4-1.1,3.2-2,3.8-2.3c3.9-1.9,9-2.8,13.9-1.8 c6.2,1.3,11.5,5.2,14.6,10.6c0.9,1.5,1.1,3.3,0.7,5c-0.5,1.7-1.6,3.2-3.2,4.1c-1,0.6-2.1,0.9-3.2,0.9c-2.4,0-4.7-1.3-5.8-3.4 c-1.3-2.1-3.3-3.6-5.8-4.1c-2.4-0.5-5.1,0.1-7.1,1.6c-1.9,1.5-3.1,3.7-3.3,6.2c-0.2,2.5,0.7,4.9,2.4,6.8l20.4,21.1 c4.5,4.6,6.8,10.9,6.4,17.4c-0.6,6.6-3.8,12.5-9,16.3C340.2,239,335.3,240.6,330.4,240.6 M265.7,240.6c-12.1,0-22-9.9-22-22v-43.5c0-12.1,9.9-22,22-22c12.1,0,22,9.9,22,22v43.5 C287.7,230.8,277.9,240.6,265.7,240.6 M265.7,166.4c-4.8,0-8.7,3.9-8.7,8.7v43.5c0,4.9,3.8,8.7,8.7,8.7c4.8,0,8.7-3.9,8.7-8.7 v-43.5C274.5,170.4,270.5,166.4,265.7,166.4 M180.2,198v36c0,3.7-2.9,6.6-6.6,6.6s-6.6-2.9-6.6-6.6v-63.5L180.2,198z M216.3,223.3v-63.6 c0-3.7-2.9-6.6-6.6-6.6c-3.7,0-6.6,2.9-6.6,6.6v36L216.3,223.3z M179.7,156.9c0,0,0-0.1-0.1-0.1c-1.1-2.2-3.5-3.6-6-3.6 c-0.5,0-0.9,0-1.3,0.1c-3.1,0.6-5.2,3.3-5.2,6.5v1.5l36.5,75.7c1.2,2.2,3.5,3.6,5.9,3.6c0.5,0,1.1-0.1,1.5-0.2 c3-0.7,5.2-3.3,5.2-6.4v-1.4C216.2,232.5,180.7,158.9,179.7,156.9 M117.3,240.6c-5.9,0-11.4-2.3-15.5-6.4c-4.2-4.2-6.4-9.7-6.4-15.5v-43.5c0-5.9,2.3-11.4,6.4-15.5 c4.2-4.2,9.7-6.4,15.5-6.4c5.9,0,11.4,2.3,15.5,6.4c4.2,4.2,6.4,9.7,6.4,15.5v43.5c0,5.9-2.3,11.4-6.4,15.5 C128.7,238.3,123.1,240.6,117.3,240.6 M117.3,166.4c-2.3,0-4.5,0.9-6.2,2.6c-1.6,1.6-2.6,3.8-2.6,6.1v43.5c0,2.4,0.9,4.6,2.5,6.2 c1.6,1.6,3.8,2.5,6.2,2.5c2.3,0,4.5-0.9,6.2-2.6c1.6-1.6,2.6-3.8,2.6-6.2v-43.5c0-2.3-0.9-4.4-2.6-6.1 C121.7,167.3,119.6,166.4,117.3,166.4',
        },
      ],
    },
    servers: servers('imap.ionos.fr', 'smtp.ionos.fr'),
  },
  {
    identifier: 'yahoo',
    name: 'Yahoo',
    domains: ['yahoo.com', 'yahoo.fr', 'ymail.com'],
    brand: {
      background: '#6001D2',
      scale: 0.62,
      shapes: [
        {
          fill: WHITE,
          d: 'M18.86 1.56L14.27 11.87H19.4L24 1.56H18.86M0 6.71L5.15 18.27L3.3 22.44H7.83L14.69 6.71H10.19L7.39 13.44L4.62 6.71H0M15.62 12.87C13.95 12.87 12.71 14.12 12.71 15.58C12.71 17.04 13.95 18.27 15.62 18.27C17.26 18.27 18.5 17.04 18.5 15.58C18.5 14.12 17.26 12.87 15.62 12.87Z',
        },
      ],
    },
    appPasswordHelp: 'https://help.yahoo.com/kb/SLN15241.html',
    servers: servers('imap.mail.yahoo.com', 'smtp.mail.yahoo.com'),
  },
  { identifier: 'other', name: '', domains: [] },
];

export interface OvhOffer {
  identifier: 'mxplan' | 'emailpro' | 'exchange' | 'zimbra';
  name: string;
  servers: ServerConfig;
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

const serverKind = (host: string) => host.split('.')[0].replace(/\d+$/, '');
const brandName = (host: string) => organizationDomain(host).split('.')[0];

export function providerForAccount(account: { imap: { host: string } }): { provider: MailProvider; offer?: string } | undefined {
  const host = account.imap.host.trim().toLowerCase();
  if (host === LOCAL_TEST_PROVIDER.servers?.imap.host) return { provider: LOCAL_TEST_PROVIDER };
  const ovh = OVH_OFFERS.find((offer) => brandName(offer.servers.imap.host) === brandName(host));
  if (ovh) {
    const offer = OVH_OFFERS.find((candidate) => serverKind(candidate.servers.imap.host) === serverKind(host));
    return { provider: ovhProvider(offer ?? ovh), offer: offer?.name };
  }
  const provider = PROVIDERS.find((candidate) => candidate.servers && brandName(candidate.servers.imap.host) === brandName(host));
  return provider ? { provider } : undefined;
}

export function providerName(account: { imap: { host: string } }): string {
  const known = providerForAccount(account);
  if (!known) return organizationDomain(account.imap.host.trim().toLowerCase());
  return known.offer ? `${known.provider.name} ${known.offer}` : known.provider.name;
}
