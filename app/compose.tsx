import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, InputAccessoryView, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { HStack, Host, Image, Menu, Picker, Text } from '@expo/ui/swift-ui';
import { foregroundStyle, frame, lineLimit, tag } from '@expo/ui/swift-ui/modifiers';
import { ArrowUp, ChevronDown, FolderOpen, Images, Paperclip, X } from 'lucide-react-native';
import type { EnrichedTextInputInstance, OnLinkDetected } from 'react-native-enriched-html';

import { sendDraft } from '@/core/actions';
import { useAccounts, useBody, useThreadEmails } from '@/core/hooks';
import { canAdd, forwardedAttachments, pickAttachments, type ComposerAttachment } from '@/features/composer/attachments';
import { AttachmentList } from '@/features/composer/components/AttachmentList';
import { RecipientField } from '@/features/composer/components/RecipientField';
import { FORMAT_BAR_HEIGHT, KeyboardFormatBar } from '@/features/composer/components/KeyboardFormatBar';
import { RichBody } from '@/features/composer/components/RichBody';
import { editorHtml } from '@/features/composer/editorHtml';
import { composeTitleKey, linkedHtml, linkedParagraphs, parseMailto, prefill, quoteHtml, type ComposeMode } from '@/features/composer/prefill';
import { replySender, sendersOf } from '@/features/composer/senders';
import { readSharedContent } from '@/features/composer/shared';
import { HtmlBody } from '@/features/reader/components/HtmlBody';
import { INITIAL_EDITOR_STATE, sameState, type EditorState } from '@/features/signatures/FormatBar';
import { FormatSheets, type FormatPanel } from '@/features/signatures/FormatSheets';
import { mailHtml, signatureHtml, signatureText } from '@/features/composer/signature';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUndoStore } from '@/stores/undoStore';
import { ActionList, IconButton, Select, Sheet, Typography, ViewContainer } from '@/ui/components';
import { NATIVE_CHROME } from '@/ui/nativeChrome';
import { formatAddressList, parseAddressList, type MailAddress } from '@/utils/addresses';
import { formatFullDate } from '@/utils/dates';
import { goBack } from '@/utils/navigation';

const snapshot = (...fields: string[]) => fields.map((field) => field.trim()).join('\u0000');
const fieldName = (label: string) => label.replace(/\s*:$/, '');
const FORMAT_BAR_ID = 'compose-format-bar';

