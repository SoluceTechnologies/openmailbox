import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from 'expo-router';

import Typography from './Typography';

interface FormSectionProps {
  title?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

function FormSection({ title, footer, children, style }: FormSectionProps) {
  const { colors } = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);

  return (
    <View style={[styles.section, style]}>
      {title ? (
        <Typography variant="caption" color={colors.textSecondary} style={styles.title}>
          {title.toUpperCase()}
        </Typography>
      ) : null}
      <View style={[styles.card, { backgroundColor: colors.item }]}>
        {rows.map((row, index) => (
          <View key={React.isValidElement(row) && row.key !== null ? row.key : index}>
            {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.border }]} /> : null}
            {row}
          </View>
        ))}
      </View>
      {typeof footer === 'string' ? (
        <Typography variant="caption" color={colors.textSecondary} style={styles.footer}>
          {footer}
        </Typography>
      ) : (
        footer
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { width: '100%' },
  title: { marginLeft: 16, marginBottom: 6, fontSize: 13, letterSpacing: 0.2 },
  card: { borderRadius: 12, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  footer: { marginHorizontal: 16, marginTop: 6, fontSize: 13, lineHeight: 18 },
});

export default React.memo(FormSection);
