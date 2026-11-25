import { StyleSheet, View } from 'react-native';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Search, SquarePen, UserRound } from 'lucide-react-native';
import { Button, Host, Menu, Section } from '@expo/ui/swift-ui';

import { showContactCard as presentContactCard } from '@/services/contacts';
import { Select, Typography } from '@/ui/components';
import { NATIVE_CHROME } from '@/ui/nativeChrome';
import { displayName, formatAddress, type MailAddress } from '@/utils/addresses';

type AddressAction = 'compose' | 'search' | 'contact';

export function AddressMenu({ address }: { address: MailAddress }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();

  const newMessage = () => router.push({ pathname: '/compose', params: { to: address.email } });
  const name = displayName(address);
  const searchMessages = () => router.push({ pathname: '/search', params: { query: name } });
  const showContactCard = () => presentContactCard(address).catch(() => undefined);
  const searchLabel = t('reader.searchFor', { name });

  if (!NATIVE_CHROME) {
    const icon = (Icon: typeof SquarePen) => (size: number) => (
      <View style={[styles.icon, { width: size }]}>
        <Icon size={20} color={colors.text} />
      </View>
    );
    return (
      <Select<AddressAction | null>
        value={null}
        variant="icon"
        accessibilityLabel={formatAddress(address)}
        trigger={<Typography style={[styles.name, { color: colors.primary }]}>{name}</Typography>}
        header={
          <Typography variant="caption" color="secondary" numberOfLines={1}>
            {address.email}
          </Typography>
        }
        options={[
          { value: 'compose', label: t('compose.newMessage'), leading: icon(SquarePen) },
          { value: 'search', label: searchLabel, leading: icon(Search) },
          { value: 'contact', label: t('reader.contactCard'), leading: icon(UserRound) },
        ]}
        onChange={(action) => {
          if (action === 'compose') newMessage();
          else if (action === 'search') searchMessages();
          else if (action === 'contact') showContactCard();
        }}
      />
    );
  }

  return (
    <Host matchContents>
      <Menu label={name}>
        <Section title={address.email}>
          <Button systemImage="square.and.pencil" label={t('compose.newMessage')} onPress={newMessage} />
          <Button systemImage="magnifyingglass" label={searchLabel} onPress={searchMessages} />
          <Button systemImage="person.crop.circle" label={t('reader.contactCard')} onPress={showContactCard} />
        </Section>
      </Menu>
    </Host>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 15 },
  icon: { alignItems: 'center' },
});
