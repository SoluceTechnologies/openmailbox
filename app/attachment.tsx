import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Sharing from 'expo-sharing';
import { Share, X } from 'lucide-react-native';
import WebView from 'react-native-webview';

import { IconButton, Typography, ViewContainer } from '@/ui/components';

export default function AttachmentScreen() {
  const { uri, name, mimeType } = useLocalSearchParams<{ uri: string; name: string; mimeType: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const directory = uri.slice(0, uri.lastIndexOf('/') + 1);

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
          <IconButton
            round
            size={40}
            accessibilityLabel={t('reader.share')}
            onPress={() => Sharing.shareAsync(uri, { mimeType, dialogTitle: name }).catch(() => undefined)}
          >
            <Share size={20} color={colors.primary} />
          </IconButton>
        </View>
        <WebView
          source={{ uri }}
          originWhitelist={['file://*']}
          allowingReadAccessToURL={directory}
          allowFileAccess
          javaScriptEnabled={false}
          style={styles.flex}
        />
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, textAlign: 'center' },
});
