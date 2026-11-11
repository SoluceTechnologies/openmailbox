import { Image, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from 'expo-router';

const ANDROID_SPLASH_BLUE = '#109be6';

export default function FakeSplash() {
  const { colors } = useTheme();
  if (Platform.OS !== 'android') return <View style={[styles.container, { backgroundColor: colors.background }]} />;
  return (
    <View style={[styles.container, { backgroundColor: ANDROID_SPLASH_BLUE }]}>
      <StatusBar style="light" />
      <Image source={require('../../assets/splash-icon.png')} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 200, height: 200 },
});
