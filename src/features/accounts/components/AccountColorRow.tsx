import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Account } from '@openmailbox/mail-core';

import { mailCore } from '@/core/mailCore';
import { queryClient, queryKeys } from '@/core/queryClient';
import { ACCOUNT_COLORS } from '@/theme';
import { ListRow, Sheet, Typography } from '@/ui/components';
import { haptic } from '@/utils/haptics';

const ROWS = [
  [9, 2, 6, 1, 11, 5],
  [0, 8, 3, 4, 10, 7],
];

export function AccountColorRow({ account }: { account: Account }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = account.color % ACCOUNT_COLORS.length;
  const current = ACCOUNT_COLORS[selected];

  const choose = (color: number) => {
    setOpen(false);
    if (color === selected) return;
    haptic();
    queryClient.setQueryData<Account[]>(queryKeys.accounts, (accounts) =>
      accounts?.map((candidate) => (candidate.id === account.id ? { ...candidate, color } : candidate)),
    );
    mailCore()
      .setAccountColor(account.id, color)
      .catch(() => queryClient.invalidateQueries({ queryKey: queryKeys.accounts }));
  };

  return (
    <>
      <ListRow
        title={t('accounts.color')}
        accessibilityLabel={`${t('accounts.color')}, ${t(`colors.${current.name}`)}`}
        trailing={<View style={[styles.dot, { backgroundColor: current.hex }]} />}
        onPress={() => setOpen(true)}
      />
      <Sheet visible={open} onClose={() => setOpen(false)} title={t('accounts.color')}>
        <View accessibilityRole="radiogroup" style={styles.grid}>
          {ROWS.map((row) => (
            <View key={row[0]} style={styles.row}>
              {row.map((index) => {
                const { name, hex } = ACCOUNT_COLORS[index];
                const checked = index === selected;
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="radio"
                    accessibilityLabel={t(`colors.${name}`)}
                    accessibilityState={{ checked }}
                    hitSlop={4}
                    onPress={() => choose(index)}
                    style={[styles.ring, { borderColor: checked ? hex : 'transparent' }]}
                  >
                    <View style={[styles.swatch, { backgroundColor: hex, borderColor: colors.border }]} />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        <Typography variant="caption" color="secondary" style={styles.hint}>
          {t('accounts.colorHint')}
        </Typography>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  dot: { width: 12, height: 12, borderRadius: 6 },
  grid: { gap: 10, paddingVertical: 4 },
  hint: { textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  ring: { width: 44, height: 44, borderRadius: 22, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
});
