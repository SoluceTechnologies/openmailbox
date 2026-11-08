import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react-native';

import { AccountSetupForm } from '@/features/accounts/components/AccountSetupForm';
import { IconButton, ScreenHeader, ViewContainer } from '@/ui/components';

export default function AddAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <ViewContainer>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <ScreenHeader
          title={t('accounts.add')}
          left={
            <IconButton round glass size={40} accessibilityLabel={t('common.close')} onPress={() => router.back()}>
              <X size={20} color={colors.text} />
            </IconButton>
          }
        />
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <AccountSetupForm onDone={() => router.back()} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, width: '100%', maxWidth: 520, alignSelf: 'center' },
});
