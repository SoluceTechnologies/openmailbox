import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { Inbox } from 'lucide-react-native';
import { MailboxRole, type ThreadSummary } from '@openmailbox/mail-core';

import { BottomBar } from '@/components/BottomBar';
import { useAccounts, useMailboxes, useThreads } from '@/core/hooks';
import { mailCore } from '@/core/mailCore';
import { UNIFIED_SCOPE } from '@/core/queryClient';
import { CategoryBar } from '@/features/categories/CategoryBar';
import { CategoryPicker } from '@/features/categories/CategoryPicker';
import { categoryOf } from '@/features/categories/categories';
import { MailboxPicker } from '@/features/mailboxes/components/MailboxPicker';
import { mailboxName } from '@/features/mailboxes/mailboxPresentation';
import { SearchResults } from '@/features/search/SearchResults';
import { useIsSyncing, useSyncLabel } from '@/features/sync/useSyncLabel';
import { SwipeableThreadRow } from '@/features/threads/components/SwipeableThreadRow';
import { ThreadActionSheet } from '@/features/threads/components/ThreadActionSheet';
import { ThreadPreview } from '@/features/threads/components/ThreadPreview';
import { SelectionToolbar, useSelectionActions, type MarkAction } from '@/features/threads/components/SelectionToolbar';
import { THREAD_ACTION_PRESENTATION } from '@/features/threads/threadActions';
import { useThreadActions } from '@/features/threads/useThreadActions';
import { useThreadSelection } from '@/features/threads/useThreadSelection';
import { accountColor } from '@/theme';
import { EmptyState, IconButton, ScreenHeader, Spinner, Typography, ViewContainer } from '@/ui/components';
import { SegmentedPicker } from '@/ui/SegmentedPicker';
import { useSettingsStore } from '@/stores/settingsStore';
import { LIQUID_GLASS, NATIVE_CHROME, TRANSLUCENT_HEADER } from '@/ui/nativeChrome';
import { haptic } from '@/utils/haptics';
import { goBack } from '@/utils/navigation';

const MINIMUM_REFRESH_MS = 700;
const MARK_ACTIONS: MarkAction[] = ['markRead', 'markUnread', 'flag', 'unflag'];

function usePullToRefresh(accountIds: string[]) {
  const syncing = useIsSyncing(accountIds);
  const [requestedAt, setRequestedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (requestedAt === null) return;
    const timer = setTimeout(() => setNow(Date.now()), MINIMUM_REFRESH_MS);
    return () => clearTimeout(timer);
  }, [requestedAt]);

  useEffect(() => {
    if (requestedAt !== null && !syncing && now - requestedAt >= MINIMUM_REFRESH_MS) setRequestedAt(null);
  }, [now, requestedAt, syncing]);

  const refresh = useCallback(() => {
    haptic();
    setRequestedAt(Date.now());
    for (const accountId of accountIds) mailCore().syncNow(accountId);
  }, [accountIds]);

  return { refreshing: requestedAt !== null, refresh };
}

