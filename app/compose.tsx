import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowUp, X } from 'lucide-react-native';

import { sendDraft } from '@/core/actions';
import { useAccounts, useBody, useThreadEmails } from '@/core/hooks';
import { prefill, type ComposeMode } from '@/features/composer/prefill';
import { useSettingsStore } from '@/stores/settingsStore';
import { IconButton, Select, Typography, ViewContainer } from '@/ui/components';
import { formatAddressList, parseAddressList, type MailAddress } from '@/utils/addresses';
import { formatFullDate } from '@/utils/dates';

const snapshot = (...fields: string[]) => fields.map((field) => field.trim()).join('\u0000');

type ComposeParams = { mode?: ComposeMode; emailId?: string; threadId?: string; mailboxId?: string; accountId?: string };

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.field, { borderBottomColor: colors.border }]}>
      <Typography color="secondary">{label}</Typography>
      <View style={styles.flex}>{children}</View>
    </View>
  );
}

export default function ComposeScreen() {
  const params = useLocalSearchParams<ComposeParams>();
  const mode: ComposeMode = params.mode ?? 'new';
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const accounts = useAccounts();
  const defaultAccountId = useSettingsStore((state) => state.defaultAccountId);
  const setDefaultAccountId = useSettingsStore((state) => state.setDefaultAccountId);
  const threadEmails = useThreadEmails(params.threadId ?? '', params.mailboxId || undefined, !!params.threadId);
  const original = threadEmails.data?.find((email) => email.id === params.emailId);
  const originalBody = useBody(params.emailId ?? '', !!params.emailId);

  const initialAccountId = params.accountId ?? defaultAccountId ?? accounts[0]?.id;
  const [accountId, setAccountId] = useState(
    accounts.some((account) => account.id === initialAccountId) ? initialAccountId : accounts[0]?.id,
  );
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showCopies, setShowCopies] = useState(false);
  const [prefilled, setPrefilled] = useState(mode === 'new');
  const [sending, setSending] = useState(false);
  const bodyInput = useRef<TextInput>(null);
  const [initialContent, setInitialContent] = useState(() => snapshot('', '', '', '', ''));

  useEffect(() => {
    if (prefilled || !original || originalBody.isLoading) return;
    const ownAddresses = accounts.map((account) => account.email);
    const content = prefill(mode, original, originalBody.data?.text ?? original.preview ?? '', ownAddresses, formatFullDate(original.receivedAt), {
      wrote: (date, author) => t('compose.wrote', { date, author }),
      forwardedHeader: t('compose.forwardedHeader'),
      from: t('compose.headerFrom'),
      date: t('compose.headerDate'),
      subject: t('compose.headerSubject'),
      to: t('compose.headerTo'),
    });
    setAccountId(original.accountId);
    setTo(formatAddressList(content.to));
    setCc(formatAddressList(content.cc));
    setShowCopies(content.cc.length > 0);
    setSubject(content.subject);
    setBody(content.body);
    setInitialContent(snapshot(formatAddressList(content.to), formatAddressList(content.cc), '', content.subject, content.body));
    setPrefilled(true);
  }, [prefilled, original, originalBody.isLoading, originalBody.data, accounts, mode, t]);

  useEffect(() => {
    if (!prefilled || (mode !== 'reply' && mode !== 'replyAll')) return;
    const timer = setTimeout(() => {
      bodyInput.current?.focus();
      bodyInput.current?.setSelection(0, 0);
    }, 50);
    return () => clearTimeout(timer);
  }, [prefilled, mode]);

  const accountOptions = useMemo(
    () => accounts.map((account) => ({ value: account.id, label: account.email, description: account.displayName })),
    [accounts],
  );
  const sender = accounts.find((account) => account.id === accountId);
  const dirty = prefilled && snapshot(to, cc, bcc, subject, body) !== initialContent;

  const close = () => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert(t('compose.discardTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('compose.discard'), style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const send = async () => {
    if (!accountId) return;
    const recipients = [to, cc, bcc].map(parseAddressList);
    const invalid = recipients.flatMap((parsed) => parsed.invalid);
    if (invalid.length > 0) {
      Alert.alert(t('compose.invalidAddresses'), invalid.join(', '));
      return;
    }
    const [toAddresses, ccAddresses, bccAddresses] = recipients.map((parsed) =>
      parsed.addresses.map((address: MailAddress) => ({ name: address.name, email: address.email })),
    );
    if (toAddresses.length + ccAddresses.length + bccAddresses.length === 0) {
      Alert.alert(t('compose.noRecipient'));
      return;
    }
    setSending(true);
    try {
      await sendDraft({
        accountId,
        to: toAddresses,
        cc: ccAddresses,
        bcc: bccAddresses,
        subject: subject.trim(),
        bodyText: body,
        inReplyToEmailId: mode === 'reply' || mode === 'replyAll' ? params.emailId : undefined,
        attachments: [],
      });
      setDefaultAccountId(accountId);
      router.back();
    } catch (error) {
      setSending(false);
      Alert.alert(t('compose.sendFailed'), String(error));
    }
  };

  const title = mode === 'new' ? t('compose.newMessage') : mode === 'forward' ? t('compose.forward') : t('compose.reply');

  return (
    <ViewContainer>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <IconButton round glass size={40} accessibilityLabel={t('common.close')} onPress={close}>
              <X size={20} color={colors.text} />
            </IconButton>
            <IconButton
              round
              size={40}
              variant="filled"
              accessibilityLabel={t('compose.send')}
              disabled={sending || !prefilled || to.trim().length + cc.trim().length + bcc.trim().length === 0}
              onPress={send}
            >
              <ArrowUp size={20} color={colors.primary} />
            </IconButton>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Typography variant="h3" style={styles.title}>
              {title}
            </Typography>
            <FieldRow label={t('compose.to')}>
              <TextInput
                value={to}
                onChangeText={setTo}
                autoFocus={mode === 'new' || mode === 'forward'}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={[styles.input, { color: colors.text }]}
              />
            </FieldRow>
            {showCopies ? (
              <>
                <FieldRow label={t('compose.cc')}>
                  <TextInput value={cc} onChangeText={setCc} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={[styles.input, { color: colors.text }]} />
                </FieldRow>
                <FieldRow label={t('compose.bcc')}>
                  <TextInput value={bcc} onChangeText={setBcc} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={[styles.input, { color: colors.text }]} />
                </FieldRow>
                <FieldRow label={t('compose.from')}>
                  <Select value={accountId} options={accountOptions} onChange={setAccountId} accessibilityLabel={t('compose.from')} />
                </FieldRow>
              </>
            ) : (
              <Pressable onPress={() => setShowCopies(true)} style={[styles.field, { borderBottomColor: colors.border }]}>
                <Typography color="secondary" numberOfLines={1}>
                  {t('compose.copiesAndFrom', { from: sender?.email ?? '' })}
                </Typography>
              </Pressable>
            )}
            <FieldRow label={t('compose.subject')}>
              <TextInput value={subject} onChangeText={setSubject} style={[styles.input, { color: colors.text }]} />
            </FieldRow>
            <TextInput
              value={body}
              onChangeText={setBody}
              multiline
              ref={bodyInput}
              textAlignVertical="top"
              placeholder={t('compose.bodyPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              style={[styles.body, { color: colors.text }]}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  title: { marginVertical: 12 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { fontSize: 16, paddingVertical: 12 },
  body: { fontSize: 16, lineHeight: 22, minHeight: 280, paddingTop: 16 },
});
