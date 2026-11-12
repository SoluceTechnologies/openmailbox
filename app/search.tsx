import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SearchResults } from '@/features/search/SearchResults';
import { NATIVE_CHROME, translucentHeader } from '@/ui/nativeChrome';
import { ScreenHeader, TextField, ViewContainer } from '@/ui/components';
import { goBack } from '@/utils/navigation';

export default function SearchScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');

  if (NATIVE_CHROME) {
    return (
      <ViewContainer>
        <SearchResults query={query} />
        <Stack.Screen
          options={{ headerShown: true, title: t('search.title'), ...translucentHeader(colors.background), headerBackButtonDisplayMode: 'minimal' }}
        />
        <Stack.SearchBar
          placeholder={t('search.placeholder')}
          autoFocus
          hideWhenScrolling={false}
          onChangeText={(event) => setQuery(event.nativeEvent.text)}
          onCancelButtonPress={goBack}
        />
      </ViewContainer>
    );
  }

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScreenHeader onBack={goBack} title={t('search.title')} />
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