export default function MailboxScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scope = id ?? UNIFIED_SCOPE;
  const unified = scope === UNIFIED_SCOPE;
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const accounts = useAccounts();
  const mailboxes = useMailboxes();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const searching = searchActive || query.trim().length > 1;
  const mailbox = mailboxes.find((candidate) => candidate.id === scope);
  const categorized = unified || mailbox?.role === MailboxRole.Inbox;
  const inboxFilter = useSettingsStore((state) => state.inboxFilter);
  const setInboxFilter = useSettingsStore((state) => state.setInboxFilter);
  const threads = useThreads(scope, unreadOnly, categorized ? categoryOf(inboxFilter) : undefined);

  const account = accounts.find((candidate) => candidate.id === mailbox?.accountId);
  const accountIds = useMemo(
    () => (unified ? accounts.map((candidate) => candidate.id) : account ? [account.id] : []),
    [unified, accounts, account],
  );
  const scopedMailboxes = useMemo(
    () => (unified ? mailboxes.filter((candidate) => candidate.role === MailboxRole.Inbox) : mailbox ? [mailbox] : []),
    [unified, mailboxes, mailbox],
  );
  const unreadCount = scopedMailboxes.reduce((total, candidate) => total + candidate.unreadCount, 0);
  const syncLabel = useSyncLabel(accountIds);
  const { refreshing, refresh } = usePullToRefresh(accountIds);

  const accentByAccount = useMemo(
    () => new Map(accounts.map((candidate) => [candidate.id, accountColor(candidate.color)])),
    [accounts],
  );
  const showAccountAccent = unified && accounts.length > 1;

  useEffect(() => {
    if (!unified) mailCore().openMailbox(scope).catch(() => undefined);
  }, [scope, unified]);

  const [previewed, setPreviewed] = useState<ThreadSummary | null>(null);
  const [sheetThread, setSheetThread] = useState<ThreadSummary | null>(null);
  const [moving, setMoving] = useState<ThreadSummary | null>(null);
  const [categorizing, setCategorizing] = useState<ThreadSummary | null>(null);
  const selection = useThreadSelection();
  const selectionActions = useSelectionActions([...selection.selected.values()], selection.end);
  const threadActions = useThreadActions(setMoving, setCategorizing);
  const { run: runThreadAction, actionsFor } = threadActions;

  const openThread = useCallback(
    (thread: ThreadSummary) =>
      router.push({ pathname: '/thread/[threadId]', params: { threadId: thread.threadId, mailboxId: thread.mailboxId } }),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: ThreadSummary }) => (
      <SwipeableThreadRow
        thread={item}
        accountAccent={showAccountAccent ? accentByAccount.get(item.accountId) : undefined}
        canArchive={actionsFor(item).includes('archive')}
        menuActions={selection.active ? undefined : actionsFor(item)}
        onOpen={selection.active ? selection.toggle : openThread}
        onLongPress={setPreviewed}
        onAction={runThreadAction}
        onMore={setSheetThread}
        selected={selection.active ? selection.selected.has(item.key) : undefined}
      />
    ),
    [showAccountAccent, accentByAccount, actionsFor, openThread, runThreadAction, selection.active, selection.selected, selection.toggle],
  );

  const title = unified ? t('mailboxes.allInboxes') : mailbox ? mailboxName(mailbox, t) : '';
  const subtitle = selection.active
    ? t('threads.selectedCount', { count: selection.selected.size })
    : [unified ? null : account?.displayName, unreadCount > 0 ? t('threads.unreadCount', { count: unreadCount }) : null, syncLabel]
    .filter(Boolean)
    .join(' · ');
  const data = threads.data ?? [];
  const compose = () => router.push({ pathname: '/compose', params: account ? { accountId: account.id } : {} });
  const loadOlder = () => {
    for (const candidate of scopedMailboxes) mailCore().loadOlder(candidate.id).catch(() => undefined);
  };

  const list = searching ? (
    <SearchResults query={query} currentMailboxIds={scopedMailboxes.map((candidate) => candidate.id)} />
  ) : (
    <FlashList
      contentInsetAdjustmentBehavior="automatic"
      maintainVisibleContentPosition={{ disabled: true }}
      data={data}
      keyExtractor={(thread) => thread.key}
      renderItem={renderItem}
      extraData={selection.selected}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (threads.hasNextPage && !threads.isFetchingNextPage) threads.fetchNextPage();
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textSecondary} />}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <View style={styles.header}>
          {NATIVE_CHROME ? null : (
            <Typography variant="h1" numberOfLines={1}>
              {title}
            </Typography>
          )}
          {subtitle ? (
            <Typography variant="caption" color={colors.textSecondary} numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Typography>
          ) : null}
          {categorized ? (
            <View style={styles.categories}>
              <CategoryBar value={inboxFilter} onChange={setInboxFilter} />
            </View>
          ) : null}
          <View style={styles.filters}>
            <SegmentedPicker
              accessibilityLabel={t('threads.filter')}
              value={unreadOnly ? 'unread' : 'all'}
              onChange={(filter) => setUnreadOnly(filter === 'unread')}
              options={[
                { value: 'all', label: t('threads.filterAll') },
                { value: 'unread', label: t('threads.filterUnread') },
              ]}
            />
          </View>
        </View>
      }
      ListEmptyComponent={
        threads.isLoading ? (
          <EmptyState loading title="" />
        ) : (
          <EmptyState
            icon={<Inbox />}
            title={unreadOnly ? t('threads.emptyUnread') : t('threads.empty')}
            description={unreadOnly ? undefined : t('threads.emptyHint')}
          />
        )
      }
      ListFooterComponent={
        threads.isFetchingNextPage ? (
          <Spinner style={styles.footer} />
        ) : !threads.hasNextPage && data.length > 0 && !unreadOnly ? (
          <View style={styles.footer}>
            <IconButton glass round size={40} label={t('threads.loadOlder')} onPress={loadOlder} />
          </View>
        ) : null
      }
    />
  );
  const overlays = (
    <>
      <ThreadPreview
        thread={previewed}
        actions={previewed ? threadActions.actionsFor(previewed) : []}
        onAction={threadActions.run}
        onOpen={openThread}
        onClose={() => setPreviewed(null)}
      />
      <ThreadActionSheet
        thread={sheetThread}
        actions={sheetThread ? threadActions.actionsFor(sheetThread) : []}
        onAction={threadActions.run}
        onClose={() => setSheetThread(null)}
      />
      <MailboxPicker
        accountId={moving?.accountId}
        excludeMailboxId={moving?.mailboxId}
        visible={moving !== null}
        onSelect={(target) => moving && threadActions.moveTo(moving, target)}
        onClose={() => setMoving(null)}
      />
      <CategoryPicker sender={categorizing?.latest.from[0]} current={categorizing?.category} onClose={() => setCategorizing(null)} />
    </>
  );

  if (NATIVE_CHROME) {
    const allSelected = data.length > 0 && selection.selected.size === data.length;
    return (
      <>
        {list}
        {overlays}
        {selectionActions.picker}
        <Stack.Screen
          options={{
            headerShown: true,
            title,
            headerLargeTitle: true,
            ...TRANSLUCENT_HEADER,
            headerShadowVisible: false,
            headerLargeTitleShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            headerBackVisible: !selection.active,
          }}
        />
        <Stack.Toolbar placement="right">
          {LIQUID_GLASS || selection.active ? null : (
            <Stack.Toolbar.Button icon="square.and.pencil" accessibilityLabel={t('compose.newMessage')} onPress={compose} />
          )}
          <Stack.Toolbar.Button onPress={selection.active ? selection.end : selection.start} disabled={!selection.active && data.length === 0}>
            {selection.active ? t('threads.selectDone') : t('threads.select')}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
        {selection.active ? (
          <>
            <Stack.Toolbar placement="left">
              <Stack.Toolbar.Button onPress={() => selection.toggleAll(data)}>
                {allSelected ? t('threads.deselectAll') : t('threads.selectAll')}
              </Stack.Toolbar.Button>
            </Stack.Toolbar>
            <Stack.Toolbar placement="bottom">
              <Stack.Toolbar.Menu title={t('threads.mark')} disabled={selectionActions.empty}>
                {MARK_ACTIONS.map((action) => (
                  <Stack.Toolbar.MenuAction key={action} icon={THREAD_ACTION_PRESENTATION[action].symbol} onPress={() => selectionActions.mark(action)}>
                    {t(THREAD_ACTION_PRESENTATION[action].label)}
                  </Stack.Toolbar.MenuAction>
                ))}
              </Stack.Toolbar.Menu>
              <Stack.Toolbar.Spacer />
              <Stack.Toolbar.Button disabled={!selectionActions.canMove} onPress={selectionActions.move}>
                {t('threads.move')}
              </Stack.Toolbar.Button>
              <Stack.Toolbar.Spacer />
              {selectionActions.canArchive ? (
                <Stack.Toolbar.Button onPress={selectionActions.archive}>{t('threads.archive')}</Stack.Toolbar.Button>
              ) : null}
              <Stack.Toolbar.Button tintColor={colors.danger} disabled={selectionActions.empty} onPress={selectionActions.remove}>
                {t('threads.delete')}
              </Stack.Toolbar.Button>
            </Stack.Toolbar>
          </>
        ) : (
          <>
            <Stack.SearchBar
              placeholder={t('search.placeholder')}
              hideWhenScrolling={false}
              onChangeText={(event) => setQuery(event.nativeEvent.text)}
              onFocus={() => setSearchActive(true)}
              onCancelButtonPress={() => {
                setQuery('');
                setSearchActive(false);
              }}
            />
            {LIQUID_GLASS ? (
              <Stack.Toolbar placement="bottom">
                <Stack.Toolbar.SearchBarSlot />
                <Stack.Toolbar.Spacer />
                <Stack.Toolbar.Button icon="square.and.pencil" accessibilityLabel={t('compose.newMessage')} onPress={compose} />
              </Stack.Toolbar>
            ) : null}
          </>
        )}
      </>
    );
  }

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScreenHeader
          onBack={goBack}
          right={
            <IconButton
              glass
              round
              size={40}
              label={selection.active ? t('threads.selectDone') : t('threads.select')}
              onPress={selection.active ? selection.end : selection.start}
              disabled={!selection.active && data.length === 0}
            />
          }
        />
        {list}
      </SafeAreaView>
      {selection.active ? (
        <SelectionToolbar threads={[...selection.selected.values()]} onDone={selection.end} />
      ) : (
        <BottomBar composeAccountId={account?.id} />
      )}
      {overlays}
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  subtitle: { marginTop: 2, fontSize: 13 },
  categories: { marginTop: 14, marginHorizontal: -20 },
  filters: { marginTop: 14, width: 240 },
  listContent: { paddingBottom: 120 },
  footer: { marginVertical: 20, alignSelf: 'center' },
});
