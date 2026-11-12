import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader, ViewContainer } from '@/ui/components';
import { goBack } from '@/utils/navigation';

const MAX_CONTENT_WIDTH = 700;

interface Props {
  title: string;
  children: React.ReactNode;
}

export function SettingsPage({ title, children }: Props) {

  return (
    <ViewContainer grouped>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.column}>
          <ScreenHeader title={title} onBack={goBack} />
        </View>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={[styles.column, styles.sections]}>{children}</View>
        </ScrollView>
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingTop: 8, paddingBottom: 40, paddingHorizontal: 16, gap: 28 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  sections: { gap: 28 },
});
