import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react-native';

import { useIsOnline } from '@/services/shared/network';
import { Typography } from '@/ui/components';

export function OfflineBanner() {
  const online = useIsOnline();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (online) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      testID="offline-banner"
      accessible
      accessibilityRole="alert"
      accessibilityLabel={t('offline.banner')}
      style={[styles.root, { paddingTop: insets.top + 4, backgroundColor: colors.surface, borderBottomColor: colors.border }]}
    >
      <View style={styles.line}>
        <WifiOff size={14} color={colors.warning} strokeWidth={2.4} />
        <Typography variant="caption" weight="600" style={[styles.title, { color: colors.text }]}>
          {t('sync.offline')}
        </Typography>
        <Typography variant="caption" color="secondary" numberOfLines={1} style={styles.detail}>
          {t('offline.detail')}
        </Typography>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 16, paddingBottom: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  title: { fontSize: 13 },
  detail: { fontSize: 13, flexShrink: 1 },
});
