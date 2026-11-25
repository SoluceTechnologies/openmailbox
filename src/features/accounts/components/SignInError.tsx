import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { CircleAlert } from 'lucide-react-native';

import { Typography } from '@/ui/components';

export function SignInError({ message }: { message: string }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[styles.error, { backgroundColor: `${colors.danger}14` }]}>
      <CircleAlert size={18} color={colors.danger} />
      <Typography variant="caption" color={colors.text} style={styles.message}>
        {message}
      </Typography>
    </View>
  );
}

const styles = StyleSheet.create({
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 12 },
  message: { flex: 1 },
});
