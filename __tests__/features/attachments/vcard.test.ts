import * as Contacts from 'expo-contacts/legacy';

import { contactFromVCard, presentVCard } from '@/features/attachments/vcard';

const VCARD_4 = [
  'BEGIN:VCARD',
  'VERSION:4.0',
  'FN:Claire Dubois',
  'N:Dubois;Claire;Marie;Dr.;',
  'ORG:Atlas Conseil;Achats',
  'TITLE:Responsable\\, achats',
  'EMAIL;TYPE=work:claire@atlas.example',
  'item1.EMAIL;TYPE=INTERNET,HOME:claire.d@home.example',
  'TEL;TYPE="cell,voice";VALUE=uri:tel:+33-6-12-34-56-78',
  'TEL;TYPE=work:+33 1 23 45 67 89',
  'ADR;TYPE=work:;;12 rue de la Paix;Paris;;75002;France',
  'URL:https://atlas.example',
  'NOTE:Met at the trade fair.\\nCall back in March;',
  '  thanks.',
  'END:VCARD',
  'BEGIN:VCARD',
  'FN:Someone Else',
  'END:VCARD',
].join('\r\n');

const OUTLOOK_2_1 = [
  'BEGIN:VCARD',
  'VERSION:2.1',
  'N;LANGUAGE=fr;CHARSET=utf-8;ENCODING=QUOTED-PRINTABLE:L=C3=A9vesque;H=C3=A9l=C3=A8ne',
  'FN;CHARSET=utf-8;ENCODING=QUOTED-PRINTABLE:H=C3=A9l=C3=A8ne L=C3=A9vesque',
  'TEL;CELL;VOICE:06 98 76 54 32',
  'EMAIL;PREF;INTERNET:helene@example.fr',
  'NOTE;ENCODING=QUOTED-PRINTABLE:Caf=E9',
  'END:VCARD',
].join('\n');

describe('contactFromVCard', () => {
  it('reads the first card of a vCard file', () => {
    expect(contactFromVCard(VCARD_4)).toEqual({
      contactType: 'person',
      name: 'Claire Dubois',
      lastName: 'Dubois',
      firstName: 'Claire',
      middleName: 'Marie',
      namePrefix: 'Dr.',
      company: 'Atlas Conseil',
      department: 'Achats',
      jobTitle: 'Responsable, achats',
      emails: [
        { email: 'claire@atlas.example', label: 'work' },
        { email: 'claire.d@home.example', label: 'home' },
      ],
      phoneNumbers: [
        { number: '+33-6-12-34-56-78', label: 'mobile' },
        { number: '+33 1 23 45 67 89', label: 'work' },
      ],
      addresses: [{ street: '12 rue de la Paix', city: 'Paris', postalCode: '75002', country: 'France', label: 'work' }],
      urlAddresses: [{ url: 'https://atlas.example', label: 'other' }],
      note: 'Met at the trade fair.\nCall back in March; thanks.',
    });
  });

  it('reads an Outlook card with quoted-printable accents', () => {
    expect(contactFromVCard(OUTLOOK_2_1)).toEqual(
      expect.objectContaining({
        name: 'Hélène Lévesque',
        emails: [{ email: 'helene@example.fr', label: 'other' }],
        phoneNumbers: [{ number: '06 98 76 54 32', label: 'mobile' }],
        note: 'Café',
      }),
    );
  });

  it('builds the name from its parts when the card has none', () => {
    expect(contactFromVCard('BEGIN:VCARD\nN:Martin;Paul;;;\nEND:VCARD')).toEqual(expect.objectContaining({ name: 'Paul Martin' }));
  });

  it('finds nothing in a file without a card', () => {
    expect(contactFromVCard('hello')).toBeNull();
    expect(contactFromVCard('BEGIN:VCARD\nVERSION:3.0\nEND:VCARD')).toBeNull();
  });
});

describe('presentVCard', () => {
  it('opens the new contact form with the card', async () => {
    expect(await presentVCard(VCARD_4)).toBe(true);
    expect(Contacts.presentFormAsync).toHaveBeenCalledWith(null, expect.objectContaining({ name: 'Claire Dubois' }));
  });

  it('does nothing with an empty card', async () => {
    jest.mocked(Contacts.presentFormAsync).mockClear();
    expect(await presentVCard('BEGIN:VCARD\nEND:VCARD')).toBe(false);
    expect(Contacts.presentFormAsync).not.toHaveBeenCalled();
  });
});
