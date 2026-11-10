import { PROVIDERS } from '@/features/accounts/providers';
import { sha256Hex } from '@/utils/sha256';

const GRAVATAR_SIZE = 128;

const PERSONAL_DOMAINS = new Set([
  ...PROVIDERS.flatMap((provider) => provider.domains),
  'aol.fr',
  'bbox.fr',
  'club-internet.fr',
  'fastmail.com',
  'free.fr',
  'hey.com',
  'laposte.net',
  'mail.com',
  'mail.ru',
  'neuf.fr',
  'numericable.fr',
  'orange.fr',
  'pm.me',
  'proton.me',
  'protonmail.com',
  'sfr.fr',
  'tuta.io',
  'tutanota.com',
  'wanadoo.fr',
  'web.de',
  'yandex.com',
  'yandex.ru',
  'zohomail.com',
]);

const PERSONAL_BRANDS = new Set(['aol', 'gmail', 'gmx', 'hotmail', 'icloud', 'live', 'msn', 'outlook', 'yahoo']);

const SECOND_LEVELS = new Set(['ac', 'co', 'com', 'edu', 'gouv', 'gov', 'ne', 'net', 'or', 'org']);

export function organizationDomain(domain: string): string {
  const labels = domain.split('.');
  const keep = labels.length > 2 && labels.at(-1)!.length === 2 && SECOND_LEVELS.has(labels.at(-2)!) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

export function isPersonalMailDomain(domain: string): boolean {
  const organization = organizationDomain(domain);
  return PERSONAL_DOMAINS.has(organization) || PERSONAL_BRANDS.has(organization.split('.')[0]);
}

export function avatarSources(email: string): string[] {
  const address = email.trim().toLowerCase();
  const domain = address.split('@')[1];
  if (!domain || !domain.includes('.')) return [];
  const sources = [`https://gravatar.com/avatar/${sha256Hex(address)}?s=${GRAVATAR_SIZE}&d=404`];
  if (!isPersonalMailDomain(domain)) {
    const website = organizationDomain(domain);
    sources.push(`https://${website}/apple-touch-icon.png`, `https://${website}/favicon.ico`);
  }
  return sources;
}
