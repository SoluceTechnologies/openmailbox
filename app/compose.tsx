import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowUp, FolderOpen, Images, Paperclip, X } from 'lucide-react-native';

import { sendDraft } from '@/core/actions';
import { useAccounts, useBody, useThreadEmails } from '@/core/hooks';
import { canAdd, forwardedAttachments, pickAttachments, type ComposerAttachment } from '@/features/composer/attachments';
import { AttachmentList } from '@/features/composer/components/AttachmentList';
import { RecipientField } from '@/features/composer/components/RecipientField';
import { prefill, type ComposeMode } from '@/features/composer/prefill';
import { replaceSignature, withSignature } from '@/features/composer/signature';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUndoStore } from '@/stores/undoStore';
import { ActionList, IconButton, Select, Sheet, Typography, ViewContainer } from '@/ui/components';
import { formatAddressList, parseAddressList, type MailAddress } from '@/utils/addresses';
import { formatFullDate } from '@/utils/dates';

const snapshot = (...fields: string[]) => fields.map((field) => field.trim()).join('\u0000');
const fieldName = (label: string) => label.replace(/\s*:$/, '');

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
  const showToast = useUndoStore((state) => state.show);
  const threadEmails = useThreadEmails(params.threadId ?? '', params.mailboxId || undefined, !!params.threadId);
  const original = threadEmails.data?.find((email) => email.id === params.emailId);
  const originalBody = useBody(params.emailId ?? '', !!params.emailId);

  const initialAccountId = params.accountId ?? defaultAccountId ?? accounts[0]?.id;
  const [accountId, setAccountId] = useState(
    accounts.some((account) => account.id === initialAccountId) ? initialAccountId : accounts[0]?.id,
  );
  const [to, setTo] = useState<MailAddress[]>([]);
  const [cc, setCc] = useState<MailAddress[]>([]);
  const [bcc, setBcc] = useState<MailAddress[]>([]);
  const [toText, setToText] = useState('');
  const [ccText, setCcText] = useState('');
  const [bccText, setBccText] = useState('');
  const [subject, setSubject] = useState('');
  const signatures = useSettingsStore((state) => state.signatures);
  const signatureOf = (id: string | undefined) => (id ? (signatures[id] ?? '') : '');
  const [body, setBody] = useState(() => (mode === 'new' ? withSignature('', signatureOf(accountId)) : ''));
  const [showCopies, setShowCopies] = useState(false);
  const [prefilled, setPrefilled] = useState(mode === 'new');
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [forwarding, setForwarding] = useState(false);
  const [quote, setQuote] = useState('');
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);
  const bodyInput = useRef<TextInput>(null);
  const [initialContent, setInitialContent] = useState(() => snapshot('', '', '', '', body));

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
    setTo(content.to);
    setCc(content.cc);
    setShowCopies(content.cc.length > 0);
    setSubject(content.subject);
    const signed = withSignature(content.body, signatureOf(original.accountId));
    setQuote(content.body);
    setBody(signed);
    setInitialContent(snapshot(formatAddressList(content.to), formatAddressList(content.cc), '', content.subject, signed));
    setPrefilled(true);
    const originalAttachments = originalBody.data?.attachments ?? [];
    if (mode === 'forward' && params.emailId && originalAttachments.length > 0) {
      setForwarding(true);
      forwardedAttachments(params.emailId, originalAttachments)
        .then((forwarded) => setAttachments((picked) => [...forwarded, ...picked]))
        .catch(() => Alert.alert(t('compose.forwardedAttachmentsFailed')))
        .finally(() => setForwarding(false));
    }
  }, [prefilled, original, originalBody.isLoading, originalBody.data, accounts, mode, t, params.emailId]);

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
  const recipientsText = (addresses: MailAddress[], text: string) => [formatAddressList(addresses), text].filter(Boolean).join(', ');
  const dirty =
    prefilled &&
    (snapshot(recipientsText(to, toText), recipientsText(cc, ccText), recipientsText(bcc, bccText), subject, body) !== initialContent ||
      (mode !== 'forward' && attachments.length > 0));
  const hasRecipient = to.length + cc.length + bcc.length > 0 || (toText + ccText + bccText).trim().length > 0;

  const changeAccount = (next: string) => {
    const replaced = replaceSignature(body, signatureOf(accountId), signatureOf(next), quote);
    if (replaced !== null) setBody(replaced);
    setAccountId(next);
  };

  const attach = async (source: 'photos' | 'files') => {
    setAttachMenuVisible(false);
    const picked = await pickAttachments(source).catch(() => []);
    if (picked.length === 0) return;
    if (!canAdd(attachments, picked)) {
      Alert.alert(t('compose.attachmentsTooLarge'));
      return;
    }
    setAttachments((current) => [...current, ...picked]);
  };

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
    const typed = [toText, ccText, bccText].map(parseAddressList);
    const invalid = typed.flatMap((parsed) => parsed.invalid);
    if (invalid.length > 0) {
      Alert.alert(t('compose.invalidAddresses'), invalid.join(', '));
      return;
    }
    const [toAddresses, ccAddresses, bccAddresses] = [to, cc, bcc].map((addresses, index) =>
      [...addresses, ...typed[index].addresses].map((address: MailAddress) => ({ name: address.name, email: address.email })),
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
        attachments: attachments.map(({ path, filename, mimeType }) => ({ path, filename, mimeType })),
      });
      setDefaultAccountId(accountId);
      router.back();
      showToast({ label: t('compose.messageSent'), moves: [] });
    } catch (error) {
      setSending(false);
      Alert.alert(t('compose.sendFailed'), String(error));
    }
  };

  const title = mode === 'new' ? t('compose.newMessage') : mode === 'forward' ? t('compose.forward') : t('compose.reply');

  return (
    <ViewContainer>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <View style={styles.header}>
            <IconButton round glass size={40} accessibilityLabel={t('common.close')} onPress={close}>
              <X size={20} color={colors.text} />
            </IconButton>
            <View style={styles.headerActions}>
              <IconButton round glass size={40} accessibilityLabel={t('compose.attach')} onPress={() => setAttachMenuVisible(true)}>
                <Paperclip size={20} color={colors.text} />
              </IconButton>
              <IconButton
                round
                size={40}
                variant="filled"
                accessibilityLabel={t('compose.send')}
                disabled={sending || forwarding || !prefilled || !hasRecipient}
                onPress={send}
              >
                <ArrowUp size={20} color={colors.primary} />
              </IconButton>
            </View>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Typography variant="h3" style={styles.title}>
              {title}
            </Typography>
            <RecipientField
              label={t('compose.to')}
              value={to}
              onChange={setTo}
              text={toText}
              onTextChange={setToText}
              autoFocus={mode === 'new' || mode === 'forward'}
            />
            {showCopies ? (
              <>
                <RecipientField label={t('compose.cc')} value={cc} onChange={setCc} text={ccText} onTextChange={setCcText} />
                <RecipientField label={t('compose.bcc')} value={bcc} onChange={setBcc} text={bccText} onTextChange={setBccText} />
                <FieldRow label={t('compose.from')}>
                  <Select value={accountId} options={accountOptions} onChange={changeAccount} accessibilityLabel={fieldName(t('compose.from'))} />
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
              <TextInput
                value={subject}
                onChangeText={setSubject}
                accessibilityLabel={fieldName(t('compose.subject'))}
                style={[styles.input, { color: colors.text }]}
              />
            </FieldRow>
            <AttachmentList
              attachments={attachments}
              onRemove={(removed) => setAttachments((current) => current.filter((attachment) => attachment !== removed))}
            />
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
      <Sheet visible={attachMenuVisible} onClose={() => setAttachMenuVisible(false)} title={t('compose.attach')}>
        <ActionList
          actions={[
            { key: 'photos', title: t('compose.attachPhotos'), icon: <Images />, onPress: () => void attach('photos') },
            { key: 'files', title: t('compose.attachFiles'), icon: <FolderOpen />, onPress: () => void attach('files') },
          ]}
        />
      </Sheet>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  headerActions: { flexDirection: 'row', gap: 10 },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  title: { marginVertical: 12 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { fontSize: 16, paddingVertical: 12 },
  body: { fontSize: 16, lineHeight: 22, minHeight: 280, paddingTop: 16 },
});
