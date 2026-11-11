export type MailAddress = { name?: string; email: string };

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

const SECOND_LEVELS = new Set(['ac', 'co', 'com', 'edu', 'gouv', 'gov', 'ne', 'net', 'or', 'org']);

export function organizationDomain(domain: string): string {
  const labels = domain.split('.');
  const keep = labels.length > 2 && labels.at(-1)!.length === 2 && SECOND_LEVELS.has(labels.at(-2)!) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

export function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function displayName(address: MailAddress | undefined): string {
  if (!address) return '';
  return address.name?.trim() || address.email;
}

export function formatAddress(address: MailAddress): string {
  return address.name ? `${address.name} <${address.email}>` : address.email;
}

export function formatAddressList(addresses: MailAddress[]): string {
  return addresses.map(formatAddress).join(', ');
}

export function parseAddressList(input: string): { addresses: MailAddress[]; invalid: string[] } {
  const addresses: MailAddress[] = [];
  const invalid: string[] = [];
  for (const part of input.split(/[,;\n]/)) {
    const value = part.trim();
    if (!value) continue;
    const bracketed = value.match(/^(.*)<([^>]+)>$/);
    const email = (bracketed ? bracketed[2] : value).trim();
    const name = bracketed ? bracketed[1].trim().replace(/^"|"$/g, '') : undefined;
    if (isEmail(email)) addresses.push({ name: name || undefined, email });
    else invalid.push(value);
  }
  return { addresses, invalid };
}

export function withoutAddresses(addresses: MailAddress[], excluded: string[]): MailAddress[] {
  const lowered = excluded.map((email) => email.toLowerCase());
  const seen = new Set<string>();
  return addresses.filter((address) => {
    const key = address.email.toLowerCase();
    if (lowered.includes(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
