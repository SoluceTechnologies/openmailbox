import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useIsPreview, useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ellipsis, Flag, FolderInput, Forward, Reply, ReplyAll, Trash2 } from 'lucide-react-native';
import { Category, Keyword, type ThreadSummary } from '@openmailbox/mail-core';

import { setThreadRead, type ThreadReference } from '@/core/actions';
import { useMailboxes, useThreadEmails } from '@/core/hooks';
import { mailCore } from '@/core/mailCore';
import { CategoryPicker } from '@/features/categories/CategoryPicker';
import { MailboxPicker } from '@/features/mailboxes/components/MailboxPicker';
import { mailboxName } from '@/features/mailboxes/mailboxPresentation';
import { MessageCard } from '@/features/reader/components/MessageCard';
import type { ComposeMode } from '@/features/composer/prefill';
import { ThreadActionSheet } from '@/features/threads/components/ThreadActionSheet';
import { THREAD_ACTION_PRESENTATION, type ThreadActionId } from '@/features/threads/threadActions';
import { useThreadActions } from '@/features/threads/useThreadActions';
import { ActionList, EmptyState, IconButton, ScreenHeader, Sheet, Typography, ViewContainer } from '@/ui/components';
import { NATIVE_CHROME } from '@/ui/nativeChrome';
import { haptic } from '@/utils/haptics';
import { goBack } from '@/utils/navigation';

const LEAVING_ACTIONS: ThreadActionId[] = ['delete', 'archive', 'moveToInbox', 'junk', 'notJunk', 'markUnread'];
const COMPOSE_ACTIONS: ThreadActionId[] = ['reply', 'replyAll', 'forward'];
const REPLY_MENU: ThreadActionId[] = [
  ...COMPOSE_ACTIONS, 'flag', 'unflag', 'markRead', 'markUnread', 'archive', 'moveToInbox', 'junk', 'notJunk',
];

