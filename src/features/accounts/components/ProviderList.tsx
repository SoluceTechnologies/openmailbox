import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Heart } from 'lucide-react-native';

import { useSettingsStore } from '@/stores/settingsStore';
import { FormSection, Typography } from '@/ui/components';

import { LOCAL_STALWART_PROVIDER, LOCAL_TEST_PROVIDER, PROVIDERS, type MailProvider, type ProviderIdentifier } from '../providers';
import { ProviderMark } from './ProviderMark';
import { SignInError } from './SignInError';

interface ProviderRowProps {
  provider: MailProvider;
  onSelect: (provider: MailProvider) => void;
  busy?: boolean;
  disabled?: boolean;
}

const PROVIDER_HINTS: Partial<Record<ProviderIdentifier, string>> = {
  gmail: 'accounts.setup.googleHint',
  microsoft: 'accounts.setup.microsoftHint',
  icloud: 'accounts.setup.icloudHint',
  ovhcloud: 'accounts.setup.ovhHint',
  other: 'accounts.setup.otherProviderHint',
  stalwart: 'accounts.setup.localStalwartHint',
  local: 'accounts.setup.localServerHint',
};

function ProviderRow({ provider, onSelect, busy = false, disabled = false }: ProviderRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const title = provider.identifier === 'other' ? t('accounts.setup.otherProvider') : provider.name;
  const hint = PROVIDER_HINTS[provider.identifier];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ busy, disabled }}
      disabled={disabled}
      onPress={() => onSelect(provider)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
    >
      <ProviderMark brand={provider.brand} />
      <View style={styles.text}>
        <Typography variant="body1" weight="500">
          {title}
        </Typography>
        {hint ? (
          <Typography variant="caption" color={colors.textSecondary}>
            {t(hint)}
          </Typography>
        ) : null}
      </View>
      {busy ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <ChevronRight size={18} color={colors.textTertiary} />}
    </Pressable>
  );
}

const HEART_RED = '#ff3b30';

export function MadeWithLove() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduceMotion = useSettingsStore((state) => state.reduceMotion);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    const beat = (to: number, duration: number) => withTiming(to, { duration, easing: Easing.out(Easing.quad) });

    scale.value = withRepeat(withSequence(beat(1.22, 140), beat(1, 150), beat(1.12, 120), beat(1, 220), withDelay(1400, beat(1, 0))), -1);
    return () => cancelAnimation(scale);
  }, [reduceMotion, scale]);

  const beating = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const signature = t('accounts.setup.madeWith');
  const [before, after = ''] = signature.split('♥');

  return (
    <View style={styles.signature} accessible accessibilityLabel={signature}>
      <Typography variant="caption" color={colors.textSecondary}>
        {before}
      </Typography>
      <Animated.View style={beating}>
        <Heart size={12} color={HEART_RED} fill={HEART_RED} />
      </Animated.View>
      <Typography variant="caption" color={colors.textSecondary}>
        {after}
      </Typography>
    </View>
  );
}

interface ProviderListProps {
  onSelect: (provider: MailProvider) => void;
  pending?: ProviderIdentifier | null;
  error?: string | null;
}

export function ProviderList({ onSelect, pending = null, error = null }: ProviderListProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.list}>
      {error ? <SignInError message={error} /> : null}
      <FormSection footer={t('accounts.setup.providerFooter')}>
        {PROVIDERS.map((provider) => (
          <ProviderRow
            key={provider.identifier}
            provider={provider}
            onSelect={onSelect}
            busy={pending === provider.identifier}
            disabled={pending !== null}
          />
        ))}
      </FormSection>
      {__DEV__ ? (
        <FormSection title={t('accounts.setup.development')}>
          <ProviderRow provider={LOCAL_TEST_PROVIDER} onSelect={onSelect} />
          <ProviderRow provider={LOCAL_STALWART_PROVIDER} onSelect={onSelect} />
        </FormSection>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 28 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10 },
  text: { flex: 1, gap: 2 },
  signature: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8 },
});
