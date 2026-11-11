import { useCallback, useDeferredValue, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { ChevronRight, Reply, Search } from 'lucide-react-native';
import type { SearchHit } from '@openmailbox/mail-core';

import { useSearch } from '@/core/hooks';
import { ContactAvatar } from '@/features/avatars/ContactAvatar';
import { EmptyState, Typography } from '@/ui/components';
import { SegmentedPicker } from '@/ui/SegmentedPicker';
import { displayName } from '@/utils/addresses';
import { formatListDate } from '@/utils/dates';
import { highlightParts, snippetAround } from '@/utils/highlight';

type Scope = 'all' | 'current';

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

function SearchResultRow({ hit, query, onOpen }: { hit: SearchHit; query: string; onOpen: (hit: SearchHit) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { email } = hit;
  const sender = email.from[0];
  const senderName = displayName(sender) || t('threads.unknownSender');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(hit)}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.pressed : colors.background }]}
    >
      <View style={styles.indicator}>
        {!email.isSeen ? (
          <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
        ) : email.isAnswered ? (
          <Reply size={15} strokeWidth={2.5} color={colors.primary} />
        ) : null}
      </View>
      <ContactAvatar email={sender?.email} name={senderName} size={40} />
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
  const hits = results.data ?? [];

  const open = useCallback(
    (hit: SearchHit) =>
      router.push({ pathname: '/thread/[threadId]', params: { threadId: hit.email.threadId, mailboxId: hit.mailboxId } }),
    [router],
  );

  return (
    <FlashList
      data={hits}
      keyExtractor={(hit) => hit.email.id}
      renderItem={({ item }) => <SearchResultRow hit={item} query={deferredQuery} onOpen={open} />}
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
          {hits.length > 0 ? (
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
