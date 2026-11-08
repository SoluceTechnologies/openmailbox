import { useCallback, useDeferredValue, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { Search } from 'lucide-react-native';
import type { EmailSummary } from '@openmailbox/mail-core';

import { useSearch } from '@/core/hooks';
import { EmptyState, ScreenHeader, TextField, Typography, ViewContainer } from '@/ui/components';
import { displayName } from '@/utils/addresses';
import { formatListDate } from '@/utils/dates';

function SearchResult({ email, onOpen }: { email: EmailSummary; onOpen: (email: EmailSummary) => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={() => onOpen(email)} style={[styles.result, { borderBottomColor: colors.border }]}>
      <View style={styles.line}>
        <Typography variant="body2" weight={email.isSeen ? '500' : '700'} numberOfLines={1} style={styles.flex}>
          {displayName(email.from[0]) || '—'}
        </Typography>
        <Typography variant="caption" color="secondary">
          {formatListDate(email.receivedAt)}
        </Typography>
      </View>
      <Typography variant="body2" weight="400" numberOfLines={1}>
        {email.subject || '—'}
      </Typography>
      <Typography variant="caption" color="secondary" numberOfLines={2}>
        {email.preview ?? ''}
      </Typography>
    </Pressable>
  );
}

export default function SearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const results = useSearch(deferredQuery);

  const open = useCallback(
    (email: EmailSummary) => router.push({ pathname: '/thread/[threadId]', params: { threadId: email.threadId } }),
    [router],
  );

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScreenHeader onBack={() => router.back()} title={t('search.title')} />
        <View style={styles.field}>
          <TextField
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            placeholder={t('search.placeholder')}
            accessibilityLabel={t('search.placeholder')}
          />
        </View>
        <FlashList
          data={results.data ?? []}
          keyExtractor={(email) => email.id}
          renderItem={({ item }) => <SearchResult email={item} onOpen={open} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            deferredQuery.trim().length > 1 && !results.isFetching ? (
              <EmptyState icon={<Search />} title={t('search.noResults')} description={t('search.localOnly')} />
            ) : null
          }
        />
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: { paddingHorizontal: 16, paddingBottom: 8 },
  result: { paddingHorizontal: 16, paddingVertical: 12, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
