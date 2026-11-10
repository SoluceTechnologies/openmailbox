import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SearchResults } from '@/features/search/SearchResults';
import { NATIVE_CHROME } from '@/ui/nativeChrome';
import { ScreenHeader, TextField, ViewContainer } from '@/ui/components';

export default function SearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState('');

  if (NATIVE_CHROME) {
    return (
      <ViewContainer>
        <SearchResults query={query} />
        <Stack.Screen
          options={{ headerShown: true, title: t('search.title'), headerTransparent: true, headerBackButtonDisplayMode: 'minimal' }}
        />
        <Stack.SearchBar
          placeholder={t('search.placeholder')}
          autoFocus
          hideWhenScrolling={false}
          onChangeText={(event) => setQuery(event.nativeEvent.text)}
          onCancelButtonPress={() => router.back()}
        />
      </ViewContainer>
    );
  }

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
        <SearchResults query={query} />
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: { paddingHorizontal: 16, paddingBottom: 8 },
});
