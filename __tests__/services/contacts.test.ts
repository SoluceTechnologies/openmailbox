import * as Contacts from 'expo-contacts/legacy';

import { pickContactAddress } from '@/services/contacts';

describe('pickContactAddress', () => {
  beforeEach(() => (Contacts.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true }));

  it('names the picked contact from its first and last name when the picker gives no full name', async () => {
    (Contacts.presentContactPickerAsync as jest.Mock).mockResolvedValue({
      firstName: 'John',
      lastName: 'Appleseed',
      emails: [{ email: 'John-Appleseed@mac.com' }],
    });

    await expect(pickContactAddress()).resolves.toEqual({ name: 'John Appleseed', email: 'John-Appleseed@mac.com' });
  });
});
