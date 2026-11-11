import React from 'react';
import { Switch, SwitchProps } from 'react-native';
import { useTheme } from 'expo-router';


function Toggle({ value, onValueChange, disabled, ...rest }: SwitchProps) {
  const { colors } = useTheme();
  return (
    <Switch
      {...rest}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: `${colors.textTertiary}66`, true: colors.primary }}
      thumbColor="#ffffff"
      ios_backgroundColor={`${colors.textTertiary}66`}
    />
  );
}

export default React.memo(Toggle);
