import * as Contacts from 'expo-contacts';

import type { MailAddress } from '@/utils/addresses';

export async function contactAddresses(query: string): Promise<MailAddress[]> {
  const permission = await Contacts.getPermissionsAsync();
  if (!permission.granted) return [];
  const { data } = await Contacts.getContactsAsync({ name: query, fields: [Contacts.Fields.Emails, Contacts.Fields.Name] });
  return data.flatMap((contact) =>
    (contact.emails ?? []).flatMap((entry) => (entry.email ? [{ name: contact.name || undefined, email: entry.email }] : [])),
  );
}

export async function pickContactAddress(): Promise<MailAddress | null> {
  const permission = await Contacts.requestPermissionsAsync();
  if (!permission.granted) return null;
  const contact = await Contacts.presentContactPickerAsync();
  const email = contact?.emails?.find((entry) => entry.email)?.email;
  return email ? { name: contact?.name || undefined, email } : null;
}
