import React from 'react';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent, type AccessibilityActionInfo } from 'react-native';
import { useTheme } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';

import Typography from './Typography';

interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  detail?: string | number;
  trailing?: React.ReactNode;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityActions?: AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  testID?: string;
}

function ListRow({
  title, subtitle, leading, detail, trailing, chevron = true, destructive, disabled, onPress, accessibilityLabel, accessibilityActions,
  onAccessibilityAction, testID,
}: ListRowProps) {
  const { colors } = useTheme();
  const showDetail = detail !== undefined && detail !== '' && detail !== 0;
  const content = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.text}>
        <Typography
          variant="body1"
          weight="400"
          numberOfLines={1}
          color={destructive ? colors.danger : disabled ? colors.textTertiary : colors.text}
          style={styles.title}
        >
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="caption" color={colors.textSecondary} numberOfLines={2}>
            {subtitle}
          </Typography>
        ) : null}
      </View>
      {showDetail ? (
        <Typography variant="body1" weight="400" numberOfLines={1} color={colors.textSecondary} style={styles.detail}>
          {String(detail)}
        </Typography>
      ) : null}
      {trailing}
      {onPress && chevron ? <ChevronRight size={18} color={colors.textTertiary} /> : null}
    </>
  );

  if (!onPress || disabled) {
    return (
      <View testID={testID} style={styles.row}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  leading: { minWidth: 26, alignItems: 'center' },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16 },
  detail: { fontSize: 16, flexShrink: 1, maxWidth: '55%' },
});

export default React.memo(ListRow);
