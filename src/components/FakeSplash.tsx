import { Image, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from 'expo-router';

// Same blue as the Android splash in app.config.ts.
const ANDROID_SPLASH_BLUE = '#109be6';

// Continues the native splash screen (expo-splash-screen in app.config.ts) while the core opens:
// the background alone on iOS, the white envelope on blue at the same size on Android.
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
