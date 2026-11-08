import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Mail } from 'lucide-react-native';

import { AccountSetupForm } from '@/features/accounts/components/AccountSetupForm';
import { Typography, ViewContainer } from '@/ui/components';

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <ViewContainer>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={[styles.logo, { backgroundColor: colors.primary }]}>
              <Mail size={40} color="#ffffff" />
            </View>
            <Typography variant="h1" align="center">
              {t('onboarding.title')}
            </Typography>
            <Typography color="secondary" align="center" style={styles.subtitle}>
              {t('onboarding.subtitle')}
            </Typography>
            <AccountSetupForm onDone={() => router.replace('/')} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 24, gap: 12, width: '100%', maxWidth: 520, alignSelf: 'center' },
  logo: { width: 80, height: 80, borderRadius: 22, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 24 },
  subtitle: { marginBottom: 16 },
});
