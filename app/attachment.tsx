import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Sharing from 'expo-sharing';
import { Share, X } from 'lucide-react-native';
import WebView from 'react-native-webview';

import { IconButton, Typography, ViewContainer } from '@/ui/components';
import { NATIVE_CHROME } from '@/ui/nativeChrome';

export default function AttachmentScreen() {
  const { uri, name, mimeType } = useLocalSearchParams<{ uri: string; name: string; mimeType: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const directory = uri.slice(0, uri.lastIndexOf('/') + 1);
  const share = () => Sharing.shareAsync(uri, { mimeType, dialogTitle: name }).catch(() => undefined);

  const viewer = mimeType.startsWith('image/') ? (
    // WebKit pins an image to the top-left; this centres it and keeps pinch-to-zoom.
    <ScrollView maximumZoomScale={4} centerContent style={styles.flex} contentContainerStyle={styles.flex}>
      <Image source={{ uri }} resizeMode="contain" accessibilityLabel={name} style={styles.flex} />
    </ScrollView>
  ) : (
    <WebView
      source={{ uri }}
      originWhitelist={['file://*']}
      allowingReadAccessToURL={directory}
      allowFileAccess
      javaScriptEnabled={false}
      // Pages start below the transparent header and scroll under it.
      contentInsetAdjustmentBehavior="automatic"
      style={styles.flex}
    />
  );

  if (NATIVE_CHROME) {
    return (
      <>
        {viewer}
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button icon="xmark" accessibilityLabel={t('common.close')} onPress={() => router.back()} />
        </Stack.Toolbar>
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon="square.and.arrow.up" accessibilityLabel={t('reader.share')} onPress={share} />
        </Stack.Toolbar>
      </>
    );
  }

  return (
    <ViewContainer>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
          <IconButton round size={40} accessibilityLabel={t('common.close')} onPress={() => router.back()}>
            <X size={20} color={colors.text} />
          </IconButton>
          <Typography weight="600" numberOfLines={1} style={styles.title}>
            {name}
          </Typography>
          <IconButton round size={40} accessibilityLabel={t('reader.share')} onPress={share}>
            <Share size={20} color={colors.primary} />
          </IconButton>
        </View>
        {viewer}
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, textAlign: 'center' },
});
