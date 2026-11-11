import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Search, SquarePen } from 'lucide-react-native';

import { IconButton, Typography } from '@/ui/components';

interface BottomBarProps {
  composeAccountId?: string;
}

export function BottomBar({ composeAccountId }: BottomBarProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <Pressable
        accessibilityRole="search"
        onPress={() => router.push('/search')}
        style={[styles.search, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
      >
        <Search size={18} color={colors.textSecondary} />
        <Typography color="secondary">{t('search.placeholder')}</Typography>
      </Pressable>
      <IconButton
        round
        glass
        size={50}
        accessibilityLabel={t('compose.newMessage')}
        onPress={() => router.push({ pathname: '/compose', params: composeAccountId ? { accountId: composeAccountId } : {} })}
      >
        <SquarePen size={22} color={colors.primary} />
      </IconButton>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  search: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
