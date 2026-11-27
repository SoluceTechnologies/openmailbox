import * as Contacts from 'expo-contacts/legacy';

interface Property {
  name: string;
  types: string[];
  value: string;
}

const LABELS: Record<string, string> = { home: 'home', work: 'work', cell: 'mobile', mobile: 'mobile', main: 'main' };

function decodeQuotedPrintable(value: string): string {
  try {
    return decodeURIComponent(value.replace(/%/g, '%25').replace(/=([0-9A-F]{2})/gi, '%$1'));
  } catch {
    return value.replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  }
}

function properties(text: string): Property[] | null {
  const card = /BEGIN:VCARD([\s\S]*?)END:VCARD/i.exec(text);
  if (!card) return null;
  return card[1]
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/)
    .flatMap((line) => {
      const colon = line.indexOf(':');
      if (colon < 0) return [];
      const [head, ...params] = line.slice(0, colon).split(';');
      const types = params.flatMap((param) => {
        const [key, value] = param.includes('=') ? param.split('=') : ['TYPE', param];
        return key.toUpperCase() === 'TYPE' ? value.replace(/"/g, '').toLowerCase().split(',') : [];
      });
      const value = line.slice(colon + 1);
      const quotedPrintable = params.some((param) => /QUOTED-PRINTABLE/i.test(param));
      return [{ name: head.slice(head.lastIndexOf('.') + 1).toUpperCase(), types, value: quotedPrintable ? decodeQuotedPrintable(value) : value }];
    });
}

function unescapeText(value: string): string {
  return value.replace(/\\(.)/g, (_, character: string) => (character.toLowerCase() === 'n' ? '\n' : character));
}

function components(value: string): string[] {
  const parts = [''];
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '\\') parts[parts.length - 1] += value[index] + (value[++index] ?? '');
    else if (value[index] === ';') parts.push('');
    else parts[parts.length - 1] += value[index];
  }
  return parts.map((part) => unescapeText(part).trim());
}

function label(property: Property): string {
  return property.types.map((type) => LABELS[type]).find(Boolean) ?? 'other';
}

function nonEmpty<T>(items: T[]): T[] | undefined {
  return items.length > 0 ? items : undefined;
}

export function contactFromVCard(text: string): Contacts.Contact | null {
  const all = properties(text);
  if (!all) return null;
  const named = (name: string) => all.filter((property) => property.name === name);
  const value = (name: string) => unescapeText(named(name)[0]?.value ?? '').trim() || undefined;
  const [lastName, firstName, middleName, namePrefix, nameSuffix] = components(named('N')[0]?.value ?? '');
  const [company, department] = components(named('ORG')[0]?.value ?? '');
  const name = value('FN') ?? [firstName, middleName, lastName].filter(Boolean).join(' ');
  const emails = named('EMAIL').map((property) => ({ email: property.value.trim(), label: label(property) }));
  const phoneNumbers = named('TEL').map((property) => ({ number: property.value.replace(/^tel:/i, '').trim(), label: label(property) }));
  if (!name && emails.length === 0 && phoneNumbers.length === 0) return null;

  return {
    contactType: Contacts.ContactTypes.Person,
    name,
    lastName: lastName || undefined,
    firstName: firstName || undefined,
    middleName: middleName || undefined,
    namePrefix: namePrefix || undefined,
    nameSuffix: nameSuffix || undefined,
    company: company || undefined,
    department: department || undefined,
    jobTitle: value('TITLE'),
    emails: nonEmpty(emails),
    phoneNumbers: nonEmpty(phoneNumbers),
    addresses: nonEmpty(
      named('ADR').map((property) => {
        const [, , street, city, region, postalCode, country] = components(property.value);
        return {
          street: street || undefined,
          city: city || undefined,
          region: region || undefined,
          postalCode: postalCode || undefined,
          country: country || undefined,
          label: label(property),
        };
      }),
    ),
    urlAddresses: nonEmpty(named('URL').map((property) => ({ url: unescapeText(property.value).trim(), label: label(property) }))),
    note: value('NOTE'),
  };
}

export async function presentVCard(text: string): Promise<boolean> {
  const contact = contactFromVCard(text);
  if (!contact) return false;
  await Contacts.presentFormAsync(null, contact);
  return true;
}
