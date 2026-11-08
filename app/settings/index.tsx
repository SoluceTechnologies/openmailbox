import { StyleSheet, View } from 'react-native';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ImageOff, Info, Palette, Plus, TriangleAlert } from 'lucide-react-native';

import { useAccounts } from '@/core/hooks';
import { SettingsLink } from '@/features/settings/components/SettingsLink';
import { SettingsPage } from '@/features/settings/components/SettingsPage';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSyncStore } from '@/stores/syncStore';
import { accountColor } from '@/theme';
import { Avatar, Icon, Item, List, SectionHeader, Toggle, Typography } from '@/ui/components';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const accounts = useAccounts();
  const authRequired = useSyncStore((state) => state.authRequired);
  const loadRemoteImages = useSettingsStore((state) => state.loadRemoteImages);
  const setLoadRemoteImages = useSettingsStore((state) => state.setLoadRemoteImages);

  return (
    <SettingsPage title={t('settings.title')}>
      <View style={styles.section}>
        <SectionHeader title={t('settings.accounts')} />
        <List>
          {accounts.map((account) => (
            <Item
              key={account.id}
              onPress={() => router.push(`/settings/account/${account.id}`)}
              leading={<Avatar name={account.displayName} size={40} color={accountColor(account.color)} />}
              title={
                <Typography numberOfLines={1} ellipsizeMode="tail">
                  {account.displayName}
                </Typography>
              }
              description={
                <Typography variant="caption" color="secondary" numberOfLines={1} ellipsizeMode="middle">
                  {account.email}
                </Typography>
              }
              trailing={
                <View style={styles.trailing}>
                  {authRequired[account.id] ? <TriangleAlert size={18} color={colors.warning} /> : null}
                  <ChevronRight size={20} color={colors.textTertiary} />
                </View>
              }
            />
          ))}
          <SettingsLink title={t('accounts.add')} icon={<Plus />} onPress={() => router.push('/accounts/add')} />
        </List>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('settings.general')} />
        <List>
          <SettingsLink title={t('settings.appearance')} icon={<Palette />} onPress={() => router.push('/settings/appearance')} />
          <Item
            leading={
              <Icon color={colors.primary} size={20}>
                <ImageOff />
              </Icon>
            }
            title={t('settings.loadRemoteImages')}
            description={t('settings.loadRemoteImagesHint')}
            trailing={<Toggle value={loadRemoteImages} onValueChange={setLoadRemoteImages} />}
          />
          <SettingsLink title={t('settings.about')} icon={<Info />} onPress={() => router.push('/settings/about')} />
        </List>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 16, marginBottom: 24, gap: 8 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
