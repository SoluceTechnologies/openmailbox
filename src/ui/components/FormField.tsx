import React, { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from 'expo-router';

import Typography from './Typography';

interface FormFieldProps extends TextInputProps {
  label: string;
  trailing?: React.ReactNode;
}

const FormField = forwardRef<TextInput, FormFieldProps>(function FormField({ label, trailing, style, ...input }, reference) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Typography variant="body1" weight="400" numberOfLines={1} style={styles.label}>
        {label}
      </Typography>
      <TextInput
        ref={reference}
        accessibilityLabel={label}
        placeholderTextColor={colors.textTertiary}
        {...input}
        style={[styles.input, { color: colors.text }, style]}
      />
      {trailing}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingLeft: 16, paddingRight: 8, gap: 8 },
  label: { width: 116, fontSize: 16 },
  input: { flex: 1, fontSize: 16, paddingVertical: 12, paddingRight: 8 },
});

export default React.memo(FormField);
