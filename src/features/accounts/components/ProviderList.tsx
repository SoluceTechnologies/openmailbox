import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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

import { LOCAL_TEST_PROVIDER, PROVIDERS, type MailProvider } from '../providers';
import { ProviderMark } from './ProviderMark';

function ProviderRow({ provider, onSelect }: { provider: MailProvider; onSelect: (provider: MailProvider) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const title = provider.identifier === 'other' ? t('accounts.setup.otherProvider') : provider.name;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => onSelect(provider)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
    >
      <ProviderMark brand={provider.brand} />
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
  text: { flex: 1, gap: 2 },
  signature: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8 },
});
