import { useCallback, useDeferredValue, useMemo, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { ChevronRight, Reply, Search } from 'lucide-react-native';
import { Category, type SearchHit, type ThreadSummary } from '@openmailbox/mail-core';

import { useSearch } from '@/core/hooks';
import { ContactAvatar } from '@/features/avatars/ContactAvatar';
import { MailboxPicker } from '@/features/mailboxes/components/MailboxPicker';
import { SwipeableThreadRow } from '@/features/threads/components/SwipeableThreadRow';
import { ThreadActionSheet } from '@/features/threads/components/ThreadActionSheet';
import { useThreadActions } from '@/features/threads/useThreadActions';
import { EmptyState, Typography } from '@/ui/components';
import { SegmentedPicker } from '@/ui/SegmentedPicker';
import { displayName } from '@/utils/addresses';
import { formatListDate } from '@/utils/dates';
import { highlightParts, snippetAround } from '@/utils/highlight';

type Scope = 'all' | 'current';

const threadOfHit = ({ email, mailboxId }: SearchHit): ThreadSummary => ({
  key: `${mailboxId}:${email.id}`,
  threadId: email.threadId,
  mailboxId,
  accountId: email.accountId,
  latest: email,
  messageCount: 1,
  unreadCount: email.isSeen ? 0 : 1,
  isFlagged: email.isFlagged,
  hasAttachment: email.hasAttachment,
  lastReceivedAt: email.receivedAt,
  category: Category.Primary,
});

function Highlighted({ text, query, ...rest }: { text: string; query: string } & ComponentProps<typeof Typography>) {
  const { colors } = useTheme();
  return (
    <Typography {...rest}>
      {highlightParts(text, query).map((part, index) =>
        part.match ? (
          <Typography key={index} style={{ backgroundColor: colors.highlight }}>
            {part.text}
          </Typography>
        ) : (
          part.text
        ),
      )}
    </Typography>
  );
}

function SearchResultRow({ thread, query, onOpen }: { thread: ThreadSummary; query: string; onOpen: (thread: ThreadSummary) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const email = thread.latest;
  const sender = email.from[0];
  const senderName = displayName(sender) || t('threads.unknownSender');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(thread)}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.pressed : colors.background }]}
    >
      <View style={styles.indicator}>
        {!email.isSeen ? (
          <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
        ) : email.isAnswered ? (
          <Reply size={15} strokeWidth={2.5} color={colors.primary} />
        ) : null}
      </View>
      <ContactAvatar email={email.originalSender ?? sender?.email} name={senderName} size={40} />
      <View style={[styles.content, { borderBottomColor: colors.border }]}>
        <View style={styles.line}>
          <Highlighted
            text={senderName}
            query={query}
            numberOfLines={1}
            style={[styles.sender, { color: colors.text, fontWeight: email.isSeen ? '600' : '700' }]}
          />
          <Typography style={[styles.date, { color: colors.textSecondary }]}>{formatListDate(email.receivedAt)}</Typography>
          <ChevronRight size={14} color={colors.textTertiary} />
        </View>
        <Highlighted
          text={email.subject || t('reader.noSubject')}
          query={query}
          numberOfLines={1}
          style={[styles.subject, { color: colors.text }]}
        />
        <Highlighted
          text={snippetAround(email.preview ?? '', query)}
          query={query}
          numberOfLines={2}
          style={[styles.preview, { color: colors.textSecondary }]}
        />
      </View>
    </Pressable>
  );
}

interface SearchResultsProps {
  query: string;
  currentMailboxIds?: string[];
}

export function SearchResults({ query, currentMailboxIds }: SearchResultsProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const [scope, setScope] = useState<Scope>('all');
  const deferredQuery = useDeferredValue(query);
  const results = useSearch(deferredQuery, scope === 'current' && currentMailboxIds ? currentMailboxIds : undefined);
  const threads = useMemo(() => (results.data ?? []).map(threadOfHit), [results.data]);
  const [sheetThread, setSheetThread] = useState<ThreadSummary | null>(null);
  const [moving, setMoving] = useState<ThreadSummary | null>(null);
  const { run, actionsFor, moveTo } = useThreadActions(setMoving);
  const actionsOf = useCallback((thread: ThreadSummary) => actionsFor(thread).filter((action) => action !== 'categorize'), [actionsFor]);

  const open = useCallback(
    (thread: ThreadSummary) =>
      router.push({ pathname: '/thread/[threadId]', params: { threadId: thread.threadId, mailboxId: thread.mailboxId } }),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: ThreadSummary }) => {
      const actions = actionsOf(item);
      return (
        <SwipeableThreadRow thread={item} canArchive={actions.includes('archive')} menuActions={actions} onOpen={open} onAction={run} onMore={setSheetThread}>
          <SearchResultRow thread={item} query={deferredQuery} onOpen={open} />
        </SwipeableThreadRow>
      );
    },
    [actionsOf, open, run, deferredQuery],
  );

  return (
    <>
      <FlashList
        data={threads}
        keyExtractor={(thread) => thread.key}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          <View style={styles.header}>
            {currentMailboxIds ? (
              <View style={styles.scope}>
                <SegmentedPicker
                  accessibilityLabel={t('search.title')}
                  value={scope}
                  onChange={setScope}
                  options={[
                    { value: 'all', label: t('search.allMailboxes') },
                    { value: 'current', label: t('search.currentMailbox') },
                  ]}
                />
              </View>
            ) : null}
            {threads.length > 0 ? (
              <Typography weight="600" style={[styles.section, { color: colors.textSecondary, borderBottomColor: colors.border }]}>
                {t('search.topResults')}
              </Typography>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          deferredQuery.trim().length > 1 && !results.isFetching ? (
            <EmptyState icon={<Search />} title={t('search.noResults')} description={t('search.localOnly')} />
          ) : null
        }
      />
      <ThreadActionSheet
        thread={sheetThread}
        actions={sheetThread ? actionsOf(sheetThread) : []}
        onAction={run}
        onClose={() => setSheetThread(null)}
      />
      <MailboxPicker
        accountId={moving?.accountId}
        excludeMailboxId={moving?.mailboxId}
        visible={moving !== null}
        onSelect={(target) => moving && moveTo(moving, target)}
        onClose={() => setMoving(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 8 },
  scope: { paddingHorizontal: 16, paddingBottom: 16 },
  section: { fontSize: 15, marginHorizontal: 16, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 12 },
  indicator: { width: 22, alignItems: 'center', paddingTop: 16 },
  unreadDot: { width: 9, height: 9, borderRadius: 4.5 },
  content: { flex: 1, marginLeft: 10, paddingRight: 16, paddingBottom: 12, gap: 1, borderBottomWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sender: { flex: 1, fontSize: 16, lineHeight: 21 },
  date: { fontSize: 14, fontWeight: '400' },
  subject: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  preview: { fontSize: 14, lineHeight: 19, fontWeight: '400' },
});
