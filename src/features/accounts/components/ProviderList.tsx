import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Server } from 'lucide-react-native';

import { FormSection, Typography } from '@/ui/components';

import { LOCAL_TEST_PROVIDER, PROVIDERS, type MailProvider } from '../providers';

function ProviderRow({ provider, onSelect }: { provider: MailProvider; onSelect: (provider: MailProvider) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const generic = provider.identifier === 'other' || provider.identifier === 'local';
  const title = provider.identifier === 'other' ? t('accounts.setup.otherProvider') : provider.name;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => onSelect(provider)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
    >
      {generic ? (
        <View style={[styles.mark, { backgroundColor: colors.surface }]}>
          <Server size={18} color={colors.textSecondary} />
        </View>
      ) : (
        <View style={[styles.mark, { backgroundColor: provider.color ?? colors.surface }]}>
          <Typography variant="body2" weight="700" color="#ffffff">
            {provider.name.charAt(0)}
          </Typography>
        </View>
      )}
      <View style={styles.text}>
        <Typography variant="body1" weight="500">
          {title}
        </Typography>
        {provider.identifier === 'other' ? (
          <Typography variant="caption" color={colors.textSecondary}>
            {t('accounts.setup.otherProviderHint')}
          </Typography>
        ) : provider.identifier === 'local' ? (
          <Typography variant="caption" color={colors.textSecondary}>
            {t('accounts.setup.localServerHint')}
          </Typography>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

export function ProviderList({ onSelect }: { onSelect: (provider: MailProvider) => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.list}>
      <FormSection footer={t('accounts.setup.providerFooter')}>
        {PROVIDERS.map((provider) => (
          <ProviderRow key={provider.identifier} provider={provider} onSelect={onSelect} />
        ))}
      </FormSection>
      {__DEV__ ? (
        <FormSection title={t('accounts.setup.development')}>
          <ProviderRow provider={LOCAL_TEST_PROVIDER} onSelect={onSelect} />
        </FormSection>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 28 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10 },
  mark: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
