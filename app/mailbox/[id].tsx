import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { Inbox } from 'lucide-react-native';
import { MailboxRole, type ThreadSummary } from '@openmailbox/mail-core';

import { BottomBar } from '@/components/BottomBar';
import { useAccounts, useMailboxes, useThreads } from '@/core/hooks';
import { mailCore } from '@/core/mailCore';
import { UNIFIED_SCOPE } from '@/core/queryClient';
import { mailboxName } from '@/features/mailboxes/mailboxPresentation';
import { useIsSyncing, useSyncLabel } from '@/features/sync/useSyncLabel';
import { SwipeableThreadRow } from '@/features/threads/components/SwipeableThreadRow';
import { accountColor } from '@/theme';
import { Button, Chip, EmptyState, ScreenHeader, Spinner, Typography, ViewContainer } from '@/ui/components';

const MINIMUM_REFRESH_MS = 700;

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
  const threads = useThreads(scope, unreadOnly);

  const mailbox = mailboxes.find((candidate) => candidate.id === scope);
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

  const archiveAvailable = useMemo(() => {
    const roles = new Map<string, Set<MailboxRole | undefined>>();
    for (const candidate of mailboxes) {
      roles.set(candidate.accountId, (roles.get(candidate.accountId) ?? new Set()).add(candidate.role));
    }
    return (accountId: string) => {
      const accountRoles = roles.get(accountId);
      return !!accountRoles && (accountRoles.has(MailboxRole.Archive) || accountRoles.has(MailboxRole.All));
    };
  }, [mailboxes]);
  const accentByAccount = useMemo(
    () => new Map(accounts.map((candidate) => [candidate.id, accountColor(candidate.color)])),
    [accounts],
  );
  const showAccountAccent = unified && accounts.length > 1;

  useEffect(() => {
    if (!unified) mailCore().openMailbox(scope).catch(() => undefined);
  }, [scope, unified]);

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
        canArchive={archiveAvailable(item.accountId) && mailbox?.role !== MailboxRole.Archive}
        onOpen={openThread}
      />
    ),
    [showAccountAccent, accentByAccount, archiveAvailable, mailbox?.role, openThread],
  );

  const title = unified ? t('mailboxes.allInboxes') : mailbox ? mailboxName(mailbox, t) : '';
  const subtitle = [unified ? null : account?.displayName, unreadCount > 0 ? t('threads.unreadCount', { count: unreadCount }) : null, syncLabel]
    .filter(Boolean)
    .join(' · ');
  const data = threads.data ?? [];
  const loadOlder = () => {
    for (const candidate of scopedMailboxes) mailCore().loadOlder(candidate.id).catch(() => undefined);
  };

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScreenHeader onBack={() => router.back()} />
        <FlashList
          data={data}
          keyExtractor={(thread) => thread.key}
          renderItem={renderItem}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (threads.hasNextPage && !threads.isFetchingNextPage) threads.fetchNextPage();
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textSecondary} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <Typography variant="h1" numberOfLines={1}>
                {title}
              </Typography>
              {subtitle ? (
                <Typography color="secondary" numberOfLines={1}>
                  {subtitle}
                </Typography>
              ) : null}
              <View style={styles.filters}>
                <Chip small active={!unreadOnly} onPress={() => setUnreadOnly(false)}>
                  {t('threads.filterAll')}
                </Chip>
                <Chip small active={unreadOnly} onPress={() => setUnreadOnly(true)}>
                  {t('threads.filterUnread')}
                </Chip>
              </View>
            </View>
          }
          ListEmptyComponent={
            threads.isLoading ? (
              <EmptyState loading title="" />
            ) : (
              <EmptyState icon={<Inbox />} title={unreadOnly ? t('threads.emptyUnread') : t('threads.empty')} />
            )
          }
          ListFooterComponent={
            threads.isFetchingNextPage ? (
              <Spinner style={styles.footer} />
            ) : !threads.hasNextPage && data.length > 0 && !unreadOnly ? (
              <Button variant="link" title={t('threads.loadOlder')} onPress={loadOlder} style={styles.footer} />
            ) : null
          }
        />
      </SafeAreaView>
      <BottomBar composeAccountId={account?.id} />
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 8, gap: 2 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 12 },
  listContent: { paddingBottom: 120 },
  footer: { marginVertical: 20, alignSelf: 'center' },
});