export default function ThreadScreen() {
  const { threadId, mailboxId } = useLocalSearchParams<{ threadId: string; mailboxId?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const swipeable = useRef<SwipeableMethods>(null);
  const isPreview = useIsPreview();
  const mailboxes = useMailboxes();
  const emailsQuery = useThreadEmails(threadId, mailboxId);
  const emails = useMemo(() => emailsQuery.data ?? [], [emailsQuery.data]);
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const [replyMenuVisible, setReplyMenuVisible] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [moving, setMoving] = useState<ThreadSummary | null>(null);
  const [categorizing, setCategorizing] = useState<ThreadSummary | null>(null);
  const threadActions = useThreadActions(setMoving, setCategorizing);

  const mailbox = mailboxes.find((candidate) => candidate.id === mailboxId);
  const reference: ThreadReference | null = mailboxId ? { mailboxId, threadId } : null;
  const latest = emails[emails.length - 1];
  const flagged = emails.some((email) => email.isFlagged);
  const thread: ThreadSummary | null = useMemo(
    () =>
      latest && mailboxId
        ? {
            key: `${mailboxId}:${threadId}`,
            threadId,
            mailboxId,
            accountId: latest.accountId,
            latest,
            messageCount: emails.length,
            unreadCount: 0,
            isFlagged: flagged,
            hasAttachment: emails.some((email) => email.hasAttachment),
            lastReceivedAt: latest.receivedAt,
            category: Category.Primary,
          }
        : null,
    [latest, mailboxId, threadId, emails, flagged],
  );
  const unreadIds = emails.filter((email) => !email.isSeen).map((email) => email.id);
  const unreadKey = unreadIds.join(',');

  useEffect(() => {
    if (expanded === null && emails.length > 0) {
      setExpanded(new Set([...emails.filter((email) => !email.isSeen).map((email) => email.id), emails[emails.length - 1].id]));
    }
  }, [emails, expanded]);

  useEffect(() => {
    if (unreadIds.length === 0 || isPreview) return;
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

  const leave = async (work: Promise<unknown>) => {
    if ((await work) !== false) goBack();
  };
  const onAction = (action: ThreadActionId, target: ThreadSummary) => {
    const work = threadActions.run(action, target);
    if (!LEAVING_ACTIONS.includes(action)) return;
    if (threadActions.confirms(action, target)) leave(work).catch(() => undefined);
    else goBack();
  };

  const actions = thread ? threadActions.actionsFor(thread) : [];
  const removeAction: ThreadActionId = actions.includes('archive') ? 'archive' : 'delete';
  const runMenuAction = (action: ThreadActionId) => {
    if (COMPOSE_ACTIONS.includes(action)) compose(action as ComposeMode);
    else if (thread) onAction(action, thread);
  };
  const swipeButton = (action: ThreadActionId, color: string) => {
    const { label, Icon } = THREAD_ACTION_PRESENTATION[action];
    return (
      <Pressable
        key={action}
        accessibilityRole="button"
        accessibilityLabel={t(label)}
        onPress={() => {
          swipeable.current?.close();
          runMenuAction(action);
        }}
        style={styles.swipeButton}
      >
        <View style={[styles.swipeCircle, { backgroundColor: color }]}>
          <Icon size={24} color="#ffffff" />
        </View>
        <Typography variant="caption" color="secondary" numberOfLines={1}>
          {t(label)}
        </Typography>
      </Pressable>
    );
  };

  const toolbarIcon = (label: string, icon: ReactNode, onPress: () => void, disabled = false) => (
    <IconButton variant="plain" size={44} accessibilityLabel={label} onPress={onPress} disabled={disabled}>
      {icon}
    </IconButton>
  );

  return (
    <ViewContainer grouped>
      <SafeAreaView edges={NATIVE_CHROME ? [] : ['top']} style={styles.flex}>
        {NATIVE_CHROME ? null : <ScreenHeader onBack={goBack} />}
        {emailsQuery.isLoading ? (
          <EmptyState loading title="" />
        ) : emails.length === 0 ? (
          <EmptyState title={t('reader.threadGone')} />
        ) : (
          <ReanimatedSwipeable
            ref={swipeable}
            containerStyle={styles.flex}
            childrenContainerStyle={styles.flex}
            enabled={!!thread && !isPreview}
            friction={1.5}
            dragOffsetFromLeftEdge={30}
            overshootFriction={8}
            onSwipeableWillOpen={() => haptic()}
            renderLeftActions={() => (
              <View style={styles.swipeButtons} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {swipeButton('markUnread', '#0a84ff')}
              </View>
            )}
            renderRightActions={() => (
              <View style={styles.swipeButtons} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {swipeButton('reply', '#0a84ff')}
                {swipeButton(flagged ? 'unflag' : 'flag', '#ff9500')}
                {swipeButton(removeAction, removeAction === 'archive' ? '#af52de' : '#ff3b30')}
              </View>
            )}
          >
          <ScrollView
            style={styles.flex}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={[styles.content, { backgroundColor: colors.card }]}
          >
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
          </ReanimatedSwipeable>
        )}
      </SafeAreaView>
      {NATIVE_CHROME ? null : (
      <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: colors.tabBar, borderTopColor: colors.tabBarBorder }]}>
        {toolbarIcon(t('threads.delete'), <Trash2 size={22} color={colors.primary} />, () => thread && onAction('delete', thread), !thread)}
        {toolbarIcon(t('threads.move'), <FolderInput size={22} color={colors.primary} />, () => thread && setMoving(thread), !thread)}
        {toolbarIcon(
          flagged ? t('threads.unflag') : t('threads.flag'),
          <Flag size={22} color={colors.primary} fill={flagged ? colors.primary : 'transparent'} />,
          () => thread && onAction(flagged ? 'unflag' : 'flag', thread),
          !thread,
        )}
        {toolbarIcon(t('compose.reply'), <Reply size={22} color={colors.primary} />, () => setReplyMenuVisible(true), !latest)}
        {toolbarIcon(t('threads.more'), <Ellipsis size={22} color={colors.primary} />, () => setSheetVisible(true), !thread)}
      </View>
      )}
      <Sheet visible={replyMenuVisible} onClose={() => setReplyMenuVisible(false)} title={t('compose.reply')}>
        <ActionList
          actions={[
            { key: 'reply', title: t('compose.reply'), icon: <Reply />, onPress: () => compose('reply') },
            { key: 'replyAll', title: t('compose.replyAll'), icon: <ReplyAll />, onPress: () => compose('replyAll') },
            { key: 'forward', title: t('compose.forward'), icon: <Forward />, onPress: () => compose('forward') },
          ]}
        />
      </Sheet>
      <ThreadActionSheet
        thread={sheetVisible ? thread : null}
        actions={thread ? threadActions.actionsFor(thread) : []}
        onAction={onAction}
        onClose={() => setSheetVisible(false)}
      />
      <MailboxPicker
        accountId={moving?.accountId}
        excludeMailboxId={moving?.mailboxId}
        visible={moving !== null}
        onSelect={(target) => {
          if (!moving) return;
          threadActions.moveTo(moving, target);
          goBack();
        }}
        onClose={() => setMoving(null)}
      />
      <CategoryPicker sender={categorizing?.latest.from[0]} onClose={() => setCategorizing(null)} />
      {NATIVE_CHROME && !isPreview ? (
        <>
          <Stack.Screen options={{ headerShown: true, title: '', headerTransparent: true, headerBackButtonDisplayMode: 'minimal' }} />
          <Stack.Toolbar placement="bottom">
            <Stack.Toolbar.Button icon="trash" accessibilityLabel={t('threads.delete')} disabled={!thread} onPress={() => thread && onAction('delete', thread)} />
            <Stack.Toolbar.Button icon="folder" accessibilityLabel={t('threads.move')} disabled={!thread} onPress={() => thread && setMoving(thread)} />
            <Stack.Toolbar.Menu icon="arrowshape.turn.up.left" accessibilityLabel={t('compose.reply')} disabled={!latest}>
              {REPLY_MENU.filter((action) => actions.includes(action) || (!thread && COMPOSE_ACTIONS.includes(action))).map((action) => (
                <Stack.Toolbar.MenuAction key={action} icon={THREAD_ACTION_PRESENTATION[action].symbol} onPress={() => runMenuAction(action)}>
                  {t(THREAD_ACTION_PRESENTATION[action].label)}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
            <Stack.Toolbar.Spacer />
            <Stack.Toolbar.Button
              icon="square.and.pencil"
              accessibilityLabel={t('compose.newMessage')}
              onPress={() => router.push({ pathname: '/compose', params: latest ? { accountId: latest.accountId } : {} })}
            />
          </Stack.Toolbar>
        </>
      ) : null}
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingBottom: 40,
    overflow: 'hidden',
    ...(NATIVE_CHROME ? { borderRadius: 24 } : { borderTopLeftRadius: 24, borderTopRightRadius: 24 }),
  },
  titleBlock: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14 },
  mailbox: { marginTop: 4, fontSize: 13 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  swipeButtons: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  swipeButton: { alignItems: 'center', gap: 6, width: 66 },
  swipeCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  toolbar: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
});
