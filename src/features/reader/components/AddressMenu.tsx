import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Contacts from 'expo-contacts/legacy';
import { Button, Host, Menu, Section } from '@expo/ui/swift-ui';

import { Typography } from '@/ui/components';
import { NATIVE_CHROME } from '@/ui/nativeChrome';
import { displayName, formatAddress, type MailAddress } from '@/utils/addresses';

export function AddressMenu({ address }: { address: MailAddress }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();

  if (!NATIVE_CHROME) {
    return (
      <Typography selectable style={{ color: colors.primary, fontSize: 15 }}>
        {formatAddress(address)}
      </Typography>
    );
  }

  const showContactCard = () =>
    Contacts.presentFormAsync(null, {
      contactType: Contacts.ContactTypes.Person,
      name: displayName(address),
      firstName: address.name ?? '',
      emails: [{ email: address.email, label: 'email' }],
    }).catch(() => undefined);

  return (
    <Host matchContents>
      <Menu label={displayName(address)}>
        <Section title={address.email}>
          <Button
            systemImage="square.and.pencil"
            label={t('compose.newMessage')}
            onPress={() => router.push({ pathname: '/compose', params: { to: address.email } })}
          />
          <Button systemImage="person.crop.circle" label={t('reader.contactCard')} onPress={showContactCard} />
        </Section>
      </Menu>
    </Host>
  );
}
