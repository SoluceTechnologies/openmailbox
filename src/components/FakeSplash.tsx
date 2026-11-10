import { Image, Platform, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';

// Continues the native splash screen (expo-splash-screen in app.config.ts) while the core opens:
// the background alone on iOS, the envelope at the same size on Android.
export default function FakeSplash() {
  const { colors, dark } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {Platform.OS === 'android' ? (
        <Image
          source={dark ? require('../../assets/splash-icon-dark.png') : require('../../assets/splash-icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 200, height: 200 },
});
