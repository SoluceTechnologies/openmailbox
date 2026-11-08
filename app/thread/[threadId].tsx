import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Archive, Flag, Forward, Mail, Reply, ReplyAll, Trash2 } from 'lucide-react-native';
import { Keyword, MailboxRole } from '@openmailbox/mail-core';

import { archiveThread, setThreadFlagged, setThreadRead, trashThread, type ThreadReference } from '@/core/actions';
import { useMailboxes, useThreadEmails } from '@/core/hooks';
import { mailCore } from '@/core/mailCore';
import { mailboxName } from '@/features/mailboxes/mailboxPresentation';
import { MessageCard } from '@/features/reader/components/MessageCard';
import type { ComposeMode } from '@/features/composer/prefill';
import { ActionList, EmptyState, IconButton, ScreenHeader, Sheet, Typography, ViewContainer } from '@/ui/components';

export default function ThreadScreen() {
  const { threadId, mailboxId } = useLocalSearchParams<{ threadId: string; mailboxId?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const mailboxes = useMailboxes();
  const emailsQuery = useThreadEmails(threadId, mailboxId);
  const emails = useMemo(() => emailsQuery.data ?? [], [emailsQuery.data]);
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const [replyMenuVisible, setReplyMenuVisible] = useState(false);

  const mailbox = mailboxes.find((candidate) => candidate.id === mailboxId);
  const reference: ThreadReference | null = mailboxId ? { mailboxId, threadId } : null;
  const latest = emails[emails.length - 1];
  const flagged = emails.some((email) => email.isFlagged);
  const unreadIds = emails.filter((email) => !email.isSeen).map((email) => email.id);
  const unreadKey = unreadIds.join(',');

  useEffect(() => {
    if (expanded === null && emails.length > 0) {
      setExpanded(new Set([...emails.filter((email) => !email.isSeen).map((email) => email.id), emails[emails.length - 1].id]));
    }
  }, [emails, expanded]);

  useEffect(() => {
    if (unreadIds.length === 0) return;
    const markRead = reference ? setThreadRead(reference, true) : mailCore().setKeywords(unreadIds, [Keyword.Seen], []);
    markRead.catch(() => undefined);
  }, [unreadKey]);

  const toggle = useCallback((emailId: string) => {
    setExpanded((current) => {
      const next = new Set(current ?? []);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  }, []);

  const compose = (mode: ComposeMode) => {
    setReplyMenuVisible(false);
    if (!latest) return;
    router.push({ pathname: '/compose', params: { mode, emailId: latest.id, threadId, mailboxId: mailboxId ?? '' } });
  };

  const leaveAfter = (action: () => Promise<void>) => {
    action().catch(() => undefined);
    router.back();
  };

  const toolbarIcon = (label: string, icon: ReactNode, onPress: () => void, disabled = false) => (
    <IconButton variant="plain" size={44} accessibilityLabel={label} onPress={onPress} disabled={disabled}>
      {icon}
    </IconButton>
  );

  const canArchive =
    !!reference &&
    mailbox?.role !== MailboxRole.Archive &&
    mailboxes.some((candidate) => candidate.accountId === mailbox?.accountId && (candidate.role === MailboxRole.Archive || candidate.role === MailboxRole.All));

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScreenHeader onBack={() => router.back()} />
        {emailsQuery.isLoading ? (
          <EmptyState loading title="" />
        ) : emails.length === 0 ? (
          <EmptyState title={t('reader.threadGone')} />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.titleBlock}>
              <Typography variant="h3">{latest?.subject || t('reader.noSubject')}</Typography>
              {mailbox ? (
                <Typography variant="caption" color={colors.textSecondary} style={styles.mailbox}>
                  {mailboxName(mailbox, t)}
                </Typography>
              ) : null}
            </View>
            {emails.map((email) => (
              <Fragment key={email.id}>
                <View style={[styles.separator, { backgroundColor: colors.border }]} />
                <MessageCard email={email} expanded={expanded?.has(email.id) ?? false} onToggle={toggle} />
              </Fragment>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
      <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: colors.tabBar, borderTopColor: colors.tabBarBorder }]}>
        {toolbarIcon(t('threads.archive'), <Archive size={22} color={colors.primary} />, () => reference && leaveAfter(() => archiveThread(reference)), !canArchive)}
        {toolbarIcon(t('threads.trash'), <Trash2 size={22} color={colors.primary} />, () => reference && leaveAfter(() => trashThread(reference)), !reference)}
        {toolbarIcon(
          flagged ? t('threads.unflag') : t('threads.flag'),
          <Flag size={22} color={colors.primary} fill={flagged ? colors.primary : 'transparent'} />,
          () => reference && setThreadFlagged(reference, !flagged).catch(() => undefined),
          !reference,
        )}
        {toolbarIcon(t('threads.markUnread'), <Mail size={22} color={colors.primary} />, () => reference && leaveAfter(() => setThreadRead(reference, false)), !reference)}
        {toolbarIcon(t('compose.reply'), <Reply size={22} color={colors.primary} />, () => setReplyMenuVisible(true), !latest)}
      </View>
      <Sheet visible={replyMenuVisible} onClose={() => setReplyMenuVisible(false)} title={t('compose.reply')}>
        <ActionList
          actions={[
            { key: 'reply', title: t('compose.reply'), icon: <Reply />, onPress: () => compose('reply') },
            { key: 'replyAll', title: t('compose.replyAll'), icon: <ReplyAll />, onPress: () => compose('replyAll') },
            { key: 'forward', title: t('compose.forward'), icon: <Forward />, onPress: () => compose('forward') },
          ]}
        />
      </Sheet>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 40 },
  titleBlock: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 },
  mailbox: { marginTop: 4, fontSize: 13 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  toolbar: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
});
