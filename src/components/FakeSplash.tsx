import { Image, StyleSheet, View } from 'react-native';

export default function FakeSplash() {
  return (
    <View style={styles.container}>
      <Image source={require('../../assets/splash-icon.png')} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0082c9', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 200, height: 200 },
});
