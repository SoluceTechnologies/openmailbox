import { useCallback, useEffect, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, X } from 'lucide-react-native';
import type { Account } from '@openmailbox/mail-core';

import { IconButton, Typography, ViewContainer } from '@/ui/components';

import { ovhProvider, PROVIDERS, type MailProvider } from '../providers';
import { OvhOfferPicker } from './OvhOfferPicker';
import { LanguageSelect } from './LanguageSelect';
import { ProviderList } from './ProviderList';
import { SignInForm } from './SignInForm';

const OVH_PROVIDER = PROVIDERS.find((provider) => provider.identifier === 'ovhcloud')!;

interface AccountSetupFlowProps {
  onDone: (account: Account) => void;
  onClose?: () => void;
}

export function AccountSetupFlow({ onDone, onClose }: AccountSetupFlowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [provider, setProvider] = useState<MailProvider | null>(null);
  const choosingOvhOffer = provider?.identifier === 'ovhcloud' && !provider.servers;

  const back = useCallback(
    () => setProvider((current) => (current?.identifier === 'ovhcloud' && current.servers ? OVH_PROVIDER : null)),
    [],
  );

  useEffect(() => {
    if (!provider) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => subscription.remove();
  }, [provider, back]);

  const welcome = !provider && !onClose;
  const title = welcome
    ? t('accounts.setup.welcome')
    : !provider
      ? t('accounts.setup.chooseProvider')
      : choosingOvhOffer
        ? t('accounts.setup.ovhOfferTitle')
        : provider.identifier === 'other'
        ? t('accounts.setup.otherAccountTitle')
        : t('accounts.setup.providerAccountTitle', { provider: provider.name });

  return (
    <ViewContainer grouped>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <View style={styles.toolbar}>
          {provider ? (
            <IconButton round glass size={40} accessibilityLabel={t('common.back')} onPress={back}>
              <ChevronLeft size={22} color={colors.text} />
            </IconButton>
          ) : onClose ? (
            <IconButton round glass size={40} accessibilityLabel={t('common.close')} onPress={onClose}>
              <X size={20} color={colors.text} />
            </IconButton>
          ) : (
            <View />
          )}
          {!provider && !onClose ? <LanguageSelect variant="icon" /> : null}
        </View>
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            <View style={styles.heading}>
              <Typography variant="h2">{title}</Typography>
              {welcome ? (
                <Typography variant="body1" weight="400" color={colors.textSecondary} style={styles.subtitle}>
                  {t('accounts.setup.welcomeHint')}
                </Typography>
              ) : null}
            </View>
            {choosingOvhOffer ? (
              <OvhOfferPicker onSelect={(offer) => setProvider(ovhProvider(offer))} />
            ) : provider ? (
              <SignInForm key={`${provider.identifier}:${provider.servers?.imap.host ?? ''}`} provider={provider} onDone={onDone} />
            ) : (
              <ProviderList onSelect={setProvider} />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 16 },
  content: { paddingHorizontal: 16, paddingBottom: 32, width: '100%', maxWidth: 560, alignSelf: 'center' },
  heading: { marginTop: 4, marginBottom: 24, marginHorizontal: 4, gap: 8 },
  subtitle: { lineHeight: 22 },
});