type ComposeParams = {
  mode?: ComposeMode;
  emailId?: string;
  threadId?: string;
  mailboxId?: string;
  accountId?: string;
  to?: string;
  mailto?: string;
  shared?: string;
};

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
  const { colors } = useTheme();
  const accounts = useAccounts();
  const defaultAccountId = useSettingsStore((state) => state.defaultAccountId);
  const showToast = useUndoStore((state) => state.show);
  const threadEmails = useThreadEmails(params.threadId ?? '', params.mailboxId || undefined, !!params.threadId);
  const original = threadEmails.data?.find((email) => email.id === params.emailId);
  const originalBody = useBody(params.emailId ?? '', !!params.emailId);
  const originalHtml = mode === 'new' ? undefined : originalBody.data?.html;

  const initialAccountId = params.accountId ?? defaultAccountId ?? accounts[0]?.id;
  const pickAccountId = () => (accounts.some((account) => account.id === initialAccountId) ? initialAccountId : accounts[0]?.id);
  const [accountId, setAccountId] = useState(pickAccountId);
  const [identityId, setIdentityId] = useState<string>();
  useEffect(() => {
    if (!accountId && accounts.length > 0) setAccountId(pickAccountId());
  }, [accounts]);
  const signatures = useSettingsStore((state) => state.signatures);
  const identities = useSettingsStore((state) => state.identities);
  const footer = useSettingsStore((state) => state.sentFromFooter) ? t('compose.sentFrom') : '';
  const senders = useMemo(() => sendersOf(accounts, identities, signatures), [accounts, identities, signatures]);
  const sender = senders.find((candidate) => candidate.key === identityId) ?? senders.find((candidate) => candidate.key === accountId);
  const [to, setTo] = useState<MailAddress[]>(() => (params.to ? [{ email: params.to }] : []));
  const [cc, setCc] = useState<MailAddress[]>([]);
  const [bcc, setBcc] = useState<MailAddress[]>([]);
  const [toText, setToText] = useState('');
  const [ccText, setCcText] = useState('');
  const [bccText, setBccText] = useState('');
  const [subject, setSubject] = useState('');
  const loadRemoteImages = useSettingsStore((state) => state.loadRemoteImages);
  const body = useRef<EnrichedTextInputInstance>(null);
  const accessoryId = useId();
  const bodyText = useRef('');
  const [hasBody, setHasBody] = useState(false);
  const [bodyFocused, setBodyFocused] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [panel, setPanel] = useState<FormatPanel>(null);
  const [editorState, setEditorState] = useState(INITIAL_EDITOR_STATE);
  const selection = useRef({ start: 0, end: 0, text: '' });
  const detectedLink = useRef<OnLinkDetected | null>(null);
  const [linkTarget, setLinkTarget] = useState<OnLinkDetected | null>(null);
  const [signatureRemoved, setSignatureRemoved] = useState(false);
  const [signatureReady, setSignatureReady] = useState(false);
  const [showCopies, setShowCopies] = useState(false);
  const [prefilled, setPrefilled] = useState(mode === 'new');
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [forwarding, setForwarding] = useState(false);
  const [quote, setQuote] = useState('');
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);
  const [initialContent, setInitialContent] = useState(() => snapshot('', '', '', ''));

  useEffect(() => {
    const timer = setTimeout(() => setSignatureReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (prefilled || !original || originalBody.isLoading) return;
    const ownAddresses = senders.map((candidate) => candidate.email);
    const content = prefill(mode, original, originalBody.data?.text ?? original.preview ?? '', ownAddresses, formatFullDate(original.receivedAt), {
      wrote: (date, author) => t('compose.wrote', { date, author }),
      forwardedHeader: t('compose.forwardedHeader'),
      from: t('compose.headerFrom'),
      date: t('compose.headerDate'),
      subject: t('compose.headerSubject'),
      to: t('compose.headerTo'),
    });
    const replyFrom = replySender(senders, original);
    setAccountId(original.accountId);
    setIdentityId(replyFrom?.key);
    setTo(content.to);
    setCc(content.cc);
    setShowCopies(content.cc.length > 0);
    setSubject(content.subject);
    setQuote(content.body);
    setInitialContent(snapshot(formatAddressList(content.to), formatAddressList(content.cc), '', content.subject));
    setPrefilled(true);
    const originalAttachments = originalBody.data?.attachments ?? [];
    if (mode === 'forward' && params.emailId && originalAttachments.length > 0) {
      setForwarding(true);
      forwardedAttachments(params.emailId, originalAttachments)
        .then((forwarded) => setAttachments((picked) => [...forwarded, ...picked]))
        .catch(() => Alert.alert(t('compose.forwardedAttachmentsFailed')))
        .finally(() => setForwarding(false));
    }
  }, [prefilled, original, originalBody.isLoading, originalBody.data, senders, mode, t, params.emailId]);

  useEffect(() => {
    if (!params.mailto) return;
    const fields = parseMailto(params.mailto);
    setTo(fields.to);
    setCc(fields.cc);
    setBcc(fields.bcc);
    setShowCopies(fields.cc.length + fields.bcc.length > 0);
    setSubject(fields.subject);
    if (fields.body) body.current?.setValue(linkedParagraphs(fields.body));
  }, [params.mailto]);

  useEffect(() => {
    if (!params.shared) return;
    readSharedContent()
      .then(async (shared) => {
        if (shared.text) {
          const current = bodyText.current.trim() ? editorHtml((await body.current?.getHTML()) ?? '') : '';
          body.current?.setValue(linkedParagraphs(shared.text) + current);
        }
        if (shared.failed) Alert.alert(t('compose.sharedFilesFailed'));
        if (shared.attachments.length === 0) return;
        if (!canAdd([], shared.attachments)) {
          Alert.alert(t('compose.attachmentsTooLarge'));
          return;
        }
        setAttachments(shared.attachments);
      })
      .catch(() => Alert.alert(t('compose.sharedFilesFailed')));
  }, [params.shared, t]);

  useEffect(() => {
    if (!prefilled || (mode !== 'reply' && mode !== 'replyAll')) return;
    const timer = setTimeout(() => {
      body.current?.focus();
      body.current?.setSelection(0, 0);
    }, 50);
    return () => clearTimeout(timer);
  }, [prefilled, mode]);

  const senderOptions = useMemo(
    () => senders.map((candidate) => ({ value: candidate.key, label: candidate.email, description: candidate.name })),
    [senders],
  );
  const recipientsText = (addresses: MailAddress[], text: string) => [formatAddressList(addresses), text].filter(Boolean).join(', ');
  const dirty =
    prefilled &&
    (snapshot(recipientsText(to, toText), recipientsText(cc, ccText), recipientsText(bcc, bccText), subject) !== initialContent ||
      hasBody ||
      (mode !== 'forward' && attachments.length > 0));
  const hasRecipient = to.length + cc.length + bcc.length > 0 || (toText + ccText + bccText).trim().length > 0;

  const onBodyText = useCallback((text: string) => {
    bodyText.current = text;
    setHasBody(text.trim() !== '');
  }, []);

  const ios = Platform.OS === 'ios';
  const sharedAccessory = ios ? `${FORMAT_BAR_ID}.${accessoryId}` : undefined;
  const barShown = bodyFocused || (panel !== null && panel !== 'link');
  const onEditorState = useCallback((next: EditorState) => setEditorState((current) => (sameState(current, next) ? current : next)), []);
  const onSelection = useCallback((next: { start: number; end: number; text: string }) => {
    selection.current = next;
  }, []);
  const toggleFormatting = useCallback(() => setFormatting((current) => !current), []);
  const onLinkDetected = useCallback((link: OnLinkDetected) => {
    detectedLink.current = link;
  }, []);
  const openLink = useCallback(() => {
    setLinkTarget(editorState.link !== null ? detectedLink.current : null);
    setPanel('link');
  }, [editorState.link]);
  const closePanel = useCallback(() => {
    setPanel(null);
    body.current?.focus();
    body.current?.setSelection(selection.current.start, selection.current.end);
  }, []);
  const openSize = useCallback(() => setPanel('size'), []);
  const openColor = useCallback((kind: 'text' | 'highlight') => setPanel(kind), []);
  const runCommand = useCallback(
    (command: string) => {
      const editor = body.current;
      if (!editor) return;
      if (command === 'bold') editor.toggleBold();
      else if (command === 'italic') editor.toggleItalic();
      else if (command === 'underline') editor.toggleUnderline();
      else if (command === 'strikeThrough') editor.toggleStrikeThrough();
      else if (command === 'insertUnorderedList') editor.toggleUnorderedList();
      else if (command === 'insertOrderedList') editor.toggleOrderedList();
      else if (command === 'removeFormat') {
        editor.setStyle({ foregroundColor: null, backgroundColor: null, fontSize: null });
        if (editorState.bold) editor.toggleBold();
        if (editorState.italic) editor.toggleItalic();
        if (editorState.underline) editor.toggleUnderline();
        if (editorState.strike) editor.toggleStrikeThrough();
      }
    },
    [editorState],
  );

  const changeSender = (key: string) => {
    const next = senders.find((candidate) => candidate.key === key);
    if (!next) return;
    setAccountId(next.accountId);
    setIdentityId(next.identity?.id);
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
      goBack();
      return;
    }
    Alert.alert(t('compose.discardTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('compose.discard'), style: 'destructive', onPress: goBack },
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
    const signature = signatureRemoved || !sender ? { html: '', text: '' } : sender.signature;
    const signatureFooter = signatureRemoved ? '' : footer;
    const signatureMarkup = signatureHtml(signature, signatureFooter);
    setSending(true);
    try {
      const html = editorHtml((await body.current?.getHTML()) ?? '');
      await sendDraft({
        accountId,
        to: toAddresses,
        cc: ccAddresses,
        bcc: bccAddresses,
        subject: subject.trim(),
        bodyText: bodyText.current + signatureText(signature, signatureFooter) + quote,
        bodyHtml: mailHtml(
          html +
            (signatureMarkup ? `<br><br>${signatureMarkup}` : '') +
            (originalHtml ? quoteHtml(mode, quote, originalHtml) : linkedHtml(quote)),
        ),
        inReplyToEmailId: mode === 'reply' || mode === 'replyAll' ? params.emailId : undefined,
        attachments: attachments.map(({ path, filename, mimeType }) => ({ path, filename, mimeType })),
        from: sender?.identity ? { name: sender.name, email: sender.email } : undefined,
      });
      goBack();
      showToast({ label: t('compose.messageSent'), moves: [] });
    } catch (error) {
      setSending(false);
      Alert.alert(t('compose.sendFailed'), String(error));
    }
  };

  const title = t(composeTitleKey(mode));
  const formatBar = (
    <KeyboardFormatBar
      visible={barShown}
      expanded={formatting}
      onToggle={toggleFormatting}
      state={editorState}
      onCommand={runCommand}
      onLink={openLink}
      onSize={openSize}
      onColor={openColor}
    />
  );
  const previewHtml = useMemo(() => (sender ? signatureHtml(sender.signature, footer) : ''), [sender, footer]);

  return (
    <ViewContainer>
      <SafeAreaView edges={NATIVE_CHROME ? ['bottom'] : ['top', 'bottom']} style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior="padding" enabled={!ios}>
          {NATIVE_CHROME ? null : (
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
          )}
          <ScrollView
            keyboardShouldPersistTaps="always"
            contentInsetAdjustmentBehavior="automatic"
            automaticallyAdjustKeyboardInsets={ios}
            contentContainerStyle={[styles.content, barShown && !ios ? styles.contentAboveBar : null]}
          >
            {NATIVE_CHROME ? null : (
              <Typography variant="h3" style={styles.title}>
                {title}
              </Typography>
            )}
            <RecipientField
              label={t('compose.to')}
              value={to}
              onChange={setTo}
              text={toText}
              onTextChange={setToText}
              autoFocus={mode === 'new' || mode === 'forward'}
              inputAccessoryViewID={sharedAccessory}
            />
            {showCopies ? (
              <>
                <RecipientField label={t('compose.cc')} value={cc} onChange={setCc} text={ccText} onTextChange={setCcText} inputAccessoryViewID={sharedAccessory} />
                <RecipientField label={t('compose.bcc')} value={bcc} onChange={setBcc} text={bccText} onTextChange={setBccText} inputAccessoryViewID={sharedAccessory} />
                <FieldRow label={t('compose.from')}>
                  {NATIVE_CHROME ? (
                    <Host matchContents={{ vertical: true }} style={styles.senderPicker}>
                      <Menu
                        modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
                        label={
                          <HStack spacing={4}>
                            <Text modifiers={[lineLimit(1), foregroundStyle(colors.textSecondary)]}>{sender?.email ?? ''}</Text>
                            <Image systemName="chevron.up.chevron.down" size={13} color={colors.textTertiary} />
                          </HStack>
                        }
                      >
                        <Picker selection={sender?.key} onSelectionChange={(next) => changeSender(next as string)}>
                          {senders.map((candidate) => (
                            <Text key={candidate.key} modifiers={[tag(candidate.key)]}>
                              {candidate.email}
                            </Text>
                          ))}
                        </Picker>
                      </Menu>
                    </Host>
                  ) : (
                    <Select
                      value={sender?.key ?? accountId}
                      options={senderOptions}
                      onChange={changeSender}
                      accessibilityLabel={fieldName(t('compose.from'))}
                      trigger={
                        <View style={styles.sender}>
                          <Typography color="secondary" numberOfLines={1} style={styles.senderEmail}>
                            {sender?.email}
                          </Typography>
                          <ChevronDown size={16} color={colors.textTertiary} />
                        </View>
                      }
                    />
                  )}
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
                inputAccessoryViewID={sharedAccessory}
                style={[styles.input, { color: colors.text }]}
              />
            </FieldRow>
            <AttachmentList
              attachments={attachments}
              onRemove={(removed) => setAttachments((current) => current.filter((attachment) => attachment !== removed))}
            />
            <RichBody
              ref={body}
              nativeID={FORMAT_BAR_ID}
              placeholder={t('compose.bodyPlaceholder')}
              onFocusChange={setBodyFocused}
              onTextChange={onBodyText}
              onStateChange={onEditorState}
              onSelectionChange={onSelection}
              onLinkDetected={onLinkDetected}
            />
            {signatureReady && !signatureRemoved && previewHtml ? (
              <View style={styles.signature}>
                <View style={styles.flex}>
                  <HtmlBody html={previewHtml} allowRemoteContent background={colors.background} />
                </View>
                <IconButton round size={32} accessibilityLabel={t('compose.removeSignature')} onPress={() => setSignatureRemoved(true)}>
                  <X size={16} color={colors.textSecondary} />
                </IconButton>
              </View>
            ) : null}
            {quote ? (
              originalHtml ? (
                <View style={styles.quote}>
                  <Typography variant="caption" color="secondary">
                    {quote.trim().split(mode === 'forward' ? '\n\n' : '\n')[0]}
                  </Typography>
                  <View style={[styles.quoted, { borderLeftColor: colors.border }]}>
                    <HtmlBody html={originalHtml} allowRemoteContent={loadRemoteImages} />
                  </View>
                </View>
              ) : (
                <Typography color="secondary" selectable style={styles.quote}>
                  {quote.trim()}
                </Typography>
              )
            ) : null}
          </ScrollView>
          {ios ? (
            <InputAccessoryView key={showCopies ? 'copies' : 'fields'} nativeID={FORMAT_BAR_ID} backgroundColor="transparent">
              {formatBar}
            </InputAccessoryView>
          ) : (
            <View pointerEvents="box-none" style={styles.floatingBar}>
              {formatBar}
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
      <FormatSheets
        panel={panel}
        link={linkTarget?.url ?? null}
        accessoryId={sharedAccessory}
        onClose={closePanel}
        onSize={(px, bold) => {
          body.current?.setStyle({ fontSize: px });
          if (bold && !editorState.bold) body.current?.toggleBold();
        }}
        onColor={(kind, hex) => body.current?.setStyle(kind === 'highlight' ? { backgroundColor: hex } : { foregroundColor: hex })}
        onSaveLink={(url) => {
          const { start, end, text } = linkTarget ?? selection.current;
          body.current?.setLink(start, end, end > start ? text : url, url);
        }}
        onRemoveLink={() => {
          const { start, end } = linkTarget ?? selection.current;
          body.current?.removeLink(start, end);
        }}
      />
      <Sheet visible={attachMenuVisible} onClose={() => setAttachMenuVisible(false)} title={t('compose.attach')}>
        <ActionList
          actions={[
            { key: 'photos', title: t('compose.attachPhotos'), icon: <Images />, onPress: () => void attach('photos') },
            { key: 'files', title: t('compose.attachFiles'), icon: <FolderOpen />, onPress: () => void attach('files') },
          ]}
        />
      </Sheet>
      {NATIVE_CHROME ? (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button icon="xmark" accessibilityLabel={t('common.close')} onPress={close} />
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Menu icon="paperclip" accessibilityLabel={t('compose.attach')}>
              <Stack.Toolbar.MenuAction icon="photo.on.rectangle" onPress={() => void attach('photos')}>
                {t('compose.attachPhotos')}
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction icon="folder" onPress={() => void attach('files')}>
                {t('compose.attachFiles')}
              </Stack.Toolbar.MenuAction>
            </Stack.Toolbar.Menu>
            <Stack.Toolbar.Button
              icon="arrow.up"
              variant="prominent"
              accessibilityLabel={t('compose.send')}
              disabled={sending || forwarding || !prefilled || !hasRecipient}
              onPress={send}
            />
          </Stack.Toolbar>
        </>
      ) : null}
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  headerActions: { flexDirection: 'row', gap: 10 },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  contentAboveBar: { paddingBottom: 40 + FORMAT_BAR_HEIGHT },
  floatingBar: { marginTop: -FORMAT_BAR_HEIGHT },
  title: { marginVertical: 12 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { fontSize: 16, paddingVertical: 12 },
  sender: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 12 },
  senderEmail: { flexShrink: 1 },
  senderPicker: { width: '100%' },
  signature: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, paddingBottom: 16 },
  quote: { gap: 8, paddingBottom: 16 },
  quoted: { borderLeftWidth: 2, paddingLeft: 8 },
});
