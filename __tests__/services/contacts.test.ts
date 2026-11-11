import { Platform } from 'react-native';
import * as Contacts from 'expo-contacts/legacy';

import { pickContactAddress, showContactCard } from '@/services/contacts';

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

describe('showContactCard', () => {
  const address = { name: 'Forum Rust FR', email: 'notifications@forum.example' };

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('asks for the contacts first on Android, whose form is refused without them', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    (Contacts.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
    await showContactCard(address);
    expect(Contacts.presentFormAsync).not.toHaveBeenCalled();

    (Contacts.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: true });
    await showContactCard(address);
    expect(Contacts.presentFormAsync).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ name: 'Forum Rust FR', emails: [{ email: 'notifications@forum.example', label: 'email' }] }),
    );
  });

  it('shows the form at once on iOS, which needs no permission for it', async () => {
    await showContactCard(address);
    expect(Contacts.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Contacts.presentFormAsync).toHaveBeenCalled();
  });
});
